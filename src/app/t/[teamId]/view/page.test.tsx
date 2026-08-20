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
    playerId: "ava",
    playerName: "Ava",
    jerseyNumber: 7,
    battingOrder: 1,
    position: "SHORTSTOP" as const,
  },
  {
    playerId: "ben",
    playerName: "Ben",
    jerseyNumber: 12,
    battingOrder: 2,
    position: "PITCHER" as const,
  },
];

async function render(teamId = "team-1") {
  const { default: ViewPage } = await import("./page");
  return renderToStaticMarkup(
    await ViewPage({ params: Promise.resolve({ teamId }) }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });
  nextGame.mockResolvedValue(game);
  getChart.mockResolvedValue(fullChart);
  listEventRsvps.mockResolvedValue([]);
  // allPlay off by default here so the existing assertions describe the
  // nine-named-positions diamond; the allPlay cases set it explicitly.
  getTeamById.mockResolvedValue({ id: "team-1", allPlay: false, archivedAt: null });
});

describe("ViewPage access", () => {
  it("is readable by a parent", async () => {
    await expect(render()).resolves.toBeDefined();
    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", { intent: "read" });
  });

  it("calls notFound() for someone with no membership", async () => {
    requireTeamAccess.mockRejectedValue(new TeamAccessError("nope", "no-membership"));

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("re-throws non-access errors instead of masking them as 404", async () => {
    requireTeamAccess.mockRejectedValue(new Error("db down"));

    await expect(render()).rejects.toThrow("db down");
  });
});

describe("ViewPage with no upcoming game", () => {
  // The chart is standing, not per-game — it outlives the schedule, so a
  // parent between games (or after the season's last one) still sees it.
  it("still shows the standing chart under a no-upcoming-game header", async () => {
    nextGame.mockResolvedValue(null);

    const html = await render();

    expect(html).toContain("No upcoming game");
    expect(html).toContain("Ava");
    expect(html).toContain("Batting order");
    expect(html).toContain(">SS<");
  });

  it("drops every RSVP decoration — there is no game to respond to", async () => {
    nextGame.mockResolvedValue(null);

    const html = await render();

    expect(listEventRsvps).not.toHaveBeenCalled();
    expect(html).not.toContain("No response");
    expect(html).not.toContain("Going");
    expect(html).not.toContain("RSVP is just for planning");
  });

  it("shows the no-chart empty state when there is no game and no chart", async () => {
    nextGame.mockResolvedValue(null);
    getChart.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain("No upcoming game");
    expect(html).toContain("No chart set yet");
  });
});

describe("ViewPage empty states", () => {
  it("shows a no-chart-set-yet empty state when every roster entry is benched", async () => {
    getChart.mockResolvedValue([
      {
        playerId: "ava",
        playerName: "Ava",
        jerseyNumber: null,
        battingOrder: null,
        position: null,
      },
    ]);

    const html = await render();

    expect(html).toContain("No chart set yet");
  });

  it("still shows the next-game header on the no-chart empty state", async () => {
    getChart.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain("Hawks");
    expect(html).toContain("No chart set yet");
  });
});

describe("ViewPage chart rendering", () => {
  it("renders every position label from POSITION_LABELS", async () => {
    const html = await render();

    for (const label of ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"]) {
      expect(html).toContain(`>${label}<`);
    }
  });

  it("renders the batting order sorted ascending", async () => {
    const html = await render();
    // Scope to the batting-order list — the diamond above it renders players
    // in scorebook position order, not batting order, so searching the whole
    // page would find whichever player's position comes first on the field.
    const lineupHtml = html.slice(html.indexOf("Batting order"));

    expect(lineupHtml.indexOf("Ava")).toBeLessThan(lineupHtml.indexOf("Ben"));
  });

  it("keeps a declined player in their slot, greyed, tagged Not going", async () => {
    listEventRsvps.mockResolvedValue([{ playerId: "ava", attending: false }]);

    const html = await render();

    expect(html).toContain("Ava");
    expect(html).toContain("Not going");
  });

  it("tags a no-response player distinctly, never as out", async () => {
    listEventRsvps.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain("No response");
    expect(html).not.toMatch(/>Out</);
  });

  it("shows Going for an attending player", async () => {
    listEventRsvps.mockResolvedValue([{ playerId: "ben", attending: true }]);

    const html = await render();

    expect(html).toContain("Going");
  });

  it("shortens to a first name on the diamond but keeps the full name in the order", async () => {
    getChart.mockResolvedValue([
      {
        playerId: "ava",
        playerName: "Ava Castellanos",
        jerseyNumber: 7,
        battingOrder: 1,
        position: "SHORTSTOP" as const,
      },
    ]);

    const html = await render();
    const lineupHtml = html.slice(html.indexOf("Batting order"));

    // The marker carries the short form; the list carries the whole name.
    expect(html).toContain(">Ava</text>");
    expect(lineupHtml).toContain("Ava Castellanos");
  });

  it("shows an allPlay team's unplaced players as the outfield, not as Open spots", async () => {
    // allPlay defaults to true, so this is the common case. LF/CF/RF are one
    // zone for these teams (#11 Decision 1) and the kids out there persist as
    // position = null — drawing three Open markers would both misreport the
    // spots and leave those kids off the diamond entirely.
    getTeamById.mockResolvedValue({ id: "team-1", allPlay: true, archivedAt: null });
    getChart.mockResolvedValue([
      ...fullChart,
      {
        playerId: "cal",
        playerName: "Cal",
        jerseyNumber: 3,
        battingOrder: 3,
        position: null,
      },
    ]);

    const html = await render();

    expect(html).toContain("Outfield");
    expect(html).toContain("Cal");
    for (const label of ["LF", "CF", "RF"]) {
      expect(html).not.toContain(`>${label}<`);
    }
    // On the grass, in a circle, like everyone else — not listed underneath.
    // A parent looking for their kid scans the diamond, not a caption.
    expect(html).toContain(">OF<");
  });

  it("draws one OF marker per outfielder on an allPlay team", async () => {
    getTeamById.mockResolvedValue({ id: "team-1", allPlay: true, archivedAt: null });
    getChart.mockResolvedValue([
      ...fullChart,
      ...["cal", "dee", "eli"].map((playerId, index) => ({
        playerId,
        playerName: playerId,
        jerseyNumber: 20 + index,
        battingOrder: 3 + index,
        position: null,
      })),
    ]);

    const html = await render();

    expect(html.split(">OF<")).toHaveLength(4);
  });

  it("draws no catcher for an allPlay team — the coach pitches", async () => {
    getTeamById.mockResolvedValue({ id: "team-1", allPlay: true, archivedAt: null });

    const html = await render();

    expect(html).not.toContain(">C<");
    expect(html).toContain(">P<");
  });

  it("marks the empty catcher spot with a filled circle rather than a gap", async () => {
    // A blank spot behind the plate reads as something missing from the chart;
    // the disc says the level simply doesn't have the position.
    getTeamById.mockResolvedValue({ id: "team-1", allPlay: true, archivedAt: null });

    const html = await render();

    expect(html).toContain("fill-muted-foreground/30");
    expect(html).toContain("the coach pitches");
  });

  it("draws no such circle when a catcher is a real spot", async () => {
    // allPlay off by default in this file — nine named positions, C among them.
    const html = await render();

    expect(html).not.toContain("fill-muted-foreground/30");
  });

  it("shows an allPlay team's stale catcher row in the outfield", async () => {
    // Same as the stale named-outfield row: the spot isn't one this team
    // fields, so the kid stands in the outfield until the next save says so.
    getTeamById.mockResolvedValue({ id: "team-1", allPlay: true, archivedAt: null });
    getChart.mockResolvedValue([
      {
        playerId: "cal",
        playerName: "Cal",
        jerseyNumber: 3,
        battingOrder: 1,
        position: "CATCHER" as const,
      },
    ]);

    const html = await render();

    expect(html).toContain("Cal");
    expect(html).toContain(">OF<");
    expect(html).not.toContain(">C<");
  });

  it("shows an allPlay team's stale named-outfield row in the outfield", async () => {
    // Hand-set during #9, or left over from before allPlay was switched on.
    // The coach's next save collapses it; until then the kid is in the
    // outfield, which is both where the editor shows them and where that save
    // will put them. Drawing them at CF instead would land the marker on the
    // zone's own first coordinate, with two names on one spot.
    getTeamById.mockResolvedValue({ id: "team-1", allPlay: true, archivedAt: null });
    getChart.mockResolvedValue([
      {
        playerId: "cal",
        playerName: "Cal",
        jerseyNumber: 3,
        battingOrder: 1,
        position: "CENTER_FIELD" as const,
      },
    ]);

    const html = await render();

    expect(html).toContain("Cal");
    expect(html).toContain(">OF<");
    expect(html).not.toContain(">CF<");
  });

  it("draws one marker per player when a stale row sits beside a real outfielder", async () => {
    // The collision case: the zone's first coordinate IS center field.
    getTeamById.mockResolvedValue({ id: "team-1", allPlay: true, archivedAt: null });
    getChart.mockResolvedValue([
      {
        playerId: "cal",
        playerName: "Cal",
        jerseyNumber: 3,
        battingOrder: 1,
        position: "CENTER_FIELD" as const,
      },
      {
        playerId: "dee",
        playerName: "Dee",
        jerseyNumber: 4,
        battingOrder: 2,
        position: null,
      },
    ]);

    const html = await render();

    expect(html.split(">OF<")).toHaveLength(3);
    expect(html).not.toContain(">CF<");
  });

  it("exposes an allPlay outfield to screen readers", async () => {
    getTeamById.mockResolvedValue({ id: "team-1", allPlay: true, archivedAt: null });
    getChart.mockResolvedValue([
      ...fullChart,
      {
        playerId: "cal",
        playerName: "Cal",
        jerseyNumber: 3,
        battingOrder: 3,
        position: null,
      },
    ]);

    const html = await render();

    expect(html).toContain("Outfield:");
  });

  it("exposes every position assignment to screen readers", async () => {
    const html = await render();

    // The SVG is aria-hidden, so the sr-only list is the only accessible path
    // to who is playing where.
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("sr-only");
    expect(html).toContain("SS:");
    expect(html).toContain("Ava");
    // Unassigned positions are announced too, not skipped.
    expect(html).toContain("Open");
  });

  it("does not show the RSVP legend when no chart is set", async () => {
    getChart.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain("No chart set yet");
    expect(html).not.toContain("RSVP is just for planning");
  });
});

describe("ViewPage next-game card", () => {
  it("links to the game's event page, where RSVP lives", async () => {
    const html = await render();

    expect(html).toContain("/t/team-1/schedule/event-1");
    expect(html).toContain("Game details");
  });

  it("links the location to a map", async () => {
    const html = await render();

    expect(html).toContain("https://maps.google.com/?q=Field%203");
  });

  it("offers neither when there is no upcoming game", async () => {
    nextGame.mockResolvedValue(null);

    const html = await render();

    expect(html).not.toContain("Game details");
    expect(html).not.toContain("maps.google.com");
  });
});
