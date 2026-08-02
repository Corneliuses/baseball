import { describe, it, expect, vi, beforeEach } from "vitest";

const requireTeamAccess = vi.fn();
const getChart = vi.fn();
const savePositions = vi.fn();
const getTeamById = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/roster", () => ({
  getChart: (...args: unknown[]) => getChart(...args),
  savePositions: (...args: unknown[]) => savePositions(...args),
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: (...args: unknown[]) => getTeamById(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

// redirect() throws in Next; reproduce that so control flow matches
// production — same setup as the batting order action tests.
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

import { ALL_POSITIONS } from "@/lib/positions";
import { TeamAccessError } from "@/lib/team-access";
import { savePositionsAction } from "./actions";

function chartEntry(entryId: string) {
  return {
    entryId,
    playerId: `player-${entryId}`,
    playerName: entryId,
    jerseyNumber: null,
    battingOrder: null,
    position: null,
  };
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

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "coach-1" });
  getTeamById.mockResolvedValue({ id: "team-1", allPlay: true, archivedAt: null });
  getChart.mockResolvedValue([chartEntry("a"), chartEntry("b"), chartEntry("c")]);
  savePositions.mockResolvedValue(undefined);
});

describe("savePositionsAction", () => {
  it("requires COACH write access before touching anything", async () => {
    await redirectUrlOf(
      savePositionsAction(
        form({ teamId: "team-1", positions: '{"PITCHER":"a"}' }),
      ),
    );

    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", {
      intent: "write",
      minRole: "COACH",
    });
  });

  it("saves the validated board in scorebook order", async () => {
    const url = await redirectUrlOf(
      savePositionsAction(
        form({
          teamId: "team-1",
          positions: '{"SHORTSTOP":"c","PITCHER":"a"}',
        }),
      ),
    );

    expect(savePositions).toHaveBeenCalledWith("team-1", [
      { entryId: "a", position: "PITCHER" },
      { entryId: "c", position: "SHORTSTOP" },
    ]);
    expect(url).toBe("/t/team-1/chart/positions?saved=1");
    expect(revalidatePath).toHaveBeenCalledWith(
      "/t/[teamId]/chart/positions",
      "page",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/t/[teamId]/view", "page");
  });

  it("accepts an empty board — phase 1 of the write benches everyone", async () => {
    await redirectUrlOf(
      savePositionsAction(form({ teamId: "team-1", positions: "{}" })),
    );

    expect(savePositions).toHaveBeenCalledWith("team-1", []);
  });

  it("rejects unparseable and malformed payloads without hitting the database", async () => {
    for (const positions of ["not json", '["a"]', '{"PITCHER":3}']) {
      const url = await redirectUrlOf(
        savePositionsAction(form({ teamId: "team-1", positions })),
      );
      expect(url).toBe("/t/team-1/chart/positions?error=invalid-positions");
    }
    expect(savePositions).not.toHaveBeenCalled();
    // Payload shape is checked before any access or data work.
    expect(requireTeamAccess).not.toHaveBeenCalled();
  });

  it("rejects a board with more keys than there are positions", async () => {
    // Ten pairs can't be a real board however they're spelled, so this dies at
    // the schema rather than arriving at validatePositions looking plausible.
    const tooMany = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`K${i}`, "entry"]),
    );

    const url = await redirectUrlOf(
      savePositionsAction(
        form({ teamId: "team-1", positions: JSON.stringify(tooMany) }),
      ),
    );

    expect(url).toBe("/t/team-1/chart/positions?error=invalid-positions");
    expect(requireTeamAccess).not.toHaveBeenCalled();
  });

  it("rejects an entry id longer than a cuid could be", async () => {
    const url = await redirectUrlOf(
      savePositionsAction(
        form({
          teamId: "team-1",
          positions: JSON.stringify({ PITCHER: "x".repeat(65) }),
        }),
      ),
    );

    expect(url).toBe("/t/team-1/chart/positions?error=invalid-positions");
    expect(savePositions).not.toHaveBeenCalled();
  });

  it("accepts a full nine-position board", async () => {
    // The cap is the enum's length, not one less than it — an off-by-one here
    // would reject exactly the boards a non-allPlay team saves.
    const full = Object.fromEntries(
      ALL_POSITIONS.map((position, i) => [position, `re-${i}`]),
    );
    getChart.mockResolvedValue(ALL_POSITIONS.map((_, i) => chartEntry(`re-${i}`)));
    getTeamById.mockResolvedValue({ id: "team-1", allPlay: false });

    await redirectUrlOf(
      savePositionsAction(
        form({ teamId: "team-1", positions: JSON.stringify(full) }),
      ),
    );

    expect(savePositions).toHaveBeenCalledWith(
      "team-1",
      ALL_POSITIONS.map((position, i) => ({ entryId: `re-${i}`, position })),
    );
  });

  it("rejects an entry that is not on this team's roster", async () => {
    const url = await redirectUrlOf(
      savePositionsAction(
        form({ teamId: "team-1", positions: '{"PITCHER":"intruder"}' }),
      ),
    );

    expect(url).toBe("/t/team-1/chart/positions?error=unknown-entry");
    expect(savePositions).not.toHaveBeenCalled();
  });

  it("rejects the same player standing at two positions", async () => {
    const url = await redirectUrlOf(
      savePositionsAction(
        form({ teamId: "team-1", positions: '{"PITCHER":"a","CATCHER":"a"}' }),
      ),
    );

    expect(url).toBe("/t/team-1/chart/positions?error=duplicate-entry");
    expect(savePositions).not.toHaveBeenCalled();
  });

  it("rejects a named outfield spot for an allPlay team, using the freshly loaded flag", async () => {
    // The client can't be trusted for allPlay: this payload is what an editor
    // loaded before the setting was toggled would post.
    const url = await redirectUrlOf(
      savePositionsAction(
        form({ teamId: "team-1", positions: '{"LEFT_FIELD":"a"}' }),
      ),
    );

    expect(url).toBe("/t/team-1/chart/positions?error=invalid-position");
    expect(savePositions).not.toHaveBeenCalled();
  });

  it("accepts that same spot once allPlay is off", async () => {
    getTeamById.mockResolvedValue({
      id: "team-1",
      allPlay: false,
      archivedAt: null,
    });

    await redirectUrlOf(
      savePositionsAction(
        form({ teamId: "team-1", positions: '{"LEFT_FIELD":"a"}' }),
      ),
    );

    expect(savePositions).toHaveBeenCalledWith("team-1", [
      { entryId: "a", position: "LEFT_FIELD" },
    ]);
  });

  it("redirects to access on TeamAccessError", async () => {
    requireTeamAccess.mockRejectedValue(
      new TeamAccessError("archived", "archived"),
    );

    const url = await redirectUrlOf(
      savePositionsAction(
        form({ teamId: "team-1", positions: '{"PITCHER":"a"}' }),
      ),
    );

    expect(url).toBe("/t/team-1/chart/positions?error=access");
    expect(savePositions).not.toHaveBeenCalled();
  });

  it("maps a P2025 mid-save (entry removed in another tab) to roster-changed", async () => {
    savePositions.mockRejectedValue(
      Object.assign(new Error("no row"), { code: "P2025" }),
    );

    const url = await redirectUrlOf(
      savePositionsAction(
        form({ teamId: "team-1", positions: '{"PITCHER":"a"}' }),
      ),
    );

    expect(url).toBe("/t/team-1/chart/positions?error=roster-changed");
  });

  it("maps a position P2002 to position-conflict", async () => {
    savePositions.mockRejectedValue(
      Object.assign(new Error("dupe"), {
        code: "P2002",
        meta: { target: ["teamId", "position"] },
      }),
    );

    const url = await redirectUrlOf(
      savePositionsAction(
        form({ teamId: "team-1", positions: '{"PITCHER":"a"}' }),
      ),
    );

    expect(url).toBe("/t/team-1/chart/positions?error=position-conflict");
  });

  it("rethrows unrecognized database errors instead of hiding them", async () => {
    savePositions.mockRejectedValue(new Error("connection lost"));

    await expect(
      savePositionsAction(
        form({ teamId: "team-1", positions: '{"PITCHER":"a"}' }),
      ),
    ).rejects.toThrow("connection lost");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
