import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const nextGame = vi.fn();
const getChart = vi.fn();
const listEventRsvps = vi.fn();
const getTeamById = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/schedule", () => ({
  nextGame: (...args: unknown[]) => nextGame(...args),
}));

vi.mock("@/lib/roster", () => ({
  getChart: (...args: unknown[]) => getChart(...args),
}));

vi.mock("@/lib/rsvps", () => ({
  listEventRsvps: (...args: unknown[]) => listEventRsvps(...args),
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: (...args: unknown[]) => getTeamById(...args),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { TeamAccessError } from "@/lib/team-access";

const game = {
  id: "event-1",
  type: "GAME" as const,
  // 6:00 PM Central on 15 August 2026 (CDT, UTC-5).
  startsAt: new Date("2026-08-15T23:00:00Z"),
  location: "Field 3",
  opponent: "Hawks",
  notes: null,
};

const fullChart = [
  {
    entryId: "entry-ava",
    playerId: "ava",
    playerName: "Ava",
    jerseyNumber: 7,
    battingOrder: 1,
    position: "SHORTSTOP" as const,
  },
  {
    entryId: "entry-ben",
    playerId: "ben",
    playerName: "Ben",
    jerseyNumber: 12,
    battingOrder: 2,
    position: "PITCHER" as const,
  },
];

async function render(teamId = "team-1") {
  const { default: ReadinessPage } = await import("./page");
  return renderToStaticMarkup(
    await ReadinessPage({ params: Promise.resolve({ teamId }) }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
  nextGame.mockResolvedValue(game);
  getChart.mockResolvedValue(fullChart);
  listEventRsvps.mockResolvedValue([]);
  // allPlay off by default so the fixture's named positions are all spots this
  // team really fields; the allPlay case sets it explicitly.
  getTeamById.mockResolvedValue({ id: "team-1", allPlay: false, archivedAt: null });
});

describe("ReadinessPage access", () => {
  it("requires COACH, not merely membership", async () => {
    await expect(render()).resolves.toBeDefined();
    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", {
      intent: "read",
      minRole: "COACH",
    });
  });

  it("calls notFound() for a parent who pastes the URL", async () => {
    requireTeamAccess.mockRejectedValue(
      new TeamAccessError("nope", "insufficient-role"),
    );

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("re-throws non-access errors instead of masking them as 404", async () => {
    requireTeamAccess.mockRejectedValue(new Error("db down"));

    await expect(render()).rejects.toThrow("db down");
  });
});

describe("ReadinessPage empty states", () => {
  it("shows a no-upcoming-game empty state and never runs the chart reads", async () => {
    nextGame.mockResolvedValue(null);

    const html = await render();

    expect(html).toContain("No upcoming game");
    expect(getChart).not.toHaveBeenCalled();
    expect(listEventRsvps).not.toHaveBeenCalled();
  });

  it("shows a no-chart-set-yet state when every roster entry is benched", async () => {
    getChart.mockResolvedValue([
      {
        entryId: "entry-ava",
        playerId: "ava",
        playerName: "Ava",
        jerseyNumber: null,
        battingOrder: null,
        position: null,
      },
    ]);

    const html = await render();

    expect(html).toContain("No chart set yet");
    // Still headed by the game it would have checked.
    expect(html).toContain("Hawks");
  });
});

describe("ReadinessPage before anyone has answered", () => {
  it("reads as ready rather than alarming", async () => {
    const html = await render();

    expect(html).toContain("Ready for game day");
    expect(html).not.toContain("Needs attention");
    expect(html).not.toContain("Positions uncovered");
  });

  it("still lists everyone as awaiting a response", async () => {
    const html = await render();

    expect(html).toContain("No response");
    expect(html).toContain("Ava");
    expect(html).toContain("Ben");
  });
});

describe("ReadinessPage with a decline", () => {
  it("names who is out and which position that empties", async () => {
    listEventRsvps.mockResolvedValue([
      { playerId: "ava", attending: true },
      { playerId: "ben", attending: false },
    ]);

    const html = await render();

    expect(html).toContain("Needs attention");
    expect(html).toContain("Out");
    expect(html).toContain("Ben");
    expect(html).toContain("Positions uncovered");
    expect(html).toContain(">P<");
  });

  it("shows the declined player's slot and position alongside their name", async () => {
    listEventRsvps.mockResolvedValue([{ playerId: "ben", attending: false }]);

    const html = await render();

    expect(html).toContain("Bats 2nd");
  });

  it("labels a stale allPlay row as the outfield, not the position it stores", async () => {
    // The page must not print a spot it simultaneously refuses to check. The
    // view page and the editor both show this kid in the outfield; saying "CF"
    // here would make three screens disagree about one player.
    getTeamById.mockResolvedValue({ id: "team-1", allPlay: true, archivedAt: null });
    getChart.mockResolvedValue([
      {
        entryId: "entry-cal",
        playerId: "cal",
        playerName: "Cal",
        jerseyNumber: 3,
        battingOrder: 1,
        position: "CENTER_FIELD" as const,
      },
    ]);
    listEventRsvps.mockResolvedValue([{ playerId: "cal", attending: false }]);

    const html = await render();

    expect(html).toContain("Bats 1st · OF");
    expect(html).not.toContain("CF");
  });

  it("labels an allPlay team's unplaced player as the outfield too", async () => {
    getTeamById.mockResolvedValue({ id: "team-1", allPlay: true, archivedAt: null });
    getChart.mockResolvedValue([
      {
        entryId: "entry-cal",
        playerId: "cal",
        playerName: "Cal",
        jerseyNumber: 3,
        battingOrder: 2,
        position: null,
      },
    ]);
    listEventRsvps.mockResolvedValue([{ playerId: "cal", attending: false }]);

    const html = await render();

    expect(html).toContain("Bats 2nd · OF");
  });

  it("keeps real position labels on a team that fields them", async () => {
    listEventRsvps.mockResolvedValue([{ playerId: "ava", attending: false }]);

    const html = await render();

    expect(html).toContain("Bats 1st · SS");
  });

  it("does not report a spot an allPlay team never fields", async () => {
    getTeamById.mockResolvedValue({ id: "team-1", allPlay: true, archivedAt: null });
    getChart.mockResolvedValue([
      {
        entryId: "entry-cal",
        playerId: "cal",
        playerName: "Cal",
        jerseyNumber: 3,
        battingOrder: 1,
        position: "CENTER_FIELD" as const,
      },
    ]);
    listEventRsvps.mockResolvedValue([{ playerId: "cal", attending: false }]);

    const html = await render();

    // Out, yes — but CF is not a spot this team can fill, so it is not a hole.
    expect(html).toContain("Cal");
    expect(html).toContain("Needs attention");
    expect(html).not.toContain("Positions uncovered");
  });
});

describe("ReadinessPage when everyone has answered", () => {
  it("does not head a card 'No response' while saying nobody is outstanding", async () => {
    listEventRsvps.mockResolvedValue([
      { playerId: "ava", attending: true },
      { playerId: "ben", attending: true },
    ]);

    const html = await render();

    expect(html).toContain("Everyone has answered");
    expect(html).not.toContain("No response");
  });

  it("still accounts for silence when only some have answered", async () => {
    listEventRsvps.mockResolvedValue([{ playerId: "ava", attending: true }]);

    const html = await render();

    expect(html).toContain("No response");
    expect(html).toContain("Ben");
  });
});

describe("ReadinessPage stays read-only", () => {
  it("offers no form or write action of its own, only links to the editors", async () => {
    listEventRsvps.mockResolvedValue([{ playerId: "ben", attending: false }]);

    const html = await render();

    // A form here would be a per-game write path — exactly what Decision 16
    // removed. The only affordances are links to the standing-chart editors.
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<button");
    expect(html).toContain('href="/t/team-1/chart"');
    expect(html).toContain('href="/t/team-1/chart/positions"');
  });

  it("says plainly that a change made from here is permanent", async () => {
    listEventRsvps.mockResolvedValue([{ playerId: "ben", attending: false }]);

    const html = await render();

    expect(html).toContain("permanent");
  });
});
