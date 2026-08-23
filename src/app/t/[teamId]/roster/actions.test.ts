import { describe, it, expect, vi, beforeEach } from "vitest";

const requireTeamAccess = vi.fn();
const getRosterEntry = vi.fn();
const findDuplicateNameMatch = vi.fn();
const addPlayerToRoster = vi.fn();
const updateRosterEntry = vi.fn();
const linkGuardian = vi.fn();
const unlinkGuardian = vi.fn();
const setGuardianPhone = vi.fn();
const createInvitation = vi.fn();
const sendEmail = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/roster", () => ({
  getRosterEntry: (...args: unknown[]) => getRosterEntry(...args),
  addPlayerToRoster: (...args: unknown[]) => addPlayerToRoster(...args),
  findDuplicateNameMatch: (...args: unknown[]) => findDuplicateNameMatch(...args),
  removeRosterEntry: vi.fn(),
  updateRosterEntry: (...args: unknown[]) => updateRosterEntry(...args),
}));

vi.mock("@/lib/invitations", () => ({
  linkGuardian: (...args: unknown[]) => linkGuardian(...args),
  unlinkGuardian: (...args: unknown[]) => unlinkGuardian(...args),
  setGuardianPhone: (...args: unknown[]) => setGuardianPhone(...args),
  createInvitation: (...args: unknown[]) => createInvitation(...args),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: vi.fn().mockResolvedValue({ id: "team-1", name: "Cubs" }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// redirect() throws in Next; reproduce that so control flow matches
// production and a "redirected" assertion can't pass by accident. Identified
// by message prefix rather than a class, because vi.mock factories are
// hoisted above any top-level declaration they'd reference.
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
import {
  addPlayerAction,
  linkGuardianAction,
  resendInvitationAction,
  setGuardianPhoneAction,
  unlinkGuardianAction,
  updateRosterEntryAction,
} from "./actions";
import {
  ADD_PLAYER_INITIAL_STATE,
  type AddPlayerState,
} from "./add-player-state";

/// `addPlayerAction` is shaped for `useActionState`, so it takes the previous
/// state ahead of the form. It rejects by *returning* rather than redirecting,
/// which is the whole point: the coach keeps what they typed.
function addPlayer(data: FormData): Promise<AddPlayerState> {
  return addPlayerAction(ADD_PLAYER_INITIAL_STATE, data);
}

/// Narrows to the rejected shape, failing the test rather than the type
/// checker when a call unexpectedly succeeded.
function rejection(state: AddPlayerState) {
  expect(state.status).toBe("invalid");
  if (state.status !== "invalid") throw new Error("unreachable");
  return state;
}

const ENTRY = {
  id: "entry-1",
  jerseyNumber: 7,
  player: { id: "player-1", name: "Ada", dateOfBirth: null },
  guardians: [
    {
      id: "user-1",
      name: "Sam",
      email: "sam@example.com",
      phone: null,
      isMember: true,
      hasSignedIn: false,
    },
  ],
};

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

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "coach-1" });
  getRosterEntry.mockResolvedValue(ENTRY);
  // No name collision unless a test sets one up. The check is advisory and
  // returns null both when nothing matches and when the lookup itself failed.
  findDuplicateNameMatch.mockResolvedValue(null);
  linkGuardian.mockResolvedValue({
    userId: "user-2",
    email: "new@example.com",
    membershipCreated: false,
    invitation: null,
  });
  createInvitation.mockResolvedValue({
    token: "tok-1",
    role: "PARENT",
    expiresAt: new Date("2026-05-01"),
  });
  sendEmail.mockResolvedValue({ ok: true });
});

/// requireTeamAccess proves the caller may write to this *team*; it cannot
/// prove the record they named belongs to it. These lock in that the guardian
/// actions resolve the player from the teamId-scoped roster entry instead of
/// trusting the form, so a coach cannot reach a child on another team.
describe("guardian actions do not trust ids from the form", () => {
  it("linkGuardianAction ignores a forged playerId and uses the scoped entry's player", async () => {
    await redirectUrlOf(
      linkGuardianAction(
        form({
          teamId: "team-1",
          entryId: "entry-1",
          playerId: "player-on-another-team",
          email: "new@example.com",
        }),
      ),
    );

    expect(getRosterEntry).toHaveBeenCalledWith("team-1", "entry-1");
    expect(linkGuardian).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: "team-1", playerId: "player-1" }),
    );
  });

  it("unlinkGuardianAction ignores a forged playerId and uses the scoped entry's player", async () => {
    await redirectUrlOf(
      unlinkGuardianAction(
        form({
          teamId: "team-1",
          entryId: "entry-1",
          playerId: "player-on-another-team",
          userId: "user-1",
        }),
      ),
    );

    expect(unlinkGuardian).toHaveBeenCalledWith("player-1", "user-1");
  });

  it("unlinkGuardianAction refuses a userId that is not a guardian of this player", async () => {
    const url = await redirectUrlOf(
      unlinkGuardianAction(
        form({
          teamId: "team-1",
          entryId: "entry-1",
          userId: "stranger",
        }),
      ),
    );

    expect(url).toContain("error=not-a-guardian");
    expect(unlinkGuardian).not.toHaveBeenCalled();
  });

  it("resendInvitationAction mails the guardian's stored address, not one from the form", async () => {
    await redirectUrlOf(
      resendInvitationAction(
        form({
          teamId: "team-1",
          entryId: "entry-1",
          userId: "user-1",
          email: "attacker@example.com",
        }),
      ),
    );

    expect(createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ email: "sam@example.com" }),
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "sam@example.com" }),
    );
  });

  it("resendInvitationAction refuses a userId that is not a guardian of this player", async () => {
    const url = await redirectUrlOf(
      resendInvitationAction(
        form({ teamId: "team-1", entryId: "entry-1", userId: "stranger" }),
      ),
    );

    expect(url).toContain("error=not-a-guardian");
    expect(createInvitation).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends the caller back to the roster when the entry is not on this team", async () => {
    getRosterEntry.mockResolvedValue(null);

    const url = await redirectUrlOf(
      linkGuardianAction(
        form({
          teamId: "team-1",
          entryId: "entry-from-another-team",
          email: "new@example.com",
        }),
      ),
    );

    expect(url).toBe("/t/team-1/roster");
    expect(linkGuardian).not.toHaveBeenCalled();
  });

  it("checks team access before touching any record", async () => {
    requireTeamAccess.mockRejectedValue(
      new TeamAccessError("denied", "insufficient-role"),
    );

    const url = await redirectUrlOf(
      linkGuardianAction(
        form({
          teamId: "team-1",
          entryId: "entry-1",
          email: "new@example.com",
        }),
      ),
    );

    expect(url).toContain("error=access");
    expect(getRosterEntry).not.toHaveBeenCalled();
    expect(linkGuardian).not.toHaveBeenCalled();
  });
});

describe("setGuardianPhoneAction", () => {
  beforeEach(() => {
    setGuardianPhone.mockResolvedValue(undefined);
  });

  it("sets the phone on the scoped guardian", async () => {
    await redirectUrlOf(
      setGuardianPhoneAction(
        form({
          teamId: "team-1",
          entryId: "entry-1",
          userId: "user-1",
          phone: "555-1234",
        }),
      ),
    );

    expect(setGuardianPhone).toHaveBeenCalledWith("player-1", "user-1", "555-1234");
  });

  it("clears the phone when the field is blank", async () => {
    await redirectUrlOf(
      setGuardianPhoneAction(
        form({ teamId: "team-1", entryId: "entry-1", userId: "user-1", phone: "" }),
      ),
    );

    expect(setGuardianPhone).toHaveBeenCalledWith("player-1", "user-1", null);
  });

  it("refuses a userId that is not a guardian of this player", async () => {
    const url = await redirectUrlOf(
      setGuardianPhoneAction(
        form({
          teamId: "team-1",
          entryId: "entry-1",
          userId: "stranger",
          phone: "555-1234",
        }),
      ),
    );

    expect(url).toContain("error=not-a-guardian");
    expect(setGuardianPhone).not.toHaveBeenCalled();
  });

  it("rejects an over-long phone number before checking access", async () => {
    const url = await redirectUrlOf(
      setGuardianPhoneAction(
        form({
          teamId: "team-1",
          entryId: "entry-1",
          userId: "user-1",
          phone: "1".repeat(33),
        }),
      ),
    );

    expect(url).toContain("error=invalid-phone");
    expect(requireTeamAccess).not.toHaveBeenCalled();
    expect(setGuardianPhone).not.toHaveBeenCalled();
  });
});

/// A malformed dateOfBirth used to reach `new Date(raw)` unvalidated and
/// become an Invalid Date that flowed into a Prisma write — see
/// src/app/t/[teamId]/roster/actions.ts's playerSchema.
describe("date of birth validation", () => {
  it("rejects a calendar-invalid date and does not write anything", async () => {
    const state = rejection(
      await addPlayer(
        form({ teamId: "team-1", name: "Ada", dateOfBirth: "2026-02-30" }),
      ),
    );

    expect(state.code).toBe("invalid-dob");
    expect(addPlayerToRoster).not.toHaveBeenCalled();
  });

  it("rejects a non-date string", async () => {
    const state = rejection(
      await addPlayer(
        form({ teamId: "team-1", name: "Ada", dateOfBirth: "not-a-date" }),
      ),
    );

    expect(state.code).toBe("invalid-dob");
    expect(addPlayerToRoster).not.toHaveBeenCalled();
  });

  it("hands the rejected name and jersey back rather than blanking them", async () => {
    // The old flow redirected, so one mistyped digit in the date cost the
    // coach the name and the number they had already entered (C5).
    const state = rejection(
      await addPlayer(
        form({
          teamId: "team-1",
          name: "Ada",
          dateOfBirth: "not-a-date",
          jerseyNumber: "7",
        }),
      ),
    );

    expect(state.values).toEqual({
      name: "Ada",
      dateOfBirth: "not-a-date",
      jerseyNumber: "7",
    });
  });

  it("points the rejection at the box that caused it", async () => {
    const state = rejection(
      await addPlayer(
        form({ teamId: "team-1", name: "Ada", dateOfBirth: "not-a-date" }),
      ),
    );

    expect(state.field).toBe("dateOfBirth");
  });

  it("accepts a real calendar date, including a leap day", async () => {
    addPlayerToRoster.mockResolvedValue({
      id: "entry-1",
      jerseyNumber: null,
      player: { id: "player-1", name: "Ada", dateOfBirth: new Date("2024-02-29") },
    });

    await redirectUrlOf(
      addPlayer(form({ teamId: "team-1", name: "Ada", dateOfBirth: "2024-02-29" })),
    );

    expect(addPlayerToRoster).toHaveBeenCalledWith(
      "team-1",
      expect.objectContaining({ dateOfBirth: new Date("2024-02-29") }),
    );
  });

  it("redirects on success with the param that lights the added banner", async () => {
    // The roster page has always rendered "Player added." for ?added=1 and
    // nothing ever set it — the banner was only reachable from the returning
    // -player flow. A blank form is the right next state here: the coach's
    // next act is usually another kid.
    addPlayerToRoster.mockResolvedValue({
      id: "entry-1",
      jerseyNumber: null,
      player: { id: "player-1", name: "Ada", dateOfBirth: null },
    });

    const url = await redirectUrlOf(
      addPlayer(form({ teamId: "team-1", name: "Ada" })),
    );

    expect(url).toBe("/t/team-1/roster?added=1");
  });

  it("treats a blank date of birth as absent, not invalid", async () => {
    addPlayerToRoster.mockResolvedValue({
      id: "entry-1",
      jerseyNumber: null,
      player: { id: "player-1", name: "Ada", dateOfBirth: null },
    });

    await redirectUrlOf(
      addPlayer(form({ teamId: "team-1", name: "Ada", dateOfBirth: "" })),
    );

    expect(addPlayerToRoster).toHaveBeenCalledWith(
      "team-1",
      expect.objectContaining({ dateOfBirth: null }),
    );
  });

  it("rejects a bad date on update, distinctly from a bad name", async () => {
    const url = await redirectUrlOf(
      updateRosterEntryAction(
        form({
          teamId: "team-1",
          entryId: "entry-1",
          name: "Ada",
          dateOfBirth: "2026-13-01",
        }),
      ),
    );

    expect(url).toContain("error=invalid-dob");
    expect(updateRosterEntry).not.toHaveBeenCalled();
  });
});

/// `addPlayerToRoster` always creates a brand-new global Player, and nothing
/// used to stop it: adding "Jake Miller" twice silently produced two children
/// who are, to the data model, different people. The unique indexes do not
/// help — they constrain jersey numbers and roster membership, not names.
describe("the same-kid check on a manual add", () => {
  it("asks before creating a second player by the same name", async () => {
    findDuplicateNameMatch.mockResolvedValue({
      kind: "rostered",
      playerId: "player-9",
      name: "Jake Miller",
    });

    const state = await addPlayer(form({ teamId: "team-1", name: "Jake Miller" }));

    expect(state.status).toBe("duplicate-name");
    expect(addPlayerToRoster).not.toHaveBeenCalled();
  });

  it("keeps what was typed while it asks", async () => {
    findDuplicateNameMatch.mockResolvedValue({
      kind: "rostered",
      playerId: "player-9",
      name: "Jake Miller",
    });

    const state = await addPlayer(
      form({ teamId: "team-1", name: "Jake Miller", jerseyNumber: "12" }),
    );

    if (state.status !== "duplicate-name") throw new Error("expected the question");
    expect(state.values.name).toBe("Jake Miller");
    expect(state.values.jerseyNumber).toBe("12");
  });

  it("says which kind of match it found, since the remedies differ", async () => {
    // A returning player should usually be added through the picker, which
    // reuses the existing Player and carries their guardians across.
    findDuplicateNameMatch.mockResolvedValue({
      kind: "returning",
      playerId: "player-9",
      name: "Jake Miller",
    });

    const state = await addPlayer(form({ teamId: "team-1", name: "Jake Miller" }));

    if (state.status !== "duplicate-name") throw new Error("expected the question");
    expect(state.match).toEqual({ kind: "returning", name: "Jake Miller" });
  });

  it("goes ahead when the coach says it really is a different kid", async () => {
    // Two children on one team genuinely can share a name, so this is a
    // question the coach can answer, never a rejection.
    findDuplicateNameMatch.mockResolvedValue({
      kind: "rostered",
      playerId: "player-9",
      name: "Jake Miller",
    });
    addPlayerToRoster.mockResolvedValue({
      id: "entry-2",
      jerseyNumber: null,
      player: { id: "player-10", name: "Jake Miller", dateOfBirth: null },
    });

    const url = await redirectUrlOf(
      addPlayer(form({ teamId: "team-1", name: "Jake Miller", force: "1" })),
    );

    expect(url).toBe("/t/team-1/roster?added=1");
    expect(addPlayerToRoster).toHaveBeenCalled();
  });

  it("does not even ask once the check is waived", async () => {
    addPlayerToRoster.mockResolvedValue({
      id: "entry-2",
      jerseyNumber: null,
      player: { id: "player-10", name: "Jake Miller", dateOfBirth: null },
    });

    await redirectUrlOf(
      addPlayer(form({ teamId: "team-1", name: "Jake Miller", force: "1" })),
    );

    expect(findDuplicateNameMatch).not.toHaveBeenCalled();
  });

  it("withholds the cross-team half from a coach", async () => {
    // `listReturningCandidates` is the app's one global Player read
    // (Decision 13) and is documented as OWNER-gated in its caller. Adding a
    // player is COACH+, so running it for every caller would hand a coach an
    // existence oracle across every team in the database: type a name, learn
    // from the answer whether a child by that name is rostered anywhere, and
    // get the canonical spelling back.
    requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "coach-1" });
    addPlayerToRoster.mockResolvedValue({
      id: "entry-2",
      jerseyNumber: null,
      player: { id: "player-10", name: "Jake Miller", dateOfBirth: null },
    });

    await redirectUrlOf(addPlayer(form({ teamId: "team-1", name: "Jake Miller" })));

    expect(findDuplicateNameMatch).toHaveBeenCalledWith(
      "team-1",
      "Jake Miller",
      false,
    );
  });

  it("allows it for an owner, who can act on the answer", async () => {
    // The picker the "returning" branch points at is owner-only too, so
    // offering it to a coach would be a dead end even setting the leak aside.
    requireTeamAccess.mockResolvedValue({ role: "OWNER", userId: "owner-1" });
    addPlayerToRoster.mockResolvedValue({
      id: "entry-2",
      jerseyNumber: null,
      player: { id: "player-10", name: "Jake Miller", dateOfBirth: null },
    });

    await redirectUrlOf(addPlayer(form({ teamId: "team-1", name: "Jake Miller" })));

    expect(findDuplicateNameMatch).toHaveBeenCalledWith(
      "team-1",
      "Jake Miller",
      true,
    );
  });

  it("checks only after access is proven", async () => {
    // The check reads this team's roster and the owner's past players, so it
    // must never run for someone who has not been shown to be a coach here.
    requireTeamAccess.mockRejectedValue(
      new TeamAccessError("denied", "insufficient-role"),
    );

    await redirectUrlOf(addPlayer(form({ teamId: "team-1", name: "Jake Miller" })));

    expect(findDuplicateNameMatch).not.toHaveBeenCalled();
  });
});
