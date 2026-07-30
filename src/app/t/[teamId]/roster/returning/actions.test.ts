import { describe, it, expect, vi, beforeEach } from "vitest";

const requireTeamAccess = vi.fn();
const listReturningCandidates = vi.fn();
const addReturningPlayer = vi.fn();
const sendEmail = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/roster", () => ({
  listReturningCandidates: (...args: unknown[]) => listReturningCandidates(...args),
  addReturningPlayer: (...args: unknown[]) => addReturningPlayer(...args),
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
import { addReturningPlayerAction } from "./actions";

const CANDIDATE = {
  playerId: "player-1",
  name: "Ada",
  dateOfBirth: null,
  teams: [{ id: "team-2", name: "Rec", season: "2025", archivedAt: null }],
  guardianCount: 1,
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
  requireTeamAccess.mockResolvedValue({ role: "OWNER", userId: "owner-1" });
  listReturningCandidates.mockResolvedValue([CANDIDATE]);
  addReturningPlayer.mockResolvedValue({
    entry: { id: "entry-1", jerseyNumber: 7, player: { id: "player-1", name: "Ada", dateOfBirth: null } },
    notify: [],
  });
  sendEmail.mockResolvedValue({ ok: true });
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

  it("rejects a playerId that is not in the current candidate list", async () => {
    listReturningCandidates.mockResolvedValue([]);

    const url = await redirectUrlOf(
      addReturningPlayerAction(
        form({ teamId: "team-1", playerId: "player-1", jerseyNumber: "7" }),
      ),
    );

    expect(url).toContain("error=not-a-candidate");
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
    expect(url).toContain("added=1");
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
