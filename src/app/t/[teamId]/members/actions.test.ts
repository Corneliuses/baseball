import { describe, it, expect, vi, beforeEach } from "vitest";

const requireTeamAccess = vi.fn();
const createInvitation = vi.fn();
const getTeamInvitation = vi.fn();
const revokeInvitation = vi.fn();
const setMemberRole = vi.fn();
const removeMember = vi.fn();
const sendEmail = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/invitations", () => ({
  createInvitation: (...args: unknown[]) => createInvitation(...args),
  getTeamInvitation: (...args: unknown[]) => getTeamInvitation(...args),
  revokeInvitation: (...args: unknown[]) => revokeInvitation(...args),
}));

vi.mock("@/lib/memberships", () => ({
  setMemberRole: (...args: unknown[]) => setMemberRole(...args),
  removeMember: (...args: unknown[]) => removeMember(...args),
  LastOwnerError: class LastOwnerError extends Error {},
}));

vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: vi.fn().mockResolvedValue({ id: "team-1", name: "Cubs" }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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
import { LastOwnerError } from "@/lib/memberships";
import {
  removeMemberAction,
  resendInvitationAction,
  revokeInvitationAction,
  setMemberRoleAction,
} from "./actions";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

async function redirectUrlOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith(REDIRECT_PREFIX)) {
      return message.slice(REDIRECT_PREFIX.length);
    }
    throw error;
  }
  throw new Error("expected a redirect");
}

const PENDING = {
  id: "inv-1",
  email: "coach@example.com",
  role: "COACH" as const,
  expiresAt: new Date("2026-05-01"),
  acceptedAt: null,
  createdAt: new Date("2026-04-01"),
};

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "OWNER", userId: "owner-1" });
  getTeamInvitation.mockResolvedValue(PENDING);
  revokeInvitation.mockResolvedValue(true);
  createInvitation.mockResolvedValue({
    token: "tok-new",
    role: "COACH",
    expiresAt: new Date("2026-05-15"),
  });
  setMemberRole.mockResolvedValue(undefined);
  removeMember.mockResolvedValue(true);
  sendEmail.mockResolvedValue({ ok: true });
});

describe("setMemberRoleAction", () => {
  it("says the save happened, which it never used to", async () => {
    // It redirected with no param at all, so a successful change looked
    // exactly like a click that did nothing (C7).
    const url = await redirectUrlOf(() =>
      setMemberRoleAction(
        form({ teamId: "team-1", userId: "user-2", role: "COACH" }),
      ),
    );

    expect(url).toBe("/t/team-1/members?role-saved=1");
    expect(setMemberRole).toHaveBeenCalledWith("team-1", "user-2", "COACH");
  });
});

describe("removeMemberAction", () => {
  it("removes the member and says so", async () => {
    const url = await redirectUrlOf(() =>
      removeMemberAction(form({ teamId: "team-1", userId: "user-2" })),
    );

    expect(url).toBe("/t/team-1/members?removed=1");
    expect(removeMember).toHaveBeenCalledWith("team-1", "user-2");
  });

  it("requires owner access with write intent", async () => {
    // Write intent is what makes an archived team reject this, owner or not.
    await redirectUrlOf(() =>
      removeMemberAction(form({ teamId: "team-1", userId: "user-2" })),
    );

    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", {
      intent: "write",
      minRole: "OWNER",
    });
  });

  it("redirects to the access error when the caller is not an owner", async () => {
    requireTeamAccess.mockRejectedValue(
      new TeamAccessError("denied", "insufficient-role"),
    );

    const url = await redirectUrlOf(() =>
      removeMemberAction(form({ teamId: "team-1", userId: "user-2" })),
    );

    expect(url).toBe("/t/team-1/members?error=access");
    expect(removeMember).not.toHaveBeenCalled();
  });

  it("reports the last-owner refusal instead of crashing", async () => {
    removeMember.mockRejectedValue(new LastOwnerError());

    const url = await redirectUrlOf(() =>
      removeMemberAction(form({ teamId: "team-1", userId: "owner-1" })),
    );

    expect(url).toBe("/t/team-1/members?error=last-owner");
  });

  it("does not claim success when nothing was removed", async () => {
    // A second tab may have removed the row a moment ago; the list re-renders
    // and shows the truth either way.
    removeMember.mockResolvedValue(false);

    const url = await redirectUrlOf(() =>
      removeMemberAction(form({ teamId: "team-1", userId: "user-2" })),
    );

    expect(url).toBe("/t/team-1/members");
  });

  it("sends an owner who removed themselves to the team list", async () => {
    // requireTeamAccess resolves the caller as owner-1; removing that same
    // membership means the members page can no longer be read.
    const url = await redirectUrlOf(() =>
      removeMemberAction(form({ teamId: "team-1", userId: "owner-1" })),
    );

    expect(url).toBe("/");
  });

  it("throws on a missing user id rather than guessing", async () => {
    await expect(
      removeMemberAction(form({ teamId: "team-1" })),
    ).rejects.toThrow("Invalid user ID");
  });
});

describe("revokeInvitationAction", () => {
  it("withdraws the invitation and says so", async () => {
    // There was no way to do this at all: mistyping an address left a live
    // token in a stranger's inbox with no undo.
    const url = await redirectUrlOf(() =>
      revokeInvitationAction(form({ teamId: "team-1", invitationId: "inv-1" })),
    );

    expect(url).toBe("/t/team-1/members?revoked=1");
    expect(revokeInvitation).toHaveBeenCalledWith("team-1", "inv-1");
  });

  it("requires owner access with write intent", async () => {
    // Write intent is what makes an archived team reject this, owner or not.
    await redirectUrlOf(() =>
      revokeInvitationAction(form({ teamId: "team-1", invitationId: "inv-1" })),
    );

    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", {
      intent: "write",
      minRole: "OWNER",
    });
  });

  it("passes the team id through, so a forged id deletes nothing", async () => {
    // revokeInvitation matches on (id, teamId, acceptedAt: null), so an id
    // belonging to another team resolves to no rows rather than to a
    // cross-team delete.
    await redirectUrlOf(() =>
      revokeInvitationAction(
        form({ teamId: "team-1", invitationId: "inv-from-another-team" }),
      ),
    );

    expect(revokeInvitation).toHaveBeenCalledWith(
      "team-1",
      "inv-from-another-team",
    );
  });

  it("redirects to the access error when the caller is not an owner", async () => {
    requireTeamAccess.mockRejectedValue(
      new TeamAccessError("denied", "insufficient-role"),
    );

    const url = await redirectUrlOf(() =>
      revokeInvitationAction(form({ teamId: "team-1", invitationId: "inv-1" })),
    );

    expect(url).toBe("/t/team-1/members?error=access");
    expect(revokeInvitation).not.toHaveBeenCalled();
  });

  it("does not claim success when nothing was removed", async () => {
    // `revokeInvitation` matches on `acceptedAt: null`, so it removes nothing
    // for an invitation somebody already accepted — or one a second tab
    // withdrew a moment ago. "Invitation withdrawn." there is a lie about a
    // token that is either still live or was never this row's to withdraw.
    revokeInvitation.mockResolvedValue(false);

    const url = await redirectUrlOf(() =>
      revokeInvitationAction(form({ teamId: "team-1", invitationId: "inv-1" })),
    );

    expect(url).toBe("/t/team-1/members");
  });

  it("throws on a missing invitation id rather than guessing", async () => {
    await expect(
      revokeInvitationAction(form({ teamId: "team-1" })),
    ).rejects.toThrow("Invalid invitation ID");
  });
});

describe("resendInvitationAction", () => {
  it("re-issues to the stored address, never one from the form", async () => {
    // The form carries only an id. Taking an address from it would make this
    // button a way to mail anyone from a signed-in POST.
    const url = await redirectUrlOf(() =>
      resendInvitationAction(
        form({
          teamId: "team-1",
          invitationId: "inv-1",
          email: "attacker@example.com",
        }),
      ),
    );

    expect(url).toBe("/t/team-1/members?resent=1");
    expect(createInvitation).toHaveBeenCalledWith({
      teamId: "team-1",
      email: "coach@example.com",
      role: "COACH",
    });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "coach@example.com" }),
    );
  });

  it("resolves the invitation through the team scope", async () => {
    await redirectUrlOf(() =>
      resendInvitationAction(form({ teamId: "team-1", invitationId: "inv-1" })),
    );

    expect(getTeamInvitation).toHaveBeenCalledWith("team-1", "inv-1");
  });

  it("quietly does nothing for an invitation that is gone", async () => {
    getTeamInvitation.mockResolvedValue(null);

    const url = await redirectUrlOf(() =>
      resendInvitationAction(form({ teamId: "team-1", invitationId: "inv-1" })),
    );

    expect(url).toBe("/t/team-1/members");
    expect(createInvitation).not.toHaveBeenCalled();
  });

  it("refuses to resend one that was already accepted", async () => {
    // Accepting granted the membership, so there is nothing left to invite —
    // and re-issuing would mint a token for someone already on the team.
    getTeamInvitation.mockResolvedValue({
      ...PENDING,
      acceptedAt: new Date("2026-04-05"),
    });

    await redirectUrlOf(() =>
      resendInvitationAction(form({ teamId: "team-1", invitationId: "inv-1" })),
    );

    expect(createInvitation).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("reports a failed send rather than claiming success", async () => {
    sendEmail.mockResolvedValue({ ok: false });

    const url = await redirectUrlOf(() =>
      resendInvitationAction(form({ teamId: "team-1", invitationId: "inv-1" })),
    );

    expect(url).toBe("/t/team-1/members?error=email-failed");
  });
});
