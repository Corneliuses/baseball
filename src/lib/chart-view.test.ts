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
    const view = buildChartView(fullChart, noRsvps);

    expect(view.lineup.map((p) => p.playerId)).toEqual(["ben", "ava", "cy"]);
  });

  it("excludes benched players from the lineup", () => {
    const view = buildChartView(fullChart, noRsvps);

    expect(view.lineup.some((p) => p.playerId === "eli")).toBe(false);
  });

  it("collects players with no position, in roster order", () => {
    // The outfield on an allPlay team, the bench otherwise — buildChartView
    // doesn't know which, and deliberately doesn't decide.
    const view = buildChartView(fullChart, noRsvps);

    expect(view.unassigned.map((p) => p.playerId)).toEqual(["eli"]);
  });

  it("attaches RSVP state to unassigned players like everyone else", () => {
    const view = buildChartView(
      fullChart,
      new Map<string, RsvpState>([["eli", "declined"]]),
    );

    expect(view.unassigned[0].rsvpState).toBe("declined");
  });

  it("maps assigned positions to their player", () => {
    const view = buildChartView(fullChart, noRsvps);

    expect(view.byPosition.get("SHORTSTOP")?.playerId).toBe("ava");
    expect(view.byPosition.get("PITCHER")?.playerId).toBe("ben");
    expect(view.byPosition.get("FIRST_BASE")?.playerId).toBe("cy");
    expect(view.byPosition.has("CATCHER")).toBe(false);
  });

  it("defaults an unrepresented player's rsvpState to no-response", () => {
    const view = buildChartView(fullChart, noRsvps);

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

    const view = buildChartView(fullChart, rsvps);

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

    const view = buildChartView(fullChart, allDeclined);

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

    expect(buildChartView(partial, noRsvps).hasChart).toBe(true);
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

    expect(buildChartView(partial, noRsvps).hasChart).toBe(true);
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

    expect(buildChartView(empty, noRsvps).hasChart).toBe(false);
  });

  it("reports hasChart false for an empty roster", () => {
    expect(buildChartView([], noRsvps).hasChart).toBe(false);
  });

  it("returns empty results for an empty roster", () => {
    const view = buildChartView([], noRsvps);

    expect(view.lineup).toEqual([]);
    expect(view.byPosition.size).toBe(0);
  });
});
