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
// production — same shape as ../actions.test.ts.
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

function entryFor(id: string, playerId: string) {
  return {
    id,
    jerseyNumber: null,
    player: { id: playerId, name: "Kid", dateOfBirth: null },
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

describe("bulkInviteGuardiansAction", () => {
  it("links and emails every filled row, skipping blanks", async () => {
    const url = await redirectUrlOf(
      bulkInviteGuardiansAction(
        form({
          teamId: "team-1",
          "email-entry-1": "a@example.com",
          "email-entry-2": "",
          "email-entry-3": "b@example.com",
        }),
      ),
    );

    expect(url).toBe("/t/team-1/roster/invite?sent=2");
    expect(linkGuardian).toHaveBeenCalledTimes(2);
    expect(linkGuardian).toHaveBeenCalledWith({
      teamId: "team-1",
      playerId: "player-of-entry-1",
      email: "a@example.com",
    });
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("derives playerId from the teamId-scoped entry, never the form", async () => {
    await redirectUrlOf(
      bulkInviteGuardiansAction(
        form({ teamId: "team-1", "email-entry-1": "a@example.com" }),
      ),
    );

    expect(getRosterEntry).toHaveBeenCalledWith("team-1", "entry-1");
  });

  it("passes the coach's message into each email and omits it when blank", async () => {
    await redirectUrlOf(
      bulkInviteGuardiansAction(
        form({
          teamId: "team-1",
          message: "  See you at the field!  ",
          "email-entry-1": "a@example.com",
        }),
      ),
    );

    const withMessage = sendEmail.mock.calls[0][0];
    expect(JSON.stringify(withMessage.react)).toContain("See you at the field!");

    sendEmail.mockClear();
    await redirectUrlOf(
      bulkInviteGuardiansAction(
        form({ teamId: "team-1", message: "   ", "email-entry-1": "a@example.com" }),
      ),
    );
    const without = sendEmail.mock.calls[0][0];
    expect(JSON.stringify(without.react)).not.toContain("whiteSpace");
  });

  it("rejects the whole batch before writing when any address is invalid", async () => {
    const url = await redirectUrlOf(
      bulkInviteGuardiansAction(
        form({
          teamId: "team-1",
          "email-entry-1": "a@example.com",
          "email-entry-2": "not-an-email",
        }),
      ),
    );

    expect(url).toBe("/t/team-1/roster/invite?error=invalid-email");
    expect(linkGuardian).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("rejects an over-long message before writing", async () => {
    const url = await redirectUrlOf(
      bulkInviteGuardiansAction(
        form({
          teamId: "team-1",
          message: "x".repeat(1001),
          "email-entry-1": "a@example.com",
        }),
      ),
    );

    expect(url).toBe("/t/team-1/roster/invite?error=invalid-message");
    expect(linkGuardian).not.toHaveBeenCalled();
  });

  it("redirects with no-emails when every row is blank", async () => {
    const url = await redirectUrlOf(
      bulkInviteGuardiansAction(form({ teamId: "team-1", "email-entry-1": " " })),
    );

    expect(url).toBe("/t/team-1/roster/invite?error=no-emails");
  });

  it("keeps only the first row per entry, so a forged POST can't fan out", async () => {
    const data = new FormData();
    data.set("teamId", "team-1");
    data.append("email-entry-1", "a@example.com");
    data.append("email-entry-1", "attacker@example.com");

    const url = await redirectUrlOf(bulkInviteGuardiansAction(data));

    expect(url).toBe("/t/team-1/roster/invite?sent=1");
    expect(linkGuardian).toHaveBeenCalledTimes(1);
    expect(linkGuardian).toHaveBeenCalledWith(
      expect.objectContaining({ email: "a@example.com" }),
    );
  });

  it("rejects an oversized batch before writing", async () => {
    const data = new FormData();
    data.set("teamId", "team-1");
    for (let i = 0; i < 31; i += 1) {
      data.set(`email-entry-${i}`, `parent${i}@example.com`);
    }

    const url = await redirectUrlOf(bulkInviteGuardiansAction(data));

    expect(url).toBe("/t/team-1/roster/invite?error=too-many");
    expect(linkGuardian).not.toHaveBeenCalled();
  });

  it("counts an already-member guardian as linked without emailing", async () => {
    linkGuardian.mockResolvedValueOnce({
      userId: "user-x",
      email: "a@example.com",
      membershipCreated: false,
      invitation: null,
    });

    const url = await redirectUrlOf(
      bulkInviteGuardiansAction(
        form({ teamId: "team-1", "email-entry-1": "a@example.com" }),
      ),
    );

    expect(url).toBe("/t/team-1/roster/invite?linked=1");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("one failed row doesn't lose the rest of the batch", async () => {
    sendEmail
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });

    const url = await redirectUrlOf(
      bulkInviteGuardiansAction(
        form({
          teamId: "team-1",
          "email-entry-1": "a@example.com",
          "email-entry-2": "b@example.com",
        }),
      ),
    );

    expect(url).toBe("/t/team-1/roster/invite?sent=1&failed=1");
  });

  it("counts a vanished entry as failed and continues", async () => {
    getRosterEntry
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(entryFor("entry-2", "player-2"));

    const url = await redirectUrlOf(
      bulkInviteGuardiansAction(
        form({
          teamId: "team-1",
          "email-entry-1": "a@example.com",
          "email-entry-2": "b@example.com",
        }),
      ),
    );

    expect(url).toBe("/t/team-1/roster/invite?sent=1&failed=1");
    expect(linkGuardian).toHaveBeenCalledTimes(1);
  });

  it("a thrown row is counted as failed, not a 500", async () => {
    linkGuardian
      .mockRejectedValueOnce(new Error("db blinked"))
      .mockImplementationOnce(async ({ email }: { email: string }) => ({
        userId: "user-x",
        email,
        membershipCreated: true,
        invitation: INVITATION,
      }));

    const url = await redirectUrlOf(
      bulkInviteGuardiansAction(
        form({
          teamId: "team-1",
          "email-entry-1": "a@example.com",
          "email-entry-2": "b@example.com",
        }),
      ),
    );

    expect(url).toBe("/t/team-1/roster/invite?sent=1&failed=1");
  });

  it("redirects to access error when the caller lacks coach access", async () => {
    requireTeamAccess.mockRejectedValue(new TeamAccessError("denied", "insufficient-role"));

    const url = await redirectUrlOf(
      bulkInviteGuardiansAction(
        form({ teamId: "team-1", "email-entry-1": "a@example.com" }),
      ),
    );

    expect(url).toBe("/t/team-1/roster/invite?error=access");
    expect(linkGuardian).not.toHaveBeenCalled();
  });
});
