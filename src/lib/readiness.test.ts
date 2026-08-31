import { describe, expect, it } from "vitest";
import { computeReadiness, type ChartEntry } from "@/lib/readiness";
import { buildRsvpStateMap, type RsvpRow, type RsvpState } from "@/lib/rsvp";

const chart: ChartEntry[] = [
  { playerId: "ava", playerName: "Ava", battingOrder: 1, position: "SHORTSTOP" },
  { playerId: "ben", playerName: "Ben", battingOrder: 2, position: "PITCHER" },
  { playerId: "cy", playerName: "Cy", battingOrder: 3, position: "FIRST_BASE" },
  { playerId: "dee", playerName: "Dee", battingOrder: 4, position: "LEFT_FIELD" },
  // Benched: allPlay = false leaves these null.
  { playerId: "eli", playerName: "Eli", battingOrder: null, position: null },
];

const everyone = chart.map((entry) => entry.playerId);

/// The default team through this file fields all nine named positions
/// (allPlay = false), which is what lets the fixture above put a kid at LF.
/// The allPlay cases pass `true` explicitly.
function states(rows: RsvpRow[]): Map<string, RsvpState> {
  return buildRsvpStateMap(everyone, rows);
}

/// Everybody said yes.
const allAttending = states(
  everyone.map((playerId) => ({ playerId, attending: true })),
);

/// Everybody said yes except the named players, who said no.
function allAttendingBut(...declinedIds: string[]): Map<string, RsvpState> {
  return states(
    everyone.map((playerId) => ({
      playerId,
      attending: !declinedIds.includes(playerId),
    })),
  );
}

describe("computeReadiness", () => {
  it("is ready when the whole chart is attending", () => {
    const result = computeReadiness(chart, allAttending, false);

    expect(result.ready).toBe(true);
    expect(result.declined).toEqual([]);
    expect(result.awaiting).toEqual([]);
    expect(result.uncoveredPositions).toEqual([]);
  });

  it("reports the declined player and the position they leave empty", () => {
    const result = computeReadiness(chart, allAttendingBut("ben"), false);

    expect(result.ready).toBe(false);
    expect(result.declined.map((e) => e.playerId)).toEqual(["ben"]);
    expect(result.uncoveredPositions).toEqual(["PITCHER"]);
  });

  it("closes ranks in the effective order without renumbering the chart", () => {
    const result = computeReadiness(chart, allAttendingBut("ben"), false);

    expect(result.effectiveOrder.map((e) => e.playerId)).toEqual([
      "ava",
      "cy",
      "dee",
    ]);
    // The standing chart is untouched — Cy still bats 3rd in it, not 2nd.
    expect(chart.find((e) => e.playerId === "cy")?.battingOrder).toBe(3);
  });

  it("ignores benched players entirely", () => {
    const result = computeReadiness(chart, allAttendingBut("eli"), false);

    expect(result.ready).toBe(true);
    expect(result.declined).toEqual([]);
    expect(result.awaiting).toEqual([]);
    expect(result.effectiveOrder).toHaveLength(4);
  });

  it("returns uncovered positions in scorebook order, not chart order", () => {
    const result = computeReadiness(
      chart,
      allAttendingBut("ben", "cy", "dee"),
      false,
    );

    expect(result.uncoveredPositions).toEqual([
      "PITCHER",
      "FIRST_BASE",
      "LEFT_FIELD",
    ]);
  });

  it("reports an empty chart as ready rather than throwing", () => {
    expect(computeReadiness([], new Map(), false).ready).toBe(true);
  });
});

describe("computeReadiness before anyone has answered", () => {
  it("is ready, with everyone awaiting and nothing uncovered", () => {
    // The defect this whole issue exists to fix: the old set-based check called
    // every batter absent and every position uncovered at this exact moment.
    const result = computeReadiness(chart, states([]), false);

    expect(result.ready).toBe(true);
    expect(result.declined).toEqual([]);
    expect(result.uncoveredPositions).toEqual([]);
    expect(result.awaiting.map((e) => e.playerId)).toEqual([
      "ava",
      "ben",
      "cy",
      "dee",
    ]);
  });

  it("keeps the whole batting order in the effective order", () => {
    const result = computeReadiness(chart, states([]), false);

    expect(result.effectiveOrder.map((e) => e.playerId)).toEqual([
      "ava",
      "ben",
      "cy",
      "dee",
    ]);
  });

  it("treats a player missing from the map as no-response, never as absent", () => {
    // Not merely "no-response" in the map — absent from it altogether, the
    // shape a caller building the map by hand can produce.
    const partial = new Map<string, RsvpState>([["ava", "attending"]]);

    const result = computeReadiness(chart, partial, false);

    expect(result.ready).toBe(true);
    expect(result.declined).toEqual([]);
    expect(result.awaiting.map((e) => e.playerId)).toEqual(["ben", "cy", "dee"]);
    expect(result.uncoveredPositions).toEqual([]);
  });
});

describe("computeReadiness across all three states", () => {
  it("splits declined from awaiting rather than merging them", () => {
    const result = computeReadiness(
      chart,
      states([
        { playerId: "ava", attending: true },
        { playerId: "ben", attending: false },
        // cy and dee have not answered.
      ]),
      false,
    );

    expect(result.ready).toBe(false);
    expect(result.declined.map((e) => e.playerId)).toEqual(["ben"]);
    expect(result.awaiting.map((e) => e.playerId)).toEqual(["cy", "dee"]);
    // Only Ben's spot. Silence uncovers nothing.
    expect(result.uncoveredPositions).toEqual(["PITCHER"]);
    expect(result.effectiveOrder.map((e) => e.playerId)).toEqual([
      "ava",
      "cy",
      "dee",
    ]);
  });

  it("gives different output for a declined player than for a silent one", () => {
    const declinedRun = computeReadiness(
      chart,
      states([{ playerId: "ben", attending: false }]),
      false,
    );
    const silentRun = computeReadiness(chart, states([]), false);

    expect(declinedRun.declined.map((e) => e.playerId)).toEqual(["ben"]);
    expect(declinedRun.uncoveredPositions).toEqual(["PITCHER"]);
    expect(declinedRun.ready).toBe(false);

    expect(silentRun.declined).toEqual([]);
    expect(silentRun.awaiting.map((e) => e.playerId)).toContain("ben");
    expect(silentRun.uncoveredPositions).toEqual([]);
    expect(silentRun.ready).toBe(true);
  });

  it("keeps a no-response player in the effective order but drops a declined one", () => {
    const result = computeReadiness(
      chart,
      states([{ playerId: "ava", attending: false }]),
      false,
    );

    expect(result.effectiveOrder.map((e) => e.playerId)).not.toContain("ava");
    // Ben, Cy and Dee are silent and still batting.
    expect(result.effectiveOrder.map((e) => e.playerId)).toEqual([
      "ben",
      "cy",
      "dee",
    ]);
  });

  it("is un-ready exactly when a decline affects the chart", () => {
    expect(computeReadiness(chart, states([]), false).ready).toBe(true);
    expect(computeReadiness(chart, allAttending, false).ready).toBe(true);
    expect(computeReadiness(chart, allAttendingBut("dee"), false).ready).toBe(
      false,
    );
    // A benched player's decline changes nothing on the field.
    expect(computeReadiness(chart, allAttendingBut("eli"), false).ready).toBe(
      true,
    );
  });

  it("reports both lists in batting order, slotless players last", () => {
    const mixed: ChartEntry[] = [
      { playerId: "cy", playerName: "Cy", battingOrder: 3, position: null },
      { playerId: "zed", playerName: "Zed", battingOrder: null, position: "CATCHER" },
      { playerId: "ava", playerName: "Ava", battingOrder: 1, position: "SHORTSTOP" },
    ];
    const rsvps = new Map<string, RsvpState>([
      ["ava", "declined"],
      ["cy", "declined"],
      ["zed", "declined"],
    ]);

    const result = computeReadiness(mixed, rsvps, false);

    expect(result.declined.map((e) => e.playerId)).toEqual(["ava", "cy", "zed"]);
  });
});

describe("computeReadiness and the positions a team actually fields", () => {
  it("names a position-only decliner who bats nowhere", () => {
    // Selective team: a kid can field without batting. The old check looked
    // only at the batting order, so this player's decline emptied shortstop
    // while naming nobody as out.
    const fielderOnly: ChartEntry[] = [
      { playerId: "ava", playerName: "Ava", battingOrder: 1, position: "PITCHER" },
      { playerId: "sam", playerName: "Sam", battingOrder: null, position: "SHORTSTOP" },
    ];
    const rsvps = new Map<string, RsvpState>([
      ["ava", "attending"],
      ["sam", "declined"],
    ]);

    const result = computeReadiness(fielderOnly, rsvps, false);

    expect(result.declined.map((e) => e.playerId)).toEqual(["sam"]);
    expect(result.uncoveredPositions).toEqual(["SHORTSTOP"]);
    expect(result.ready).toBe(false);
  });

  it("does not uncover a spot an allPlay team never fields", () => {
    // A stale CATCHER row — hand-seeded during #9, or left behind when allPlay
    // was switched on. That kid is in the outfield zone everywhere else in the
    // app; reporting C uncovered would hand the coach a hole they have no way
    // to fill.
    const stale: ChartEntry[] = [
      { playerId: "ava", playerName: "Ava", battingOrder: 1, position: "PITCHER" },
      { playerId: "cal", playerName: "Cal", battingOrder: 2, position: "CATCHER" },
    ];
    const rsvps = new Map<string, RsvpState>([
      ["ava", "attending"],
      ["cal", "declined"],
    ]);

    const result = computeReadiness(stale, rsvps, true);

    expect(result.uncoveredPositions).toEqual([]);
    // Still named as out — nobody disappears, only the phantom hole does.
    expect(result.declined.map((e) => e.playerId)).toEqual(["cal"]);
    expect(result.ready).toBe(false);
  });

  it("uncovers an allPlay team's named outfield spot when its only kid declined", () => {
    // LF/CF/RF are fielded allPlay spots since the named-outfield revision, so
    // a pinned centre fielder staying home is a real hole worth naming.
    const chart: ChartEntry[] = [
      { playerId: "ava", playerName: "Ava", battingOrder: 1, position: "PITCHER" },
      { playerId: "cal", playerName: "Cal", battingOrder: 2, position: "CENTER_FIELD" },
    ];
    const rsvps = new Map<string, RsvpState>([["cal", "declined"]]);

    const result = computeReadiness(chart, rsvps, true);

    expect(result.uncoveredPositions).toEqual(["CENTER_FIELD"]);
    expect(result.ready).toBe(false);
  });

  it("answers the same whatever order the chart rows arrive in", () => {
    // The regression: an over-capacity spot (three kids left at CF after
    // allPlay was switched off) used to be truncated to its capacity over
    // `getChart`'s unordered rows, so "is CF uncovered" depended on which row
    // came back first — the same team and the same RSVPs, a different answer
    // on a refresh. Every row stored there is asked instead.
    const at = (playerId: string): ChartEntry => ({
      playerId,
      playerName: playerId,
      battingOrder: null,
      position: "CENTER_FIELD",
    });
    const rows = [at("cal"), at("dee"), at("eli")];
    // One of the three is coming; the other two are out.
    const rsvps = new Map<string, RsvpState>([
      ["cal", "declined"],
      ["dee", "attending"],
      ["eli", "declined"],
    ]);

    for (const order of [rows, [...rows].reverse(), [rows[1], rows[2], rows[0]]]) {
      expect(computeReadiness(order, rsvps, false).uncoveredPositions).toEqual(
        [],
      );
    }

    const allOut = new Map<string, RsvpState>(
      rows.map((row) => [row.playerId, "declined" as RsvpState]),
    );
    for (const order of [rows, [...rows].reverse()]) {
      expect(computeReadiness(order, allOut, false).uncoveredPositions).toEqual([
        "CENTER_FIELD",
      ]);
    }
  });

  it("keeps a stacked outfield spot covered while any kid there is still coming", () => {
    // Named outfield spots seat up to three. One of two centre fielders
    // staying home doesn't empty centre field — but both of them does.
    const chart: ChartEntry[] = [
      { playerId: "cal", playerName: "Cal", battingOrder: 1, position: "CENTER_FIELD" },
      { playerId: "dee", playerName: "Dee", battingOrder: 2, position: "CENTER_FIELD" },
    ];

    const oneOut = computeReadiness(
      chart,
      new Map<string, RsvpState>([["cal", "declined"]]),
      true,
    );
    expect(oneOut.uncoveredPositions).toEqual([]);
    // The decline itself still surfaces; only the hole is not claimed.
    expect(oneOut.declined.map((e) => e.playerId)).toEqual(["cal"]);
    expect(oneOut.ready).toBe(false);

    const bothOut = computeReadiness(
      chart,
      new Map<string, RsvpState>([
        ["cal", "declined"],
        ["dee", "declined"],
      ]),
      true,
    );
    expect(bothOut.uncoveredPositions).toEqual(["CENTER_FIELD"]);
  });

  it("does uncover that same spot for a team that fields it", () => {
    const stale: ChartEntry[] = [
      { playerId: "ava", playerName: "Ava", battingOrder: 1, position: "PITCHER" },
      { playerId: "cal", playerName: "Cal", battingOrder: 2, position: "CENTER_FIELD" },
    ];
    const rsvps = new Map<string, RsvpState>([
      ["ava", "attending"],
      ["cal", "declined"],
    ]);

    const result = computeReadiness(stale, rsvps, false);

    expect(result.uncoveredPositions).toEqual(["CENTER_FIELD"]);
  });

  it("ignores an allPlay team's stale catcher row too", () => {
    const stale: ChartEntry[] = [
      { playerId: "cal", playerName: "Cal", battingOrder: 1, position: "CATCHER" },
    ];
    const rsvps = new Map<string, RsvpState>([["cal", "declined"]]);

    expect(computeReadiness(stale, rsvps, true).uncoveredPositions).toEqual([]);
    expect(computeReadiness(stale, rsvps, false).uncoveredPositions).toEqual([
      "CATCHER",
    ]);
  });
});
