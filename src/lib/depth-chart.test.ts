import { describe, expect, it } from "vitest";

import {
  BENCH_ID,
  benchSlotId,
  boardOf,
  buildDepthDraft,
  courtSpotId,
  depthRole,
  depthSpotOf,
  hasDepthChartSet,
  placeOnBench,
  placeStarter,
  resolveDepthDrop,
  sameDepth,
  startingPositionOf,
  validateDepthChart,
  type DepthChartEntry,
} from "./depth-chart";

function entry(
  entryId: string,
  courtPosition: DepthChartEntry["courtPosition"] = null,
  benchOrder: number | null = null,
): DepthChartEntry {
  return {
    entryId,
    playerName: entryId.toUpperCase(),
    jerseyNumber: null,
    courtPosition,
    benchOrder,
  };
}

describe("buildDepthDraft", () => {
  it("seats starters and orders the bench, unplaced kids last in roster order", () => {
    const draft = buildDepthDraft([
      entry("a", "POINT_GUARD"),
      entry("b"),
      entry("c", null, 2),
      entry("d", null, 1),
      entry("e"),
      entry("f", "CENTER"),
    ]);

    expect(draft.starters).toEqual({
      POINT_GUARD: "a",
      SHOOTING_GUARD: null,
      SMALL_FORWARD: null,
      POWER_FORWARD: null,
      CENTER: "f",
    });
    expect(draft.bench).toEqual(["d", "c", "b", "e"]);
  });

  it("benches a second starter at one position rather than dropping them", () => {
    const draft = buildDepthDraft([
      entry("a", "CENTER"),
      entry("b", "CENTER"),
    ]);

    expect(draft.starters.CENTER).toBe("a");
    expect(draft.bench).toEqual(["b"]);
  });
});

describe("hasDepthChartSet", () => {
  it("is false until someone starts or has a bench slot", () => {
    expect(hasDepthChartSet([entry("a"), entry("b")])).toBe(false);
    expect(hasDepthChartSet([entry("a"), entry("b", "CENTER")])).toBe(true);
    expect(hasDepthChartSet([entry("a", null, 1)])).toBe(true);
  });
});

describe("depthSpotOf and depthRole", () => {
  const draft = buildDepthDraft([
    entry("a", "SMALL_FORWARD"),
    entry("b", null, 1),
    entry("c"),
  ]);

  it("names a starter by their position", () => {
    const spot = depthSpotOf(draft, "a");

    expect(spot).toEqual({ kind: "starter", position: "SMALL_FORWARD" });
    expect(depthRole(spot!)).toBe("Starting small forward");
  });

  // An unplaced kid joins the bottom of the bench, and Game Day numbers them
  // there — so the card has to say the same number, not "not placed".
  it("numbers the bench the way Game Day does, unplaced kids included", () => {
    expect(depthRole(depthSpotOf(draft, "b")!)).toBe("1st off the bench");
    expect(depthRole(depthSpotOf(draft, "c")!)).toBe("2nd off the bench");
  });

  it("is null for an entry the draft doesn't hold", () => {
    expect(depthSpotOf(draft, "zz")).toBeNull();
  });
});

describe("placeStarter", () => {
  const start = buildDepthDraft([
    entry("a", "POINT_GUARD"),
    entry("b", "CENTER"),
    entry("c", null, 1),
    entry("d", null, 2),
  ]);

  it("starts a bench player at an open spot, closing up the bench", () => {
    const next = placeStarter(start, "d", "SMALL_FORWARD");

    expect(next.starters.SMALL_FORWARD).toBe("d");
    expect(next.bench).toEqual(["c"]);
  });

  it("swaps a bench player with the starter, who takes their bench slot", () => {
    const next = placeStarter(start, "c", "POINT_GUARD");

    expect(next.starters.POINT_GUARD).toBe("c");
    expect(next.bench).toEqual(["a", "d"]);
  });

  it("swaps two starters", () => {
    const next = placeStarter(start, "a", "CENTER");

    expect(next.starters.CENTER).toBe("a");
    expect(next.starters.POINT_GUARD).toBe("b");
    expect(next.bench).toEqual(["c", "d"]);
  });

  it("moves a starter to an open spot, leaving their old one open", () => {
    const next = placeStarter(start, "a", "SHOOTING_GUARD");

    expect(next.starters.SHOOTING_GUARD).toBe("a");
    expect(next.starters.POINT_GUARD).toBeNull();
  });

  it("does not mutate the draft it was given", () => {
    placeStarter(start, "c", "POINT_GUARD");

    expect(start.starters.POINT_GUARD).toBe("a");
    expect(start.bench).toEqual(["c", "d"]);
  });
});

describe("placeOnBench", () => {
  const start = buildDepthDraft([
    entry("s", "CENTER"),
    entry("a", null, 1),
    entry("b", null, 2),
    entry("c", null, 3),
    entry("d", null, 4),
  ]);

  it("takes the slot dropped on, moving down the bench or up it", () => {
    expect(placeOnBench(start, "b", 3).bench).toEqual(["a", "c", "d", "b"]);
    expect(placeOnBench(start, "d", 1).bench).toEqual(["a", "d", "b", "c"]);
  });

  it("benches a starter at the slot, opening their spot", () => {
    const next = placeOnBench(start, "s", 0);

    expect(next.bench).toEqual(["s", "a", "b", "c", "d"]);
    expect(next.starters.CENTER).toBeNull();
    expect(startingPositionOf(next, "s")).toBeNull();
  });

  it("joins the end for an index past it", () => {
    expect(placeOnBench(start, "a", 99).bench).toEqual(["b", "c", "d", "a"]);
  });
});

describe("resolveDepthDrop", () => {
  const start = buildDepthDraft([entry("a", "POINT_GUARD"), entry("b", null, 1)]);

  it("leaves the board alone when dropped on nothing or somewhere unknown", () => {
    expect(resolveDepthDrop(start, "b", null)).toBe(start);
    expect(resolveDepthDrop(start, "b", "court:PITCHER")).toBe(start);
    expect(resolveDepthDrop(start, "b", "bench:x")).toBe(start);
    expect(resolveDepthDrop(start, "b", "nowhere")).toBe(start);
  });

  it("starts a player on a court drop", () => {
    expect(
      resolveDepthDrop(start, "b", courtSpotId("POINT_GUARD")).starters
        .POINT_GUARD,
    ).toBe("b");
  });

  it("benches at a slot, or at the end of the line", () => {
    expect(resolveDepthDrop(start, "a", benchSlotId(0)).bench).toEqual([
      "a",
      "b",
    ]);
    expect(resolveDepthDrop(start, "a", BENCH_ID).bench).toEqual(["b", "a"]);
  });
});

describe("boardOf and sameDepth", () => {
  it("omits open spots and compares bench order", () => {
    const draft = buildDepthDraft([entry("a", "CENTER"), entry("b"), entry("c")]);

    expect(boardOf(draft)).toEqual({ starters: { CENTER: "a" }, bench: ["b", "c"] });
    expect(
      sameDepth(boardOf(draft), { starters: { CENTER: "a" }, bench: ["b", "c"] }),
    ).toBe(true);
    expect(
      sameDepth(boardOf(draft), { starters: { CENTER: "a" }, bench: ["c", "b"] }),
    ).toBe(false);
    expect(
      sameDepth(boardOf(draft), { starters: { POINT_GUARD: "a" }, bench: ["b", "c"] }),
    ).toBe(false);
  });
});

describe("validateDepthChart", () => {
  const roster = ["a", "b", "c", "d"];

  it("writes starters, numbers the bench from 1, and leaves an omitted kid unplaced", () => {
    expect(
      validateDepthChart(
        { starters: { POINT_GUARD: "a" }, bench: ["c", "b"] },
        roster,
      ),
    ).toEqual({
      ok: true,
      assignments: [
        { entryId: "a", courtPosition: "POINT_GUARD", benchOrder: null },
        { entryId: "c", courtPosition: null, benchOrder: 1 },
        { entryId: "b", courtPosition: null, benchOrder: 2 },
      ],
    });
  });

  it("refuses a baseball position, even a prototype-shaped one", () => {
    expect(
      validateDepthChart({ starters: { PITCHER: "a" }, bench: [] }, roster),
    ).toEqual({ ok: false, reason: "invalid-position" });
    expect(
      validateDepthChart({ starters: { constructor: "a" }, bench: [] }, roster),
    ).toEqual({ ok: false, reason: "invalid-position" });
  });

  it("refuses an entry that is not on the roster", () => {
    expect(validateDepthChart({ starters: {}, bench: ["z"] }, roster)).toEqual({
      ok: false,
      reason: "unknown-entry",
    });
  });

  it("refuses a player both starting and benched", () => {
    expect(
      validateDepthChart({ starters: { CENTER: "a" }, bench: ["a"] }, roster),
    ).toEqual({ ok: false, reason: "duplicate-entry" });
  });
});
