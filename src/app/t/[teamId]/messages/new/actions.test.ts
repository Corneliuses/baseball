import { describe, it, expect, vi, beforeEach } from "vitest";

const requireTeamAccess = vi.fn();
const listTeamMembers = vi.fn();
const createMessage = vi.fn();
const sendEmail = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/memberships", () => ({
  listTeamMembers: (...args: unknown[]) => listTeamMembers(...args),
}));

// Only the write is mocked — resolveRecipients and the schemas run for real,
// so these tests also exercise the audience matrix end-to-end through the
// action, not a stand-in for it.
vi.mock("@/lib/messages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/messages")>();
  return {
    ...actual,
    createMessage: (...args: unknown[]) => createMessage(...args),
  };
});

vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: vi.fn().mockResolvedValue({ id: "team-1", name: "Cubs" }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// redirect() throws in Next; reproduce that so control flow matches
// production — same shape as roster/invite/actions.test.ts.
const REDIRECT_PREFIX = "NEXT_REDIRECT:";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT:")) {
      throw error;
    }
  },
}));

import { TeamAccessError } from "@/lib/team-access";
import { sendTeamMessageAction } from "./actions";
import { COMPOSE_INITIAL_STATE, type ComposeState } from "./compose-state";

/// The action is shaped for `useActionState`, so it takes the previous state
/// ahead of the form. A refusal now *returns* that state rather than
/// redirecting, so a five-thousand-character body survives a bad subject.
function send(data: FormData): Promise<ComposeState> {
  return sendTeamMessageAction(COMPOSE_INITIAL_STATE, data);
}

/// Narrows to the refused shape, failing the test rather than the type checker
/// when a call unexpectedly went through.
function refusal(state: ComposeState) {
  expect(state.status).toBe("invalid");
  if (state.status !== "invalid") throw new Error("unreachable");
  return state;
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

async function redirectUrlOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(REDIRECT_PREFIX)) {
      return error.message.slice(REDIRECT_PREFIX.length);
    }
    throw error;
  }
  throw new Error("expected a redirect");
}

const MEMBERS = [
  {
    userId: "u-owner",
    role: "OWNER",
    name: "Pat Owner",
    email: "owner@example.com",
    phone: null,
  },
  {
    userId: "u-coach",
    role: "COACH",
    name: "Casey Coach",
    email: "coach@example.com",
    phone: null,
  },
  {
    userId: "u-parent-a",
    role: "PARENT",
    name: "Alex Parent",
    email: "alex@example.com",
    phone: null,
  },
  {
    userId: "u-parent-b",
    role: "PARENT",
    name: null,
    email: "blake@example.com",
    phone: null,
  },
];

const BROADCAST = {
  teamId: "team-1",
  audience: "ALL_PARENTS",
  subject: "Game moved",
  body: "Saturday's game is now at 5pm.",
};

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "u-coach" });
  listTeamMembers.mockResolvedValue(MEMBERS);
  createMessage.mockResolvedValue({ id: "msg-1" });
  sendEmail.mockResolvedValue({ ok: true });
});

describe("sendTeamMessageAction — coach broadcast", () => {
  it("persists the Message row and emails every parent individually", async () => {
    const url = await redirectUrlOf(send(form(BROADCAST)));

    expect(url).toBe("/t/team-1/messages/new?sent=2");
    expect(createMessage).toHaveBeenCalledWith(
      "team-1",
      "u-coach",
      "Game moved",
      "Saturday's game is now at 5pm.",
    );
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail.mock.calls.map((call) => call[0].to)).toEqual([
      "alex@example.com",
      "blake@example.com",
    ]);
  });

  it("gates the coach audiences behind minRole COACH and intent write", async () => {
    await redirectUrlOf(send(form(BROADCAST)));

    // team-access.test.ts proves a PARENT fails this gate and an archived
    // team rejects the write; this pins that the action actually asks.
    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", {
      intent: "write",
      minRole: "COACH",
    });
  });

  it("prefixes the subject with the team name and sets Reply-To to the sender", async () => {
    await redirectUrlOf(send(form(BROADCAST)));

    const first = sendEmail.mock.calls[0][0];
    expect(first.subject).toBe("[Cubs] Game moved");
    expect(first.replyTo).toBe("coach@example.com");
  });

  it("carries a List-Unsubscribe pointing at the sending coach", async () => {
    await redirectUrlOf(send(form(BROADCAST)));

    // The broadcast is the only shape that is list mail, and the coach is
    // the human who can actually act on the request. email.ts owns the
    // RFC 2369 framing, so the action passes a bare address.
    for (const call of sendEmail.mock.calls) {
      expect(call[0].listUnsubscribe).toBe("coach@example.com");
    }
  });

  it("writes the row before sending, so a failed tail keeps the record", async () => {
    sendEmail
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, reason: "rate limited" });

    const url = await redirectUrlOf(send(form(BROADCAST)));

    expect(url).toBe("/t/team-1/messages/new?sent=1&failed=1");
    expect(createMessage).toHaveBeenCalledTimes(1);
  });

  it("reports no-recipients before writing when the team has no parents", async () => {
    listTeamMembers.mockResolvedValue(
      MEMBERS.filter((m) => m.role !== "PARENT"),
    );

    const state = refusal(await send(form(BROADCAST)));

    expect(state.code).toBe("no-recipients");
    // Still holding the coach's words: "there's nobody to email yet" is a
    // reason to come back later, not a reason to lose the message.
    expect(state.values.body).toBe(BROADCAST.body);
    expect(createMessage).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("sendTeamMessageAction — coach to one parent", () => {
  it("emails only the target and persists nothing", async () => {
    const url = await redirectUrlOf(
      send(
        form({
          ...BROADCAST,
          audience: "INDIVIDUAL_PARENT",
          targetUserId: "u-parent-b",
        }),
      ),
    );

    expect(url).toBe("/t/team-1/messages/new?sent=1");
    expect(createMessage).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe("blake@example.com");
    // One-to-one mail is not a list to leave.
    expect(sendEmail.mock.calls[0][0]).not.toHaveProperty("listUnsubscribe");
  });

  it("rejects a target who is not a parent on this team, before sending", async () => {
    for (const targetUserId of ["u-owner", "u-stranger"]) {
      sendEmail.mockClear();

      const state = refusal(
        await send(
          form({ ...BROADCAST, audience: "INDIVIDUAL_PARENT", targetUserId }),
        ),
      );

      expect(state.code).toBe("invalid-target");
      expect(sendEmail).not.toHaveBeenCalled();
    }
  });
});

describe("sendTeamMessageAction — parent to the coaching staff", () => {
  beforeEach(() => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "u-parent-a" });
  });

  it("emails every coach, persists nothing, and only needs PARENT access", async () => {
    const url = await redirectUrlOf(
      send(form({ ...BROADCAST, audience: "ALL_COACHES" })),
    );

    expect(url).toBe("/t/team-1/messages/new?sent=2");
    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", {
      intent: "write",
      minRole: "PARENT",
    });
    expect(createMessage).not.toHaveBeenCalled();
    expect(sendEmail.mock.calls.map((call) => call[0].to)).toEqual([
      "owner@example.com",
      "coach@example.com",
    ]);
    expect(sendEmail.mock.calls[0][0].replyTo).toBe("alex@example.com");
    // A parent writing the staff is correspondence, not a mailing list.
    expect(sendEmail.mock.calls[0][0]).not.toHaveProperty("listUnsubscribe");
  });

  // Belt and suspenders: even if the requireTeamAccess gate were somehow
  // passed, the pure resolver still refuses a parent addressing parents —
  // the no-parent-to-parent rule does not depend on a single check.
  it("refuses a forged parent-audience POST at the resolver too", async () => {
    for (const audience of ["ALL_PARENTS", "INDIVIDUAL_PARENT"] as const) {
      const state = refusal(
        await send(
          form({ ...BROADCAST, audience, targetUserId: "u-parent-b" }),
        ),
      );

      expect(state.code).toBe("forbidden-audience");
    }
    expect(sendEmail).not.toHaveBeenCalled();
    expect(createMessage).not.toHaveBeenCalled();
  });
});

describe("sendTeamMessageAction — validation and access", () => {
  it("rejects a missing or over-long subject before any lookup", async () => {
    for (const subject of ["   ", "x".repeat(201)]) {
      const state = refusal(await send(form({ ...BROADCAST, subject })));
      expect(state.code).toBe("invalid-subject");
      expect(state.field).toBe("subject");
      // The body comes back untouched — the whole point of returning rather
      // than redirecting.
      expect(state.values.body).toBe(BROADCAST.body);
    }
    expect(requireTeamAccess).not.toHaveBeenCalled();
  });

  it("rejects a missing or over-long body before any lookup", async () => {
    for (const body of ["", "x".repeat(5001)]) {
      const state = refusal(await send(form({ ...BROADCAST, body })));
      expect(state.code).toBe("invalid-body");
      expect(state.field).toBe("body");
    }
    expect(requireTeamAccess).not.toHaveBeenCalled();
  });

  it("rejects an unknown audience value", async () => {
    const state = refusal(await send(form({ ...BROADCAST, audience: "EVERYONE" })));

    expect(state.code).toBe("invalid-audience");
    expect(requireTeamAccess).not.toHaveBeenCalled();
  });

  // requireTeamAccess just proved the caller holds a membership on this
  // team, so an empty listTeamMembers result can only mean its read
  // silently failed (it swallows DB errors for its read-only callers) — not
  // that the team truly has nobody in it. That must not surface as a
  // misleading "nobody to email" redirect; it has to fail closed, matching
  // team-access.ts's own stance on its lookup.
  it("throws rather than misreporting a listTeamMembers failure as no-recipients", async () => {
    listTeamMembers.mockResolvedValue([]);

    await expect(send(form(BROADCAST))).rejects.toThrow(
      "Failed to load team members for messaging",
    );
    expect(createMessage).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("redirects to access error when the caller lacks access", async () => {
    requireTeamAccess.mockRejectedValue(
      new TeamAccessError("denied", "archived"),
    );

    const url = await redirectUrlOf(send(form(BROADCAST)));

    expect(url).toBe("/t/team-1/messages/new?error=access");
    expect(createMessage).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
