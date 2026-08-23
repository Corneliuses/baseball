import { describe, it, expect, vi, beforeEach } from "vitest";

const requireTeamAccess = vi.fn();
const isReturningCandidate = vi.fn();
const addReturningPlayer = vi.fn();
const sendEmail = vi.fn();
const getTeamById = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/roster", () => ({
  isReturningCandidate: (...args: unknown[]) => isReturningCandidate(...args),
  addReturningPlayer: (...args: unknown[]) => addReturningPlayer(...args),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: (...args: unknown[]) => getTeamById(...args),
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
import { addReturningPlayerAction } from "./actions";

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
  requireTeamAccess.mockResolvedValue({ role: "OWNER", userId: "owner-1" });
  isReturningCandidate.mockResolvedValue(true);
  addReturningPlayer.mockResolvedValue({
    entry: { id: "entry-1", jerseyNumber: 7, player: { id: "player-1", name: "Ada", dateOfBirth: null } },
    notify: [],
  });
  sendEmail.mockResolvedValue({ ok: true });
  getTeamById.mockResolvedValue({ id: "team-1", name: "Cubs" });
});

describe("addReturningPlayerAction", () => {
  it("denies a non-owner", async () => {
    requireTeamAccess.mockRejectedValue(new TeamAccessError("nope", "insufficient-role"));

    const url = await redirectUrlOf(
      addReturningPlayerAction(
        form({ teamId: "team-1", playerId: "player-1", jerseyNumber: "7" }),
      ),
    );

    expect(url).toContain("error=access");
    expect(addReturningPlayer).not.toHaveBeenCalled();
  });

  it("rejects a playerId that is no longer a candidate", async () => {
    isReturningCandidate.mockResolvedValue(false);

    const url = await redirectUrlOf(
      addReturningPlayerAction(
        form({ teamId: "team-1", playerId: "player-1", jerseyNumber: "7" }),
      ),
    );

    expect(url).toContain("error=not-a-candidate");
    expect(addReturningPlayer).not.toHaveBeenCalled();
  });

  /// The candidate re-check must fail loudly, not report an addable player as
  /// unavailable. listReturningCandidates swallows database errors and returns
  /// [], so using it here would have turned an outage into a silent no-op with
  /// a misleading message.
  it("lets a database error during the candidate check propagate rather than reporting the player unavailable", async () => {
    isReturningCandidate.mockRejectedValue(new Error("connection refused"));

    await expect(
      addReturningPlayerAction(
        form({ teamId: "team-1", playerId: "player-1", jerseyNumber: "7" }),
      ),
    ).rejects.toThrow("connection refused");
    expect(addReturningPlayer).not.toHaveBeenCalled();
  });

  it("sends one email per newly-created guardian and none when there are none", async () => {
    addReturningPlayer.mockResolvedValue({
      entry: { id: "entry-1", jerseyNumber: 7, player: { id: "player-1", name: "Ada", dateOfBirth: null } },
      notify: [],
    });

    await redirectUrlOf(
      addReturningPlayerAction(
        form({ teamId: "team-1", playerId: "player-1", jerseyNumber: "7" }),
      ),
    );

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("emails every guardian in notify", async () => {
    addReturningPlayer.mockResolvedValue({
      entry: { id: "entry-1", jerseyNumber: 7, player: { id: "player-1", name: "Ada", dateOfBirth: null } },
      notify: [
        { userId: "user-1", email: "dad@example.com", name: "Dad" },
        { userId: "user-2", email: "mom@example.com", name: "Mom" },
      ],
    });

    const url = await redirectUrlOf(
      addReturningPlayerAction(
        form({ teamId: "team-1", playerId: "player-1", jerseyNumber: "7" }),
      ),
    );

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "dad@example.com" }),
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "mom@example.com" }),
    );
    // The picker keeps the owner in place now, naming the player it just
    // added rather than sending them off to the roster (#51 / C7).
    expect(url).toBe("/t/team-1/roster/returning?added=player-1");
  });

  it("stays on the picker and keeps the filter, instead of leaving for the roster", async () => {
    // Adding a returning roster used to be N round trips with a Back-button
    // navigation between each: every add redirected away and dropped the
    // filter, so a list narrowed to three names came back as all forty.
    addReturningPlayer.mockResolvedValue({
      entry: {
        id: "entry-1",
        jerseyNumber: 7,
        player: { id: "player-1", name: "Ada", dateOfBirth: null },
      },
      notify: [],
    });

    const url = await redirectUrlOf(
      addReturningPlayerAction(
        form({ teamId: "team-1", playerId: "player-1", q: "ad" }),
      ),
    );

    expect(url).toBe("/t/team-1/roster/returning?q=ad&added=player-1");
  });

  it("keeps them on the picker even when a notice email fails", async () => {
    // The roster spot and the memberships have already committed by then, so
    // sending the owner somewhere else to read about an email would be doubly
    // wrong — they would lose their place over something already done.
    addReturningPlayer.mockResolvedValue({
      entry: {
        id: "entry-1",
        jerseyNumber: 7,
        player: { id: "player-1", name: "Ada", dateOfBirth: null },
      },
      notify: [{ userId: "user-1", email: "dad@example.com", name: "Dad" }],
    });
    sendEmail.mockResolvedValue({ ok: false });

    const url = await redirectUrlOf(
      addReturningPlayerAction(
        form({ teamId: "team-1", playerId: "player-1" }),
      ),
    );

    expect(url).toContain("/t/team-1/roster/returning?");
    expect(url).toContain("error=email-failed");
    expect(url).toContain("added=player-1");
  });

  it("maps a jersey collision to a friendly redirect", async () => {
    addReturningPlayer.mockRejectedValue({
      code: "P2002",
      meta: { target: ["teamId", "jerseyNumber"] },
    });

    const url = await redirectUrlOf(
      addReturningPlayerAction(
        form({ teamId: "team-1", playerId: "player-1", jerseyNumber: "7" }),
      ),
    );

    expect(url).toContain("error=jersey-taken");
  });

  it("still redirects to the roster, with an error, when a notice email fails", async () => {
    addReturningPlayer.mockResolvedValue({
      entry: { id: "entry-1", jerseyNumber: 7, player: { id: "player-1", name: "Ada", dateOfBirth: null } },
      notify: [{ userId: "user-1", email: "dad@example.com", name: "Dad" }],
    });
    sendEmail.mockResolvedValue({ ok: false, reason: "bounced" });

    const url = await redirectUrlOf(
      addReturningPlayerAction(
        form({ teamId: "team-1", playerId: "player-1", jerseyNumber: "7" }),
      ),
    );

    expect(url).toContain(`/t/team-1/roster`);
    expect(url).toContain("error=email-failed");
  });

  /// The roster write has already committed by the time the notices go out, so
  /// a throw from the notification step (a database outage reaching
  /// getTeamById, say) must not escape as a 500 implying nothing happened.
  it("degrades to the email-failed banner when the notification step throws", async () => {
    addReturningPlayer.mockResolvedValue({
      entry: { id: "entry-1", jerseyNumber: 7, player: { id: "player-1", name: "Ada", dateOfBirth: null } },
      notify: [{ userId: "user-1", email: "dad@example.com", name: "Dad" }],
    });
    getTeamById.mockRejectedValue(new Error("connection refused"));

    const url = await redirectUrlOf(
      addReturningPlayerAction(
        form({ teamId: "team-1", playerId: "player-1", jerseyNumber: "7" }),
      ),
    );

    expect(url).toContain("/t/team-1/roster");
    expect(url).toContain("error=email-failed");
  });

  it("rejects an invalid jersey number before checking access", async () => {
    const url = await redirectUrlOf(
      addReturningPlayerAction(
        form({ teamId: "team-1", playerId: "player-1", jerseyNumber: "150" }),
      ),
    );

    expect(url).toContain("error=invalid-jersey");
    expect(addReturningPlayer).not.toHaveBeenCalled();
  });
});
