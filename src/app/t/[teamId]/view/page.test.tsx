import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const nextGame = vi.fn();
const getChart = vi.fn();
const listEventRsvps = vi.fn();
const guardedRosteredPlayerIds = vi.fn();
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
  guardedRosteredPlayerIds: (...args: unknown[]) =>
    guardedRosteredPlayerIds(...args),
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: (...args: unknown[]) => getTeamById(...args),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { FIELD_ART } from "@/components/diamond-geometry";
import {
  GUARDED_STYLE,
  YOUR_PLAYER_SR_SUFFIX,
  YOUR_PLAYER_TEXT,
} from "@/components/guarded-style";
import { TeamAccessError } from "@/lib/team-access";
import ViewPage from "./page";

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
  // Every test below this line describes a viewer who guards nobody on this
  // team unless it says otherwise — which is also the AC5 case, so the
  // existing assertions double as the regression net for "no change for
  // viewers guarding no players".
  guardedRosteredPlayerIds.mockResolvedValue(new Set());
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


describe("ViewPage guarded-player highlight", () => {
  /// The page's whole job for a parent is "find my kid"; #49 is the page doing
  /// the finding instead of making them scan twelve names.
  const twoFamilies = [
    {
      playerId: "ava",
      playerName: "Ava Castellanos",
      jerseyNumber: 7,
      battingOrder: 1,
      position: "SHORTSTOP" as const,
    },
    {
      playerId: "ben",
      playerName: "Ben Ortiz",
      jerseyNumber: 12,
      battingOrder: 2,
      position: "PITCHER" as const,
    },
  ];

  beforeEach(() => {
    getChart.mockResolvedValue(twoFamilies);
  });

  it("asks who is reading, scoped to this team", async () => {
    // Scoped, not just "which kids does this user guard": a kid they guard on
    // another team must not light up here, and the intersection is what stops
    // it.
    await render();

    expect(guardedRosteredPlayerIds).toHaveBeenCalledWith("team-1", "user-1");
  });

  it("halos the reader's own kid on the diamond", async () => {
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["ava"]));

    const html = await render();

    expect(html).toContain(GUARDED_STYLE.haloClassName);
  });

  it("draws exactly one halo when the reader guards one of two players", async () => {
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["ava"]));

    const html = await render();

    expect(html.split(GUARDED_STYLE.haloClassName)).toHaveLength(2);
  });

  it("halos both when a reader has two kids on the team", async () => {
    // Siblings on one roster is ordinary, and the diamond geometry allows two
    // rings at once (Diamond.test.tsx pins that they never touch).
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["ava", "ben"]));

    const html = await render();

    expect(html.split(GUARDED_STYLE.haloClassName)).toHaveLength(3);
  });

  it("steps the guarded marker up once, and nobody else", async () => {
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["ava"]));

    const html = await render();

    expect(html.split("animate-step-up")).toHaveLength(2);
  });

  it("marks the reader's own kid in the batting order", async () => {
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["ava"]));

    const html = await render();
    const lineupHtml = html.slice(html.indexOf("Batting order"));

    expect(lineupHtml).toContain(YOUR_PLAYER_TEXT);
    expect(lineupHtml).toContain(GUARDED_STYLE.rowClassName);
  });

  it("says it in words too, never colour alone", async () => {
    // design-plan.md §10. A colour-blind parent reads this page in sunlight
    // like everyone else.
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["ava"]));

    const html = await render();

    expect(html).toContain(YOUR_PLAYER_TEXT);
  });

  it("announces the reader's players to a screen reader", async () => {
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["ava"]));

    const html = await render();

    // Full name in the mirror, not the marker abbreviation — a screen reader
    // has no 40px marker to fit inside. The suffix comes last, after the RSVP
    // state, so the sentence still reads as one clause.
    expect(html).toContain(
      `Ava Castellanos, No response ${YOUR_PLAYER_SR_SUFFIX}`,
    );
  });

  it("does not announce a player the reader does not guard", async () => {
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["ava"]));

    const html = await render();

    expect(html).toContain("Ben Ortiz, No response</li>");
    expect(html).not.toContain(
      `Ben Ortiz, No response ${YOUR_PLAYER_SR_SUFFIX}`,
    );
  });

  it("changes nothing at all for a viewer guarding no players", async () => {
    // AC5, asserted directly rather than left to the other tests' silence: a
    // coach with no kid on the team must see the page they saw before #49.
    const html = await render();

    expect(html).not.toContain(GUARDED_STYLE.haloClassName);
    expect(html).not.toContain(GUARDED_STYLE.rowClassName);
    expect(html).not.toContain(YOUR_PLAYER_TEXT);
    expect(html).not.toContain(YOUR_PLAYER_SR_SUFFIX);
    expect(html).not.toContain("animate-step-up");
  });

  it("draws the fence in chalk, having spent the banana on the kid", async () => {
    // design-plan.md §2 allows exactly one banana per screen, and #49 moved
    // /view's from the wall to the reader's child. Pinned on the fence circle
    // itself rather than on "no banana in the diamond" — the halo is banana,
    // and that is the whole point.
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["ava"]));

    const html = await render();

    expect(html).toContain(`r="${FIELD_ART.fenceRadius}" class="fill-none stroke-chalk"`);
    expect(html).not.toContain(
      `r="${FIELD_ART.fenceRadius}" class="fill-none stroke-banana"`,
    );
  });

  it("leaves the halo as the diamond's only banana", async () => {
    // Two bananas is a fruit stand (design-plan.md §2). One halo, one guarded
    // kid, nothing else yellow on the field.
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["ava"]));

    const html = await render();
    const diamondHtml = html.slice(
      html.indexOf("Positions"),
      html.indexOf("Batting order"),
    );

    expect(diamondHtml.split("stroke-banana")).toHaveLength(2);
  });
});

describe("ViewPage duplicate first names", () => {
  const twoAvas = [
    {
      playerId: "ava-c",
      playerName: "Ava Castellanos",
      jerseyNumber: 7,
      battingOrder: 1,
      position: "SHORTSTOP" as const,
    },
    {
      playerId: "ava-r",
      playerName: "Ava Rodriguez",
      jerseyNumber: 12,
      battingOrder: 2,
      position: "PITCHER" as const,
    },
  ];

  it("gives both Avas a last initial on the diamond", async () => {
    // Two kids named Ava is ordinary on a youth roster, and two markers
    // reading "Ava" is worse than useless to the parent of one of them.
    getChart.mockResolvedValue(twoAvas);

    const html = await render();

    expect(html).toContain(">Ava C.</text>");
    expect(html).toContain(">Ava R.</text>");
  });

  it("keeps the full names in the batting order", async () => {
    getChart.mockResolvedValue(twoAvas);

    const html = await render();
    const lineupHtml = html.slice(html.indexOf("Batting order"));

    expect(lineupHtml).toContain("Ava Castellanos");
    expect(lineupHtml).toContain("Ava Rodriguez");
  });

  it("leaves a lone Ava as just Ava", async () => {
    const html = await render();

    expect(html).toContain(">Ava</text>");
  });
});

describe("ViewPage bench", () => {
  const benched = [
    {
      playerId: "ava",
      playerName: "Ava Castellanos",
      jerseyNumber: 7,
      battingOrder: 1,
      position: "SHORTSTOP" as const,
    },
    {
      playerId: "eli",
      playerName: "Eli Nakamura",
      jerseyNumber: 9,
      battingOrder: null,
      position: null,
    },
  ];

  it("lists a benched player rather than rendering them nowhere", async () => {
    // Before #49 Eli appeared on neither the diamond nor the order, so his
    // parent got a page that said nothing whatsoever about their kid.
    getChart.mockResolvedValue(benched);

    const html = await render();

    expect(html).toContain("Bench");
    expect(html).toContain("Eli Nakamura");
  });

  it("marks the reader's own kid on the bench too", async () => {
    getChart.mockResolvedValue(benched);
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["eli"]));

    const html = await render();
    const benchHtml = html.slice(html.indexOf("Bench"));

    expect(benchHtml).toContain(YOUR_PLAYER_TEXT);
    expect(benchHtml).toContain(GUARDED_STYLE.rowClassName);
  });

  it("draws no bench for an allPlay team — those players are the outfield", async () => {
    // Calling them benched would tell those parents their kid is sitting when
    // the diamond two inches above shows them in the outfield zone.
    getTeamById.mockResolvedValue({ id: "team-1", allPlay: true, archivedAt: null });
    getChart.mockResolvedValue(benched);

    const html = await render();

    expect(html).not.toContain("Bench");
    expect(html).toContain("Eli Nakamura");
  });

  it("draws no bench card when everyone is placed", async () => {
    const html = await render();

    expect(html).not.toContain("Bench");
  });

  it("does not call a batter without a fielding spot benched", async () => {
    // Regression: `unassigned` holds anyone the diamond doesn't seat, which
    // includes a kid batting third who simply isn't fielding. Listing them
    // under "Bench" would duplicate them *and* tell their parent they're
    // sitting when they're batting third.
    getChart.mockResolvedValue([
      {
        playerId: "ava",
        playerName: "Ava Castellanos",
        jerseyNumber: 7,
        battingOrder: 1,
        position: "SHORTSTOP" as const,
      },
      {
        playerId: "ben",
        playerName: "Ben Ortiz",
        jerseyNumber: 12,
        battingOrder: 2,
        position: null,
      },
    ]);

    const html = await render();

    expect(html).not.toContain("Bench");
    // Still in the order, once.
    expect(html.split("Ben Ortiz")).toHaveLength(2);
  });

  it("benches only the player who is in neither column", async () => {
    getChart.mockResolvedValue([
      {
        playerId: "ben",
        playerName: "Ben Ortiz",
        jerseyNumber: 12,
        battingOrder: 2,
        position: null,
      },
      {
        playerId: "eli",
        playerName: "Eli Nakamura",
        jerseyNumber: 9,
        battingOrder: null,
        position: null,
      },
    ]);

    const html = await render();
    const benchHtml = html.slice(html.indexOf("Bench"));

    expect(benchHtml).toContain("Eli Nakamura");
    expect(benchHtml).not.toContain("Ben Ortiz");
  });

  it("gives a benched player no batting slot number", async () => {
    // A zero in a jersey dot reads as batting position zero, not as "no slot".
    getChart.mockResolvedValue(benched);

    const html = await render();
    const benchHtml = html.slice(html.indexOf("Bench"));

    expect(benchHtml).not.toContain(">0<");
  });
});
