import { describe, it, expect, vi, beforeEach } from "vitest";

const requireTeamAccess = vi.fn();
const getRosterEntry = vi.fn();
const linkGuardian = vi.fn();
const sendEmail = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/roster", () => ({
  getRosterEntry: (...args: unknown[]) => getRosterEntry(...args),
}));

vi.mock("@/lib/invitations", () => ({
  linkGuardian: (...args: unknown[]) => linkGuardian(...args),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: vi.fn().mockResolvedValue({ id: "team-1", name: "Cubs" }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// redirect() throws in Next; reproduce that so control flow matches
// production — same shape as ../actions.test.ts. Only the access path still
// redirects now, but that path is exactly the one worth keeping honest.
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
import { bulkInviteGuardiansAction } from "./actions";
import {
  BULK_INVITE_INITIAL_STATE,
  type BulkInviteState,
} from "./bulk-invite-state";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

/// The action is shaped for `useActionState`, so every call carries the previous
/// state. Nothing in it reads that argument today — the batch is decided
/// entirely by the submitted form — but passing the real initial state keeps
/// these calls the same shape React makes.
function submit(data: FormData): Promise<BulkInviteState> {
  return bulkInviteGuardiansAction(BULK_INVITE_INITIAL_STATE, data);
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

/// Narrows to the finished shape, failing the test rather than the type checker
/// when a call came back rejected instead.
function outcomesOf(state: BulkInviteState) {
  expect(state.status).toBe("done");
  if (state.status !== "done") throw new Error("unreachable");
  return state.outcomes;
}

function invalidOf(state: BulkInviteState) {
  expect(state.status).toBe("invalid");
  if (state.status !== "invalid") throw new Error("unreachable");
  return state;
}

function entryFor(id: string, playerId: string) {
  return {
    id,
    jerseyNumber: null,
    // Named per entry so the outcome list can be checked for *which* kid, which
    // is the entire point of the rewrite.
    player: { id: playerId, name: `Kid ${id}`, dateOfBirth: null },
    guardians: [],
  };
}

const INVITATION = {
  token: "tok-1",
  role: "PARENT",
  expiresAt: new Date("2026-09-01T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "coach-1" });
  getRosterEntry.mockImplementation(async (_teamId: string, entryId: string) =>
    entryFor(entryId, `player-of-${entryId}`),
  );
  linkGuardian.mockImplementation(async ({ email }: { email: string }) => ({
    userId: "user-x",
    email,
    membershipCreated: true,
    invitation: INVITATION,
  }));
  sendEmail.mockResolvedValue({ ok: true });
});

describe("bulkInviteGuardiansAction sending", () => {
  it("links and emails every filled row, skipping blanks", async () => {
    const outcomes = outcomesOf(
      await submit(
        form({
          teamId: "team-1",
          "email-entry-1": "a@example.com",
          "email-entry-2": "",
          "email-entry-3": "b@example.com",
        }),
      ),
    );

    expect(outcomes).toHaveLength(2);
    expect(outcomes.every((row) => row.outcome === "sent")).toBe(true);
    expect(linkGuardian).toHaveBeenCalledTimes(2);
    expect(linkGuardian).toHaveBeenCalledWith({
      teamId: "team-1",
      playerId: "player-of-entry-1",
      email: "a@example.com",
    });
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("names the player on every row it reports", async () => {
    // The whole complaint in C5: the old action returned three integers, and a
    // coach reading "3 could not be invited" had no way to learn which three.
    const outcomes = outcomesOf(
      await submit(form({ teamId: "team-1", "email-entry-7": "a@example.com" })),
    );

    expect(outcomes[0]).toMatchObject({
      entryId: "entry-7",
      playerName: "Kid entry-7",
      email: "a@example.com",
      outcome: "sent",
    });
  });

  it("derives playerId from the teamId-scoped entry, never the form", async () => {
    await submit(form({ teamId: "team-1", "email-entry-1": "a@example.com" }));

    expect(getRosterEntry).toHaveBeenCalledWith("team-1", "entry-1");
  });

  it("passes the coach's message into each email and omits it when blank", async () => {
    await submit(
      form({
        teamId: "team-1",
        message: "  See you at the field!  ",
        "email-entry-1": "a@example.com",
      }),
    );

    const withMessage = sendEmail.mock.calls[0][0];
    expect(JSON.stringify(withMessage.react)).toContain("See you at the field!");

    sendEmail.mockClear();
    await submit(
      form({ teamId: "team-1", message: "   ", "email-entry-1": "a@example.com" }),
    );
    const without = sendEmail.mock.calls[0][0];
    expect(JSON.stringify(without.react)).not.toContain("whiteSpace");
  });

  it("keeps only the first row per entry, so a forged POST can't fan out", async () => {
    const data = new FormData();
    data.set("teamId", "team-1");
    data.append("email-entry-1", "a@example.com");
    data.append("email-entry-1", "attacker@example.com");

    const outcomes = outcomesOf(await submit(data));

    expect(outcomes).toHaveLength(1);
    expect(linkGuardian).toHaveBeenCalledTimes(1);
    expect(linkGuardian).toHaveBeenCalledWith(
      expect.objectContaining({ email: "a@example.com" }),
    );
  });

  it("reports an already-member guardian as linked without emailing", async () => {
    linkGuardian.mockResolvedValueOnce({
      userId: "user-x",
      email: "a@example.com",
      membershipCreated: false,
      invitation: null,
    });

    const outcomes = outcomesOf(
      await submit(form({ teamId: "team-1", "email-entry-1": "a@example.com" })),
    );

    expect(outcomes[0].outcome).toBe("linked");
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("bulkInviteGuardiansAction validation", () => {
  it("names the row whose address is malformed instead of failing the batch blindly", async () => {
    const state = invalidOf(
      await submit(
        form({
          teamId: "team-1",
          "email-entry-1": "a@example.com",
          "email-entry-2": "not-an-email",
        }),
      ),
    );

    expect(Object.keys(state.rowErrors)).toEqual(["entry-2"]);
    expect(state.rowErrors["entry-2"]).toMatch(/email address/i);
  });

  it("sends nothing at all when one row is bad", async () => {
    // All-or-nothing on purpose: sending the good rows would leave the coach
    // resubmitting a form whose other rows may or may not have already gone
    // out. "Nothing was sent" has to stay true for the retry to be safe.
    await submit(
      form({
        teamId: "team-1",
        "email-entry-1": "a@example.com",
        "email-entry-2": "not-an-email",
      }),
    );

    expect(linkGuardian).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("hands back everything typed, blank rows included", async () => {
    // The old redirect blanked fifteen addresses to report one typo. This is
    // the half that made the missing row name expensive.
    const state = invalidOf(
      await submit(
        form({
          teamId: "team-1",
          message: "See you there",
          "email-entry-1": "a@example.com",
          "email-entry-2": "nope",
          "email-entry-3": "",
        }),
      ),
    );

    expect(state.values.emails).toEqual({
      "entry-1": "a@example.com",
      "entry-2": "nope",
      "entry-3": "",
    });
    expect(state.values.message).toBe("See you there");
  });

  it("rejects an over-long message and states the limit", async () => {
    const state = invalidOf(
      await submit(
        form({
          teamId: "team-1",
          message: "x".repeat(1001),
          "email-entry-1": "a@example.com",
        }),
      ),
    );

    expect(state.message).toContain("1,000");
    expect(linkGuardian).not.toHaveBeenCalled();
  });

  it("rejects a batch with every row blank", async () => {
    const state = invalidOf(await submit(form({ teamId: "team-1", "email-entry-1": " " })));

    expect(state.message).toMatch(/blank/i);
    expect(linkGuardian).not.toHaveBeenCalled();
  });

  it("rejects an oversized batch and states the cap", async () => {
    const data = new FormData();
    data.set("teamId", "team-1");
    for (let i = 0; i < 31; i += 1) {
      data.set(`email-entry-${i}`, `parent${i}@example.com`);
    }

    const state = invalidOf(await submit(data));

    expect(state.message).toContain("30");
    expect(linkGuardian).not.toHaveBeenCalled();
  });
});

describe("bulkInviteGuardiansAction partial failures", () => {
  it("one failed send doesn't lose the rest of the batch", async () => {
    sendEmail
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });

    const outcomes = outcomesOf(
      await submit(
        form({
          teamId: "team-1",
          "email-entry-1": "a@example.com",
          "email-entry-2": "b@example.com",
        }),
      ),
    );

    expect(outcomes.map((row) => row.outcome)).toEqual(["failed", "sent"]);
    // The invitation row survives a failed send, so the fix is a resend from
    // the player's page — the reason has to point there.
    expect(outcomes[0].reason).toMatch(/player's page/i);
  });

  it("reports a vanished entry by name-less row and continues", async () => {
    getRosterEntry
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(entryFor("entry-2", "player-2"));

    const outcomes = outcomesOf(
      await submit(
        form({
          teamId: "team-1",
          "email-entry-1": "a@example.com",
          "email-entry-2": "b@example.com",
        }),
      ),
    );

    expect(outcomes[0]).toMatchObject({
      outcome: "failed",
      playerName: null,
      email: "a@example.com",
    });
    expect(outcomes[0].reason).toMatch(/no longer on the roster/i);
    expect(outcomes[1].outcome).toBe("sent");
    expect(linkGuardian).toHaveBeenCalledTimes(1);
  });

  it("a thrown row is reported as failed, not a 500", async () => {
    linkGuardian
      .mockRejectedValueOnce(new Error("db blinked"))
      .mockImplementationOnce(async ({ email }: { email: string }) => ({
        userId: "user-x",
        email,
        membershipCreated: true,
        invitation: INVITATION,
      }));

    const outcomes = outcomesOf(
      await submit(
        form({
          teamId: "team-1",
          "email-entry-1": "a@example.com",
          "email-entry-2": "b@example.com",
        }),
      ),
    );

    expect(outcomes.map((row) => row.outcome)).toEqual(["failed", "sent"]);
  });
});

describe("bulkInviteGuardiansAction access", () => {
  it("redirects rather than answering inside a form the coach can no longer use", async () => {
    requireTeamAccess.mockRejectedValue(
      new TeamAccessError("denied", "insufficient-role"),
    );

    const url = await redirectUrlOf(
      submit(form({ teamId: "team-1", "email-entry-1": "a@example.com" })),
    );

    expect(url).toBe("/t/team-1/roster/invite?error=access");
    expect(linkGuardian).not.toHaveBeenCalled();
  });
});
