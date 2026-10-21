import { describe, it, expect, vi, beforeEach } from "vitest";

const requireTeamAccess = vi.fn();
const getDepthChart = vi.fn();
const saveDepthChart = vi.fn();
const getTeamById = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/roster", () => ({
  getDepthChart: (...args: unknown[]) => getDepthChart(...args),
  saveDepthChart: (...args: unknown[]) => saveDepthChart(...args),
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: (...args: unknown[]) => getTeamById(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

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
import { saveDepthChartAction } from "./actions";

function row(
  entryId: string,
  courtPosition: string | null = null,
  benchOrder: number | null = null,
) {
  return {
    entryId,
    playerId: `player-${entryId}`,
    playerName: entryId,
    jerseyNumber: null,
    courtPosition,
    benchOrder,
  };
}

/// The board the default roster (a, b, c, nobody placed) loads as.
const UNTOUCHED = JSON.stringify({ starters: {}, bench: ["a", "b", "c"] });

function board(starters: Record<string, string>, bench: string[]): string {
  return JSON.stringify({ starters, bench });
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  data.set("teamId", "team-1");
  data.set("baseline", UNTOUCHED);
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
  requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
  getTeamById.mockResolvedValue({ id: "team-1", sport: "BASKETBALL" });
  getDepthChart.mockResolvedValue([row("a"), row("b"), row("c")]);
  saveDepthChart.mockResolvedValue(undefined);
});

describe("saveDepthChartAction", () => {
  it("checks write access as a coach before reading the payload", async () => {
    requireTeamAccess.mockRejectedValue(new TeamAccessError("nope", "no-membership"));

    expect(
      await redirectUrlOf(saveDepthChartAction(form({ depth: "not json" }))),
    ).toBe("/t/team-1/chart/depth?error=access");
    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", {
      intent: "write",
      minRole: "COACH",
    });
    expect(getDepthChart).not.toHaveBeenCalled();
  });

  it("saves the starters and numbers the bench from the submitted order", async () => {
    const url = await redirectUrlOf(
      saveDepthChartAction(form({ depth: board({ POINT_GUARD: "b" }, ["c", "a"]) })),
    );

    expect(url).toBe("/t/team-1/chart/depth?saved=1");
    expect(saveDepthChart).toHaveBeenCalledWith("team-1", [
      { entryId: "b", courtPosition: "POINT_GUARD", benchOrder: null },
      { entryId: "c", courtPosition: null, benchOrder: 1 },
      { entryId: "a", courtPosition: null, benchOrder: 2 },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/t/[teamId]/view", "page");
  });

  it("refuses a forged POST against a baseball team", async () => {
    getTeamById.mockResolvedValue({ id: "team-1", sport: "BASEBALL" });

    expect(
      await redirectUrlOf(
        saveDepthChartAction(form({ depth: board({ CENTER: "a" }, []) })),
      ),
    ).toBe("/t/team-1/chart/depth?error=access");
    expect(saveDepthChart).not.toHaveBeenCalled();
  });

  it("refuses a payload it cannot read", async () => {
    expect(
      await redirectUrlOf(saveDepthChartAction(form({ depth: "{" }))),
    ).toBe("/t/team-1/chart/depth?error=invalid-depth");
    expect(
      await redirectUrlOf(
        saveDepthChartAction(form({ depth: JSON.stringify({ CENTER: ["a"] }) })),
      ),
    ).toBe("/t/team-1/chart/depth?error=invalid-depth");
  });

  it("refuses an entry from off the roster", async () => {
    expect(
      await redirectUrlOf(
        saveDepthChartAction(form({ depth: board({ CENTER: "z" }, []) })),
      ),
    ).toBe("/t/team-1/chart/depth?error=unknown-entry");
  });

  it("refuses when another coach saved since the board loaded", async () => {
    getDepthChart.mockResolvedValue([row("a", "CENTER"), row("b"), row("c")]);

    expect(
      await redirectUrlOf(
        saveDepthChartAction(form({ depth: board({ CENTER: "b" }, ["a", "c"]) })),
      ),
    ).toBe("/t/team-1/chart/depth?error=chart-changed");
    expect(saveDepthChart).not.toHaveBeenCalled();
  });

  it("saves over a matching baseline", async () => {
    getDepthChart.mockResolvedValue([row("a", "CENTER"), row("b", null, 1), row("c")]);

    expect(
      await redirectUrlOf(
        saveDepthChartAction(
          form({
            depth: board({ CENTER: "b" }, ["a", "c"]),
            baseline: board({ CENTER: "a" }, ["b", "c"]),
          }),
        ),
      ),
    ).toBe("/t/team-1/chart/depth?saved=1");
  });

  it("translates a unique-index race into a friendly error", async () => {
    saveDepthChart.mockRejectedValue({ code: "P2002", meta: { target: "x" } });

    expect(
      await redirectUrlOf(
        saveDepthChartAction(form({ depth: board({ CENTER: "a" }, []) })),
      ),
    ).toBe("/t/team-1/chart/depth?error=depth-conflict");
  });

  it("translates a vanished roster entry", async () => {
    saveDepthChart.mockRejectedValue({ code: "P2025" });

    expect(
      await redirectUrlOf(
        saveDepthChartAction(form({ depth: board({ CENTER: "a" }, []) })),
      ),
    ).toBe("/t/team-1/chart/depth?error=roster-changed");
  });
});
