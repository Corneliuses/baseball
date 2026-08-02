import { describe, expect, it } from "vitest";
import { buildChartView, type ChartViewEntry } from "@/lib/chart-view";
import type { RsvpState } from "@/lib/rsvp";

const fullChart: ChartViewEntry[] = [
  {
    entryId: "re-ava",
    playerId: "ava",
    playerName: "Ava",
    jerseyNumber: 7,
    battingOrder: 2,
    position: "SHORTSTOP",
  },
  {
    entryId: "re-ben",
    playerId: "ben",
    playerName: "Ben",
    jerseyNumber: 4,
    battingOrder: 1,
    position: "PITCHER",
  },
  {
    entryId: "re-cy",
    playerId: "cy",
    playerName: "Cy",
    jerseyNumber: null,
    battingOrder: 3,
    position: "FIRST_BASE",
  },
  // Benched: allPlay = false leaves these null.
  { entryId: "re-eli", playerId: "eli", playerName: "Eli", jerseyNumber: 9, battingOrder: null, position: null },
];

const noRsvps = new Map<string, RsvpState>();

describe("buildChartView", () => {
  it("sorts the lineup ascending by batting order", () => {
    const view = buildChartView(fullChart, noRsvps, false);

    expect(view.lineup.map((p) => p.playerId)).toEqual(["ben", "ava", "cy"]);
  });

  it("excludes benched players from the lineup", () => {
    const view = buildChartView(fullChart, noRsvps, false);

    expect(view.lineup.some((p) => p.playerId === "eli")).toBe(false);
  });

  it("collects players the diamond doesn't seat", () => {
    // The outfield on an allPlay team, the bench otherwise — buildChartView
    // knows which spots are fielded, but deliberately doesn't name the zone.
    const view = buildChartView(fullChart, noRsvps, false);

    expect(view.unassigned.map((p) => p.playerId)).toEqual(["eli"]);
  });

  it("orders unassigned players by jersey, then name, unnumbered last", () => {
    // getChart is a findMany with no orderBy, so the input order is whatever
    // Postgres felt like — sorting here is what stops the outfield cluster
    // from reshuffling between two loads of the same page.
    const scrambled: ChartViewEntry[] = [
      { entryId: "re-4", playerId: "zoe", playerName: "Zoe", jerseyNumber: null, battingOrder: null, position: null },
      { entryId: "re-1", playerId: "cy", playerName: "Cy", jerseyNumber: 12, battingOrder: null, position: null },
      { entryId: "re-3", playerId: "ada", playerName: "Ada", jerseyNumber: null, battingOrder: null, position: null },
      { entryId: "re-2", playerId: "ben", playerName: "Ben", jerseyNumber: 3, battingOrder: null, position: null },
    ];

    const view = buildChartView(scrambled, noRsvps, false);

    expect(view.unassigned.map((p) => p.playerId)).toEqual([
      "ben", // 3
      "cy", // 12
      "ada", // unnumbered, alphabetical
      "zoe",
    ]);
  });

  it("attaches RSVP state to unassigned players like everyone else", () => {
    const view = buildChartView(
      fullChart,
      new Map<string, RsvpState>([["eli", "declined"]]),
      false,
    );

    expect(view.unassigned[0].rsvpState).toBe("declined");
  });

  it("maps assigned positions to their player", () => {
    const view = buildChartView(fullChart, noRsvps, false);

    expect(view.byPosition.get("SHORTSTOP")?.playerId).toBe("ava");
    expect(view.byPosition.get("PITCHER")?.playerId).toBe("ben");
    expect(view.byPosition.get("FIRST_BASE")?.playerId).toBe("cy");
    expect(view.byPosition.has("CATCHER")).toBe(false);
  });

  it("defaults an unrepresented player's rsvpState to no-response", () => {
    const view = buildChartView(fullChart, noRsvps, false);

    expect(view.lineup.find((p) => p.playerId === "ben")?.rsvpState).toBe(
      "no-response",
    );
  });

  it("attaches all three rsvp states without changing membership or order", () => {
    const rsvps = new Map<string, RsvpState>([
      ["ben", "attending"],
      ["ava", "declined"],
      ["cy", "no-response"],
    ]);

    const view = buildChartView(fullChart, rsvps, false);

    // Same order and membership as the no-rsvp case above.
    expect(view.lineup.map((p) => p.playerId)).toEqual(["ben", "ava", "cy"]);
    expect(view.lineup.map((p) => p.rsvpState)).toEqual([
      "attending",
      "declined",
      "no-response",
    ]);
    expect(view.byPosition.get("SHORTSTOP")?.rsvpState).toBe("declined");
  });

  it("never reorders, renumbers, or drops anyone based on rsvp state", () => {
    const allDeclined = new Map<string, RsvpState>([
      ["ben", "declined"],
      ["ava", "declined"],
      ["cy", "declined"],
    ]);

    const view = buildChartView(fullChart, allDeclined, false);

    expect(view.lineup.map((p) => p.playerId)).toEqual(["ben", "ava", "cy"]);
    expect(view.lineup.map((p) => p.battingOrder)).toEqual([1, 2, 3]);
    expect(view.byPosition.size).toBe(3);
  });

  it("reports hasChart true when only a batting order is set", () => {
    const partial: ChartViewEntry[] = [
      {
        entryId: "re-ava",
        playerId: "ava",
        playerName: "Ava",
        jerseyNumber: null,
        battingOrder: 1,
        position: null,
      },
    ];

    expect(buildChartView(partial, noRsvps, false).hasChart).toBe(true);
  });

  it("reports hasChart true when only a position is set", () => {
    const partial: ChartViewEntry[] = [
      {
        entryId: "re-ava",
        playerId: "ava",
        playerName: "Ava",
        jerseyNumber: null,
        battingOrder: null,
        position: "CATCHER",
      },
    ];

    expect(buildChartView(partial, noRsvps, false).hasChart).toBe(true);
  });

  it("reports hasChart false when every entry is fully benched", () => {
    const empty: ChartViewEntry[] = [
      {
        entryId: "re-ava",
        playerId: "ava",
        playerName: "Ava",
        jerseyNumber: null,
        battingOrder: null,
        position: null,
      },
    ];

    expect(buildChartView(empty, noRsvps, false).hasChart).toBe(false);
  });

  it("reports hasChart false for an empty roster", () => {
    expect(buildChartView([], noRsvps, false).hasChart).toBe(false);
  });

  it("pools an allPlay team's stale named-outfield row instead of seating it", () => {
    // The view page draws its outfield zone at the very coordinates a named
    // outfield marker occupies, so seating this player would stack two markers
    // on one spot and make both names unreadable. The editor already shows them
    // in its zone; this is what keeps the two diamonds telling one story.
    const stale: ChartViewEntry[] = [
      {
        entryId: "re-cal",
        playerId: "cal",
        playerName: "Cal",
        jerseyNumber: 3,
        battingOrder: 1,
        position: "CENTER_FIELD",
      },
    ];

    const view = buildChartView(stale, noRsvps, true);

    expect(view.byPosition.has("CENTER_FIELD")).toBe(false);
    expect(view.unassigned.map((p) => p.playerId)).toEqual(["cal"]);
    // Nobody vanishes, and the chart still counts as set.
    expect(view.hasChart).toBe(true);
  });

  it("pools an allPlay team's stale catcher row — the coach pitches", () => {
    const stale: ChartViewEntry[] = [
      {
        entryId: "re-cal",
        playerId: "cal",
        playerName: "Cal",
        jerseyNumber: 3,
        battingOrder: 1,
        position: "CATCHER",
      },
    ];

    const view = buildChartView(stale, noRsvps, true);

    expect(view.byPosition.has("CATCHER")).toBe(false);
    expect(view.unassigned.map((p) => p.playerId)).toEqual(["cal"]);
  });

  it("seats those same rows when allPlay is off", () => {
    const named: ChartViewEntry[] = [
      {
        entryId: "re-cal",
        playerId: "cal",
        playerName: "Cal",
        jerseyNumber: 3,
        battingOrder: 1,
        position: "CENTER_FIELD",
      },
    ];

    const view = buildChartView(named, noRsvps, false);

    expect(view.byPosition.get("CENTER_FIELD")?.playerId).toBe("cal");
    expect(view.unassigned).toEqual([]);
  });

  it("keeps the allPlay infield seated", () => {
    const view = buildChartView(fullChart, noRsvps, true);

    expect(view.byPosition.get("SHORTSTOP")?.playerId).toBe("ava");
    expect(view.byPosition.get("PITCHER")?.playerId).toBe("ben");
    expect(view.byPosition.get("FIRST_BASE")?.playerId).toBe("cy");
    expect(view.unassigned.map((p) => p.playerId)).toEqual(["eli"]);
  });

  it("returns empty results for an empty roster", () => {
    const view = buildChartView([], noRsvps, false);

    expect(view.lineup).toEqual([]);
    expect(view.byPosition.size).toBe(0);
  });
});
