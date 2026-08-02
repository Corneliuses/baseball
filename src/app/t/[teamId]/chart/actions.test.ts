import { describe, it, expect, vi, beforeEach } from "vitest";

const requireTeamAccess = vi.fn();
const getChart = vi.fn();
const saveBattingOrder = vi.fn();
const getTeamById = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/roster", () => ({
  getChart: (...args: unknown[]) => getChart(...args),
  saveBattingOrder: (...args: unknown[]) => saveBattingOrder(...args),
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: (...args: unknown[]) => getTeamById(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

// redirect() throws in Next; reproduce that so control flow matches
// production — same setup as the roster actions tests.
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
import { saveBattingOrderAction } from "./actions";

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

/// `baseline` defaults to the empty order, which is what `chartEntry` rosters
/// actually store (battingOrder: null), so the lost-update guard passes unless
/// a test deliberately sets up a mismatch.
function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  data.set("baseline", "[]");
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
  saveBattingOrder.mockResolvedValue(undefined);
});

describe("saveBattingOrderAction", () => {
  it("requires COACH write access before touching anything", async () => {
    await redirectUrlOf(
      saveBattingOrderAction(
        form({ teamId: "team-1", order: '["a","b","c"]' }),
      ),
    );

    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", {
      intent: "write",
      minRole: "COACH",
    });
  });

  it("saves validated assignments with server-derived batting orders", async () => {
    const url = await redirectUrlOf(
      saveBattingOrderAction(
        form({ teamId: "team-1", order: '["c","a","b"]' }),
      ),
    );

    expect(saveBattingOrder).toHaveBeenCalledWith("team-1", [
      { entryId: "c", battingOrder: 1 },
      { entryId: "a", battingOrder: 2 },
      { entryId: "b", battingOrder: 3 },
    ]);
    expect(url).toBe("/t/team-1/chart?saved=1");
    expect(revalidatePath).toHaveBeenCalledWith("/t/[teamId]/chart", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/t/[teamId]/view", "page");
  });

  it("collapses empty slots when allPlay is false so the order stays contiguous", async () => {
    getTeamById.mockResolvedValue({
      id: "team-1",
      allPlay: false,
      archivedAt: null,
    });

    await redirectUrlOf(
      saveBattingOrderAction(
        form({ teamId: "team-1", order: '["a",null,"b"]' }),
      ),
    );

    expect(saveBattingOrder).toHaveBeenCalledWith("team-1", [
      { entryId: "a", battingOrder: 1 },
      { entryId: "b", battingOrder: 2 },
    ]);
  });

  it("rejects unparseable and malformed payloads without hitting the database", async () => {
    for (const order of ["not json", '{"a":1}', '[3]']) {
      const url = await redirectUrlOf(
        saveBattingOrderAction(form({ teamId: "team-1", order })),
      );
      expect(url).toBe("/t/team-1/chart?error=invalid-order");
    }
    expect(saveBattingOrder).not.toHaveBeenCalled();
    // Payload shape is checked before any access or data work.
    expect(requireTeamAccess).not.toHaveBeenCalled();
  });

  it("refuses a save when another coach reordered since the page loaded", async () => {
    // This page loaded an empty order; another coach has since set one. The
    // write nulls every battingOrder and rewrites, so going through would
    // erase theirs with no error and no history to recover it.
    getChart.mockResolvedValue([
      { ...chartEntry("a"), battingOrder: 1 },
      { ...chartEntry("b"), battingOrder: 2 },
      chartEntry("c"),
    ]);

    const url = await redirectUrlOf(
      saveBattingOrderAction(
        form({ teamId: "team-1", order: '["c","a","b"]', baseline: "[]" }),
      ),
    );

    expect(url).toBe("/t/team-1/chart?error=chart-changed");
    expect(saveBattingOrder).not.toHaveBeenCalled();
  });

  it("allows the save once the baseline matches what is stored", async () => {
    getChart.mockResolvedValue([
      { ...chartEntry("a"), battingOrder: 1 },
      { ...chartEntry("b"), battingOrder: 2 },
      { ...chartEntry("c"), battingOrder: 3 },
    ]);

    await redirectUrlOf(
      saveBattingOrderAction(
        form({
          teamId: "team-1",
          order: '["c","a","b"]',
          baseline: '["a","b","c"]',
        }),
      ),
    );

    expect(saveBattingOrder).toHaveBeenCalledWith("team-1", [
      { entryId: "c", battingOrder: 1 },
      { entryId: "a", battingOrder: 2 },
      { entryId: "b", battingOrder: 3 },
    ]);
  });

  it("does not call a pure renumber a conflict", async () => {
    // Another coach's save compacted a hand-set 1, 2, 5 to 1, 2, 3 without
    // moving anyone. The sequence is identical, nothing this save writes can
    // lose their work, and failing here would be a conflict no coach could
    // see or explain — so storedBattingOrder fingerprints order, not numbers.
    getChart.mockResolvedValue([
      { ...chartEntry("a"), battingOrder: 1 },
      { ...chartEntry("b"), battingOrder: 2 },
      { ...chartEntry("c"), battingOrder: 3 },
    ]);

    await redirectUrlOf(
      saveBattingOrderAction(
        form({
          teamId: "team-1",
          order: '["a","b","c"]',
          // What this page loaded, when the same three sat in slots 1, 2, 5.
          baseline: '["a","b","c"]',
        }),
      ),
    );

    expect(saveBattingOrder).toHaveBeenCalled();
  });

  it("rejects a missing or unparseable baseline rather than skipping the guard", async () => {
    for (const fields of [
      { teamId: "team-1", order: '["a","b","c"]', baseline: "not json" },
      { teamId: "team-1", order: '["a","b","c"]', baseline: '{"a":1}' },
    ]) {
      expect(await redirectUrlOf(saveBattingOrderAction(form(fields)))).toBe(
        "/t/team-1/chart?error=invalid-order",
      );
    }

    const bare = new FormData();
    bare.set("teamId", "team-1");
    bare.set("order", '["a","b","c"]');
    expect(await redirectUrlOf(saveBattingOrderAction(bare))).toBe(
      "/t/team-1/chart?error=invalid-order",
    );
    expect(saveBattingOrder).not.toHaveBeenCalled();
  });

  it("rejects an entry that is not on this team's roster", async () => {
    const url = await redirectUrlOf(
      saveBattingOrderAction(
        form({ teamId: "team-1", order: '["a","b","intruder"]' }),
      ),
    );

    expect(url).toBe("/t/team-1/chart?error=unknown-entry");
    expect(saveBattingOrder).not.toHaveBeenCalled();
  });

  it("rejects a lineup missing players when allPlay is true", async () => {
    const url = await redirectUrlOf(
      saveBattingOrderAction(form({ teamId: "team-1", order: '["a","b"]' })),
    );

    expect(url).toBe("/t/team-1/chart?error=missing-players");
    expect(saveBattingOrder).not.toHaveBeenCalled();
  });

  it("redirects to access on TeamAccessError", async () => {
    requireTeamAccess.mockRejectedValue(
      new TeamAccessError("archived", "archived"),
    );

    const url = await redirectUrlOf(
      saveBattingOrderAction(
        form({ teamId: "team-1", order: '["a","b","c"]' }),
      ),
    );

    expect(url).toBe("/t/team-1/chart?error=access");
    expect(saveBattingOrder).not.toHaveBeenCalled();
  });

  it("maps a P2025 mid-save (entry removed in another tab) to roster-changed", async () => {
    saveBattingOrder.mockRejectedValue(
      Object.assign(new Error("no row"), { code: "P2025" }),
    );

    const url = await redirectUrlOf(
      saveBattingOrderAction(
        form({ teamId: "team-1", order: '["a","b","c"]' }),
      ),
    );

    expect(url).toBe("/t/team-1/chart?error=roster-changed");
  });

  it("rethrows unrecognized database errors instead of hiding them", async () => {
    saveBattingOrder.mockRejectedValue(new Error("connection lost"));

    await expect(
      saveBattingOrderAction(
        form({ teamId: "team-1", order: '["a","b","c"]' }),
      ),
    ).rejects.toThrow("connection lost");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
