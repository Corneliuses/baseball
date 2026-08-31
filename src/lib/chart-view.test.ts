import { describe, expect, it } from "vitest";
import {
  buildChartView,
  hasChartSet,
  seatedEntryIds,
  type ChartViewEntry,
} from "@/lib/chart-view";
import type { Position } from "@/generated/prisma/enums";
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

    expect(view.byPosition.get("SHORTSTOP")?.[0].playerId).toBe("ava");
    expect(view.byPosition.get("PITCHER")?.[0].playerId).toBe("ben");
    expect(view.byPosition.get("FIRST_BASE")?.[0].playerId).toBe("cy");
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
    expect(view.byPosition.get("SHORTSTOP")?.[0].rsvpState).toBe("declined");
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

  it("seats an allPlay team's named-outfield rows, stacked and sorted", () => {
    // LF/CF/RF are placeable spots under allPlay since the named-outfield
    // revision. The stack sorts jersey-then-name for the same reason the
    // pool does: getChart has no orderBy, and an unsorted stack reshuffles
    // between requests.
    const named = (playerId: string, jerseyNumber: number | null): ChartViewEntry => ({
      entryId: `re-${playerId}`,
      playerId,
      playerName: playerId,
      jerseyNumber,
      battingOrder: null,
      position: "CENTER_FIELD",
    });

    const view = buildChartView([named("zoe", 9), named("cal", 3)], noRsvps, true);

    expect(view.byPosition.get("CENTER_FIELD")?.map((p) => p.playerId)).toEqual([
      "cal",
      "zoe",
    ]);
    expect(view.unassigned).toEqual([]);
    expect(view.hasChart).toBe(true);
  });

  it("seats the same player whatever order the rows arrive in", () => {
    // The regression: the capacity cut ran over `getChart`'s unordered
    // findMany, so an over-capacity spot — three kids left at CF the moment
    // allPlay is switched off — seated whichever row Postgres happened to
    // return first. Same team, same data, a different centre fielder on a
    // refresh. Sorting BEFORE the cut is what makes the pick deterministic.
    const named = (playerId: string, jerseyNumber: number): ChartViewEntry => ({
      entryId: `re-${playerId}`,
      playerId,
      playerName: playerId,
      jerseyNumber,
      battingOrder: null,
      position: "CENTER_FIELD",
    });
    const rows = [named("cal", 9), named("dee", 3), named("eli", 5)];

    const seatedIn = (order: ChartViewEntry[]) =>
      buildChartView(order, noRsvps, false)
        .byPosition.get("CENTER_FIELD")!
        .map((player) => player.playerId);

    // Lowest jersey wins, from any starting order — including the reverse.
    expect(seatedIn(rows)).toEqual(["dee"]);
    expect(seatedIn([...rows].reverse())).toEqual(["dee"]);
    expect(seatedIn([rows[2], rows[0], rows[1]])).toEqual(["dee"]);
  });

  it("pools anyone past an outfield spot's capacity instead of dropping them", () => {
    const named = (playerId: string, jerseyNumber: number): ChartViewEntry => ({
      entryId: `re-${playerId}`,
      playerId,
      playerName: playerId,
      jerseyNumber,
      battingOrder: null,
      position: "CENTER_FIELD",
    });

    const four = [named("a", 1), named("b", 2), named("c", 3), named("d", 4)];
    const view = buildChartView(four, noRsvps, true);

    expect(view.byPosition.get("CENTER_FIELD")).toHaveLength(3);
    expect(view.unassigned.map((p) => p.playerId)).toEqual(["d"]);

    // allPlay off: the same spot holds one, so three of the four pool.
    const selective = buildChartView(four, noRsvps, false);
    expect(selective.byPosition.get("CENTER_FIELD")).toHaveLength(1);
    expect(selective.unassigned).toHaveLength(3);
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

    expect(view.byPosition.get("CENTER_FIELD")?.[0].playerId).toBe("cal");
    expect(view.unassigned).toEqual([]);
  });

  it("keeps the allPlay infield seated", () => {
    const view = buildChartView(fullChart, noRsvps, true);

    expect(view.byPosition.get("SHORTSTOP")?.[0].playerId).toBe("ava");
    expect(view.byPosition.get("PITCHER")?.[0].playerId).toBe("ben");
    expect(view.byPosition.get("FIRST_BASE")?.[0].playerId).toBe("cy");
    expect(view.unassigned.map((p) => p.playerId)).toEqual(["eli"]);
  });

  it("returns empty results for an empty roster", () => {
    const view = buildChartView([], noRsvps, false);

    expect(view.lineup).toEqual([]);
    expect(view.byPosition.size).toBe(0);
  });
});

describe("buildChartView diamond names", () => {
  /// Markers sit as little as 60px apart, so only a first name fits — which
  /// makes two Avas indistinguishable on the one page whose whole job is
  /// "find my kid" (#49).
  const chartOf = (names: [string, string][]): ChartViewEntry[] =>
    names.map(([playerId, playerName], index) => ({
      entryId: `re-${playerId}`,
      playerId,
      playerName,
      jerseyNumber: index + 1,
      battingOrder: index + 1,
      position: null,
    }));

  const namesById = (entries: ChartViewEntry[], allPlay = false) => {
    const view = buildChartView(entries, noRsvps, allPlay);
    return new Map(
      [...view.lineup, ...view.unassigned].map((p) => [p.playerId, p.diamondName]),
    );
  };

  it("uses the first name alone when nobody shares it", () => {
    const names = namesById(
      chartOf([
        ["ava", "Ava Castellanos"],
        ["ben", "Ben Ortiz"],
      ]),
    );

    expect(names.get("ava")).toBe("Ava");
    expect(names.get("ben")).toBe("Ben");
  });

  it("gives a last initial to BOTH players sharing a first name", () => {
    // Both, not just the later one: singling one out would tell a parent the
    // unlabelled "Ava" is definitively theirs, which is exactly backwards.
    const names = namesById(
      chartOf([
        ["ava-c", "Ava Castellanos"],
        ["ava-r", "Ava Rodriguez"],
      ]),
    );

    expect(names.get("ava-c")).toBe("Ava C.");
    expect(names.get("ava-r")).toBe("Ava R.");
  });

  it("disambiguates a three-way collision", () => {
    const names = namesById(
      chartOf([
        ["ava-c", "Ava Castellanos"],
        ["ava-r", "Ava Rodriguez"],
        ["ava-w", "Ava Whitfield"],
      ]),
    );

    expect([...names.values()].sort()).toEqual(["Ava C.", "Ava R.", "Ava W."]);
  });

  it("leaves everyone else alone when only one pair collides", () => {
    const names = namesById(
      chartOf([
        ["ava-c", "Ava Castellanos"],
        ["ava-r", "Ava Rodriguez"],
        ["ben", "Ben Ortiz"],
      ]),
    );

    expect(names.get("ben")).toBe("Ben");
  });

  it("counts a benched player against a seated one", () => {
    // The bench list draws names too (#49 AC6), and even if it didn't, a coach
    // reading "Ava" on the diamond next to "Ava" on the bench has the same
    // problem. Collisions are counted across every entry, not just the seated.
    const entries: ChartViewEntry[] = [
      {
        entryId: "re-seated",
        playerId: "seated",
        playerName: "Ava Castellanos",
        jerseyNumber: 7,
        battingOrder: 1,
        position: "SHORTSTOP",
      },
      {
        entryId: "re-benched",
        playerId: "benched",
        playerName: "Ava Rodriguez",
        jerseyNumber: 8,
        battingOrder: null,
        position: null,
      },
    ];

    const view = buildChartView(entries, noRsvps, false);

    expect(view.byPosition.get("SHORTSTOP")?.[0].diamondName).toBe("Ava C.");
    expect(view.unassigned[0].diamondName).toBe("Ava R.");
  });

  it("falls back to the whole string for a single-token name", () => {
    const names = namesById(chartOf([["cy", "Cy"]]));

    expect(names.get("cy")).toBe("Cy");
  });

  it("leaves a colliding single-token name unadorned rather than inventing an initial", () => {
    const names = namesById(
      chartOf([
        ["ava-1", "Ava"],
        ["ava-2", "Ava Rodriguez"],
      ]),
    );

    expect(names.get("ava-1")).toBe("Ava");
    expect(names.get("ava-2")).toBe("Ava R.");
  });

  it("counts a first name as shared regardless of how it was capitalized", () => {
    // Nothing normalizes a name on the way in — playerSchema only trims — so
    // a coach can type "ava" for one kid and "Ava" for another. A
    // case-sensitive count called those distinct and left two unlabelled
    // markers reading "Ava" and "ava".
    const names = namesById(
      chartOf([
        ["ava-c", "Ava Castellanos"],
        ["ava-r", "ava Rodriguez"],
      ]),
    );

    expect(names.get("ava-c")).toBe("Ava C.");
    expect(names.get("ava-r")).toBe("ava R.");
  });

  it("displays the name as the coach typed it, never recapitalized", () => {
    // The count folds case; the label must not. Rewriting "ava" to "Ava" on
    // the diamond would be a silent edit of the roster the coach entered.
    const names = namesById(
      chartOf([
        ["ava-c", "Ava Castellanos"],
        ["ava-r", "ava Rodriguez"],
      ]),
    );

    expect(names.get("ava-r")?.startsWith("ava")).toBe(true);
  });

  it("keeps two players sharing a first name AND a last initial identical", () => {
    // The accepted limitation, pinned so it stays a decision rather than
    // becoming a surprise: a full surname overruns a 64px-spaced marker. The
    // full names survive in every list, and on /view the guarded halo is what
    // separates these two for the reader who cares.
    const names = namesById(
      chartOf([
        ["ava-c", "Ava Castellanos"],
        ["ava-cr", "Ava Cruz"],
      ]),
    );

    expect(names.get("ava-c")).toBe("Ava C.");
    expect(names.get("ava-cr")).toBe("Ava C.");
  });

  it("uses the last token, not the second, for a three-part name", () => {
    const names = namesById(
      chartOf([
        ["ava-c", "Ava Marie Castellanos"],
        ["ava-r", "Ava Rodriguez"],
      ]),
    );

    expect(names.get("ava-c")).toBe("Ava C.");
  });

  it("tolerates ragged whitespace without emitting a blank label", () => {
    const names = namesById(chartOf([["ava", "  Ava   Castellanos  "]]));

    expect(names.get("ava")).toBe("Ava");
  });

  it("never touches playerName", () => {
    // diamondName is the abbreviation; lists and the sr-only mirror still need
    // the whole name, and overwriting it here would silently shorten both.
    const view = buildChartView(
      chartOf([
        ["ava-c", "Ava Castellanos"],
        ["ava-r", "Ava Rodriguez"],
      ]),
      noRsvps,
      false,
    );

    expect(view.lineup.map((p) => p.playerName)).toEqual([
      "Ava Castellanos",
      "Ava Rodriguez",
    ]);
  });
});

describe("hasChartSet", () => {
  const entry = (battingOrder: number | null, position: Position | null) => ({
    battingOrder,
    position,
  });

  it("is false for an empty roster and for a roster nobody has placed", () => {
    expect(hasChartSet([])).toBe(false);
    expect(hasChartSet([entry(null, null), entry(null, null)])).toBe(false);
  });

  // A chart entered incrementally by hand still counts — only a fully empty one
  // is "no chart set yet".
  it("is true as soon as one player has a slot or a position", () => {
    expect(hasChartSet([entry(1, null), entry(null, null)])).toBe(true);
    expect(hasChartSet([entry(null, "PITCHER"), entry(null, null)])).toBe(true);
  });
});

describe("seatedEntryIds", () => {
  const at = (
    playerId: string,
    jerseyNumber: number,
    position: Position | null,
  ): ChartViewEntry => ({
    entryId: `re-${playerId}`,
    playerId,
    playerName: playerId,
    jerseyNumber,
    battingOrder: null,
    position,
  });

  it("is exactly who buildChartView seats, so the pages cannot disagree", () => {
    const entries = [
      at("ava", 1, "PITCHER"),
      at("ben", 2, "CENTER_FIELD"),
      at("cal", 3, "CENTER_FIELD"),
      at("dee", 4, null),
      // Not a spot an allPlay team fields — the coach pitches.
      at("eli", 5, "CATCHER"),
    ];

    const view = buildChartView(entries, noRsvps, true);
    const seatedByView = new Set(
      [...view.byPosition.values()].flat().map((player) => player.entryId),
    );

    expect(seatedEntryIds(entries, true)).toEqual(seatedByView);
    expect(seatedEntryIds(entries, true)).toEqual(
      new Set(["re-ava", "re-ben", "re-cal"]),
    );
  });

  it("omits the kids an over-capacity spot cannot seat", () => {
    // The bug this exists for: with allPlay off, one kid stands at CF and the
    // other two are substitutes — so team home must not print "CF" for all
    // three while /view seats one.
    const entries = [
      at("ava", 1, "CENTER_FIELD"),
      at("ben", 2, "CENTER_FIELD"),
      at("cal", 3, "CENTER_FIELD"),
    ];

    expect(seatedEntryIds(entries, false)).toEqual(new Set(["re-ava"]));
    expect(seatedEntryIds(entries, true)).toEqual(
      new Set(["re-ava", "re-ben", "re-cal"]),
    );
  });

  it("does not depend on the order the rows arrive in", () => {
    const entries = [
      at("cal", 9, "CENTER_FIELD"),
      at("dee", 3, "CENTER_FIELD"),
    ];

    expect(seatedEntryIds(entries, false)).toEqual(
      seatedEntryIds([...entries].reverse(), false),
    );
    expect(seatedEntryIds(entries, false)).toEqual(new Set(["re-dee"]));
  });
});
