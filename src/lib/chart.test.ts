import { describe, expect, it } from "vitest";

import type { Position } from "@/generated/prisma/enums";

import {
  buildBattingDraft,
  buildPositionsDraft,
  chartWriteFailure,
  droppablePositions,
  emptySlotId,
  nextDroppableId,
  placeAtPosition,
  placeInSlot,
  POSITION_POOL_ID,
  positionOf,
  resolveDrop,
  resolvePositionDrop,
  sameOrder,
  samePositions,
  storedBattingOrder,
  storedPositions,
  slotCount,
  unassign,
  UNASSIGNED_ID,
  unassignPosition,
  validateBattingOrder,
  validatePositions,
  type BattingDraft,
  type PositionsDraft,
} from "./chart";

function entry(entryId: string, battingOrder: number | null = null) {
  return { entryId, battingOrder };
}

function fielder(entryId: string, position: Position | null = null) {
  return { entryId, position };
}

/// A draft built by hand rather than through buildPositionsDraft, so a test
/// can start from an arbitrary board state.
function draftOf(
  allPlay: boolean,
  assigned: Partial<Record<Position, string>>,
  pool: string[] = [],
): PositionsDraft {
  return { positions: droppablePositions(allPlay), assigned, pool };
}

describe("slotCount", () => {
  it("gives every player a slot when allPlay is true", () => {
    expect(slotCount(0, true)).toBe(0);
    expect(slotCount(5, true)).toBe(5);
    expect(slotCount(12, true)).toBe(12);
  });

  it("caps at nine when allPlay is false", () => {
    expect(slotCount(12, false)).toBe(9);
    expect(slotCount(9, false)).toBe(9);
  });

  it("shrinks below nine when the roster is smaller", () => {
    expect(slotCount(5, false)).toBe(5);
    expect(slotCount(0, false)).toBe(0);
  });
});

describe("buildBattingDraft", () => {
  it("places assigned entries in battingOrder order", () => {
    const draft = buildBattingDraft(
      [entry("a", 3), entry("b", 1), entry("c", 2)],
      true,
    );
    expect(draft.slots).toEqual(["b", "c", "a"]);
    expect(draft.unassigned).toEqual([]);
  });

  it("packs sparse hand-set orders densely", () => {
    // #9 seeded battingOrder by hand in Studio — 1, 2, 5 is a real shape.
    const draft = buildBattingDraft(
      [entry("a", 1), entry("b", 2), entry("c", 5)],
      true,
    );
    expect(draft.slots).toEqual(["a", "b", "c"]);
  });

  it("fills remaining slots with unassigned players when allPlay is true", () => {
    const draft = buildBattingDraft(
      [entry("new-kid"), entry("a", 2), entry("b", 1)],
      true,
    );
    expect(draft.slots).toEqual(["b", "a", "new-kid"]);
    expect(draft.unassigned).toEqual([]);
  });

  it("pools unassigned players when allPlay is false", () => {
    const draft = buildBattingDraft(
      [entry("a", 1), entry("bench-1"), entry("bench-2")],
      false,
    );
    expect(draft.slots).toEqual(["a", null, null]);
    expect(draft.unassigned).toEqual(["bench-1", "bench-2"]);
  });

  it("overflows assigned players past the slot count into the pool", () => {
    // allPlay toggled off after a full 10-player order was set: 9 slots,
    // the 10th assigned player must be visible in the pool, not dropped.
    const entries = Array.from({ length: 10 }, (_, i) =>
      entry(`p${i + 1}`, i + 1),
    );
    const draft = buildBattingDraft(entries, false);
    expect(draft.slots).toEqual([
      "p1",
      "p2",
      "p3",
      "p4",
      "p5",
      "p6",
      "p7",
      "p8",
      "p9",
    ]);
    expect(draft.unassigned).toEqual(["p10"]);
  });

  it("handles an empty roster", () => {
    expect(buildBattingDraft([], true)).toEqual({ slots: [], unassigned: [] });
    expect(buildBattingDraft([], false)).toEqual({ slots: [], unassigned: [] });
  });

  it("handles a fully unset chart", () => {
    const draft = buildBattingDraft([entry("a"), entry("b")], false);
    expect(draft.slots).toEqual([null, null]);
    expect(draft.unassigned).toEqual(["a", "b"]);
  });
});

describe("placeInSlot", () => {
  const base: BattingDraft = {
    slots: ["a", "b", null],
    unassigned: ["x", "y"],
  };

  it("swaps two occupied slots", () => {
    const next = placeInSlot(base, "a", 1);
    expect(next.slots).toEqual(["b", "a", null]);
    expect(next.unassigned).toEqual(["x", "y"]);
  });

  it("moves a slotted entry to an empty slot, leaving its old slot empty", () => {
    const next = placeInSlot(base, "a", 2);
    expect(next.slots).toEqual([null, "b", "a"]);
  });

  it("swaps an unassigned entry with a slot occupant", () => {
    const next = placeInSlot(base, "x", 0);
    expect(next.slots).toEqual(["x", "b", null]);
    // The displaced player takes the dragged player's place in the pool.
    expect(next.unassigned).toEqual(["a", "y"]);
  });

  it("moves an unassigned entry into an empty slot", () => {
    const next = placeInSlot(base, "y", 2);
    expect(next.slots).toEqual(["a", "b", "y"]);
    expect(next.unassigned).toEqual(["x"]);
  });

  it("ignores a drop on the entry's own slot", () => {
    expect(placeInSlot(base, "a", 0)).toBe(base);
  });

  it("ignores unknown entries and out-of-range slots", () => {
    expect(placeInSlot(base, "nope", 0)).toBe(base);
    expect(placeInSlot(base, "a", -1)).toBe(base);
    expect(placeInSlot(base, "a", 3)).toBe(base);
  });

  it("never mutates its input", () => {
    placeInSlot(base, "x", 0);
    expect(base.slots).toEqual(["a", "b", null]);
    expect(base.unassigned).toEqual(["x", "y"]);
  });
});

describe("unassign", () => {
  const base: BattingDraft = { slots: ["a", "b"], unassigned: ["x"] };

  it("empties the entry's slot and appends it to the pool", () => {
    const next = unassign(base, "a");
    expect(next.slots).toEqual([null, "b"]);
    expect(next.unassigned).toEqual(["x", "a"]);
  });

  it("is a no-op for an entry already in the pool", () => {
    expect(unassign(base, "x")).toBe(base);
  });

  it("is a no-op for an unknown entry", () => {
    expect(unassign(base, "nope")).toBe(base);
  });

  it("never mutates its input", () => {
    unassign(base, "a");
    expect(base.slots).toEqual(["a", "b"]);
  });
});

describe("sameOrder", () => {
  it("compares slots element-wise", () => {
    expect(sameOrder(["a", null], ["a", null])).toBe(true);
    expect(sameOrder(["a", null], [null, "a"])).toBe(false);
    expect(sameOrder(["a"], ["a", null])).toBe(false);
  });
});

describe("storedBattingOrder", () => {
  it("reads the seated entries in batting order, benched ones omitted", () => {
    expect(
      storedBattingOrder([
        { entryId: "c", battingOrder: 3 },
        { entryId: "a", battingOrder: 1 },
        { entryId: "x", battingOrder: null },
        { entryId: "b", battingOrder: 2 },
      ]),
    ).toEqual(["a", "b", "c"]);
  });

  it("fingerprints the sequence, not the numbers", () => {
    // A hand-set sparse order and the compacted form of it seat the same
    // players in the same order, so a save landing on top of that renumber
    // loses nothing and must not be refused as a conflict.
    const sparse = [
      { entryId: "a", battingOrder: 1 },
      { entryId: "b", battingOrder: 2 },
      { entryId: "c", battingOrder: 5 },
    ];
    const compacted = [
      { entryId: "a", battingOrder: 1 },
      { entryId: "b", battingOrder: 2 },
      { entryId: "c", battingOrder: 3 },
    ];

    expect(sameOrder(storedBattingOrder(sparse), storedBattingOrder(compacted))).toBe(
      true,
    );
  });

  it("catches a move, a benching, and an addition", () => {
    const before = storedBattingOrder([
      { entryId: "a", battingOrder: 1 },
      { entryId: "b", battingOrder: 2 },
    ]);

    for (const after of [
      [
        { entryId: "b", battingOrder: 1 },
        { entryId: "a", battingOrder: 2 },
      ],
      [{ entryId: "a", battingOrder: 1 }],
      [
        { entryId: "a", battingOrder: 1 },
        { entryId: "b", battingOrder: 2 },
        { entryId: "c", battingOrder: 3 },
      ],
    ]) {
      expect(sameOrder(before, storedBattingOrder(after))).toBe(false);
    }
  });

  it("is not the draft, which has already compacted sparse orders away", () => {
    // The same trap storedPositions documents: buildBattingDraft packs 1, 2, 5
    // into slots 0, 1, 2, so the draft could never reveal what is stored.
    const sparse = [
      { entryId: "a", battingOrder: 1 },
      { entryId: "b", battingOrder: 5 },
    ];

    expect(storedBattingOrder(sparse)).toEqual(["a", "b"]);
    expect(buildBattingDraft(sparse, false).slots.slice(0, 2)).toEqual(["a", "b"]);
  });

  it("returns an empty order when nobody is seated", () => {
    expect(storedBattingOrder([{ entryId: "a", battingOrder: null }])).toEqual([]);
    expect(storedBattingOrder([])).toEqual([]);
  });
});

describe("resolveDrop", () => {
  const base: BattingDraft = {
    slots: ["a", "b", null],
    unassigned: ["x"],
  };

  it("drops onto an occupied slot by entry id", () => {
    const next = resolveDrop(base, "a", "b");
    expect(next.slots).toEqual(["b", "a", null]);
  });

  it("drops onto an empty slot by its slot id", () => {
    const next = resolveDrop(base, "a", emptySlotId(2));
    expect(next.slots).toEqual([null, "b", "a"]);
  });

  it("resolves empty slot index 0 correctly", () => {
    const draft: BattingDraft = { slots: [null, "b"], unassigned: ["x"] };
    const next = resolveDrop(draft, "x", emptySlotId(0));
    expect(next.slots).toEqual(["x", "b"]);
    expect(next.unassigned).toEqual([]);
  });

  it("drops onto the pool", () => {
    const next = resolveDrop(base, "a", UNASSIGNED_ID);
    expect(next.slots).toEqual([null, "b", null]);
    expect(next.unassigned).toEqual(["x", "a"]);
  });

  it("ignores a drop over nothing, itself, or an unknown target", () => {
    expect(resolveDrop(base, "a", null)).toBe(base);
    expect(resolveDrop(base, "a", "a")).toBe(base);
    expect(resolveDrop(base, "a", "not-a-target")).toBe(base);
  });
});

describe("validateBattingOrder", () => {
  const roster = ["a", "b", "c"];

  it("accepts a full allPlay order and derives battingOrder from position", () => {
    const result = validateBattingOrder(["c", "a", "b"], roster, true);
    expect(result).toEqual({
      ok: true,
      assignments: [
        { entryId: "c", battingOrder: 1 },
        { entryId: "a", battingOrder: 2 },
        { entryId: "b", battingOrder: 3 },
      ],
    });
  });

  it("collapses empty slots so the order stays contiguous", () => {
    // A batting order with a 3 and no 2 is not a readable lineup card, and
    // buildBattingDraft packs the gap away on the next load anyway — so the
    // numbers must come from the filled slots, not from array position.
    const result = validateBattingOrder(["a", null, "b"], roster, false);
    expect(result).toEqual({
      ok: true,
      assignments: [
        { entryId: "a", battingOrder: 1 },
        { entryId: "b", battingOrder: 2 },
      ],
    });
  });

  it("collapses leading empty slots too", () => {
    const result = validateBattingOrder([null, null, "c"], roster, false);
    expect(result).toEqual({
      ok: true,
      assignments: [{ entryId: "c", battingOrder: 1 }],
    });
  });

  it("accepts an all-empty order when allPlay is false", () => {
    const result = validateBattingOrder([null, null, null], roster, false);
    expect(result).toEqual({ ok: true, assignments: [] });
  });

  it("rejects ids not on this roster", () => {
    expect(validateBattingOrder(["a", "intruder", "b"], roster, true)).toEqual({
      ok: false,
      reason: "unknown-entry",
    });
  });

  it("rejects a duplicated entry", () => {
    expect(validateBattingOrder(["a", "a", "b"], roster, true)).toEqual({
      ok: false,
      reason: "duplicate-entry",
    });
  });

  it("rejects more slots than the team allows", () => {
    // Also catches an allPlay toggle that raced the edit: a 12-slot payload
    // built under allPlay=true fails against a 9-slot non-allPlay team.
    const twelve = Array.from({ length: 12 }, (_, i) => `p${i}`);
    expect(validateBattingOrder(twelve, twelve, false)).toEqual({
      ok: false,
      reason: "too-many-slots",
    });
  });

  it("rejects a missing player when allPlay is true", () => {
    expect(validateBattingOrder(["a", "b", null], roster, true)).toEqual({
      ok: false,
      reason: "missing-players",
    });
  });

  it("accepts fewer submitted slots than allowed when allPlay is false", () => {
    expect(validateBattingOrder(["a"], roster, false)).toEqual({
      ok: true,
      assignments: [{ entryId: "a", battingOrder: 1 }],
    });
  });
});

describe("save then reload round trip", () => {
  /// Regression: validateBattingOrder used to number by array position while
  /// buildBattingDraft packed densely, so a saved order with a gap came back
  /// showing different slot numbers than were written — and the view page
  /// showed a player batting 3rd in a two-batter order.
  function reload(
    roster: readonly string[],
    assignments: readonly { entryId: string; battingOrder: number }[],
    allPlay: boolean,
  ) {
    return buildBattingDraft(
      roster.map((entryId) => ({
        entryId,
        battingOrder:
          assignments.find((a) => a.entryId === entryId)?.battingOrder ?? null,
      })),
      allPlay,
    );
  }

  it("reloads a gapped order to exactly the slots that were persisted", () => {
    const roster = ["a", "b", "c"];
    const result = validateBattingOrder(["a", null, "b"], roster, false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const draft = reload(roster, result.assignments, false);
    // The persisted numbers ARE the slots the editor shows next time.
    expect(draft.slots).toEqual(["a", "b", null]);
    expect(draft.unassigned).toEqual(["c"]);
    expect(result.assignments.map((a) => a.battingOrder)).toEqual([1, 2]);
  });

  it("is stable for a full allPlay order", () => {
    const roster = ["a", "b", "c"];
    const submitted = ["c", "a", "b"];
    const result = validateBattingOrder(submitted, roster, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(reload(roster, result.assignments, true).slots).toEqual(submitted);
  });

  it("survives a second save with no edits (idempotent)", () => {
    const roster = ["a", "b", "c"];
    const first = validateBattingOrder(["a", null, "b"], roster, false);
    if (!first.ok) throw new Error("expected ok");

    const draft = reload(roster, first.assignments, false);
    const second = validateBattingOrder(draft.slots, roster, false);
    if (!second.ok) throw new Error("expected ok");

    expect(second.assignments).toEqual(first.assignments);
  });
});

describe("droppablePositions", () => {
  it("is the six infield spots under allPlay — the outfield is one zone", () => {
    expect(droppablePositions(true)).toEqual([
      "PITCHER",
      "CATCHER",
      "FIRST_BASE",
      "SECOND_BASE",
      "THIRD_BASE",
      "SHORTSTOP",
    ]);
  });

  it("is all nine when allPlay is off", () => {
    expect(droppablePositions(false)).toHaveLength(9);
    expect(droppablePositions(false)).toContain("CENTER_FIELD");
  });
});

describe("buildPositionsDraft", () => {
  it("seats assigned players and pools the rest", () => {
    const draft = buildPositionsDraft(
      [fielder("a", "PITCHER"), fielder("b"), fielder("c", "SHORTSTOP")],
      false,
    );
    expect(draft.assigned).toEqual({ PITCHER: "a", SHORTSTOP: "c" });
    expect(draft.pool).toEqual(["b"]);
  });

  it("pools named outfield players under allPlay instead of seating them", () => {
    // Hand-set during #9, or left behind when allPlay was switched on. The
    // coach sees them in the outfield zone before anything is written.
    const draft = buildPositionsDraft(
      [fielder("a", "PITCHER"), fielder("b", "LEFT_FIELD"), fielder("c")],
      true,
    );
    expect(draft.assigned).toEqual({ PITCHER: "a" });
    expect(draft.pool).toEqual(["b", "c"]);
  });

  it("keeps the caller's order in the pool", () => {
    const draft = buildPositionsDraft(
      [fielder("c"), fielder("a"), fielder("b")],
      true,
    );
    expect(draft.pool).toEqual(["c", "a", "b"]);
  });

  it("pools a second claimant rather than dropping them", () => {
    const draft = buildPositionsDraft(
      [fielder("a", "PITCHER"), fielder("b", "PITCHER")],
      true,
    );
    expect(draft.assigned).toEqual({ PITCHER: "a" });
    expect(draft.pool).toEqual(["b"]);
  });

  it("handles an empty roster and a fully unset chart", () => {
    expect(buildPositionsDraft([], true).pool).toEqual([]);
    expect(buildPositionsDraft([], true).assigned).toEqual({});
    const unset = buildPositionsDraft([fielder("a"), fielder("b")], false);
    expect(unset.assigned).toEqual({});
    expect(unset.pool).toEqual(["a", "b"]);
  });
});

describe("positionOf", () => {
  const base = draftOf(false, { PITCHER: "a" }, ["x"]);

  it("finds a seated player, and reports null otherwise", () => {
    expect(positionOf(base, "a")).toBe("PITCHER");
    expect(positionOf(base, "x")).toBe(null);
    expect(positionOf(base, "nope")).toBe(null);
  });
});

describe("placeAtPosition", () => {
  const base = draftOf(false, { PITCHER: "a", CATCHER: "b" }, ["x", "y"]);

  it("swaps two seated players", () => {
    const next = placeAtPosition(base, "a", "CATCHER");
    expect(next.assigned).toEqual({ PITCHER: "b", CATCHER: "a" });
    expect(next.pool).toEqual(["x", "y"]);
  });

  it("moves a seated player to an empty spot, emptying their old one", () => {
    const next = placeAtPosition(base, "a", "SHORTSTOP");
    expect(next.assigned).toEqual({ CATCHER: "b", SHORTSTOP: "a" });
  });

  it("swaps a pooled player with a seated one", () => {
    const next = placeAtPosition(base, "x", "PITCHER");
    expect(next.assigned).toEqual({ PITCHER: "x", CATCHER: "b" });
    // The displaced player takes the dragged player's place in the pool.
    expect(next.pool).toEqual(["a", "y"]);
  });

  it("seats a pooled player at an empty spot", () => {
    const next = placeAtPosition(base, "y", "SHORTSTOP");
    expect(next.assigned).toEqual({
      PITCHER: "a",
      CATCHER: "b",
      SHORTSTOP: "y",
    });
    expect(next.pool).toEqual(["x"]);
  });

  it("ignores a drop on the player's own position", () => {
    expect(placeAtPosition(base, "a", "PITCHER")).toBe(base);
  });

  it("ignores unknown entries", () => {
    expect(placeAtPosition(base, "nope", "SHORTSTOP")).toBe(base);
  });

  it("refuses a position this board doesn't have", () => {
    // The structural half of Decision 1: an allPlay draft cannot be talked
    // into holding an outfield assignment, whatever calls it.
    const allPlay = draftOf(true, { PITCHER: "a" }, ["x"]);
    expect(placeAtPosition(allPlay, "x", "LEFT_FIELD")).toBe(allPlay);
  });

  it("never mutates its input", () => {
    placeAtPosition(base, "x", "PITCHER");
    expect(base.assigned).toEqual({ PITCHER: "a", CATCHER: "b" });
    expect(base.pool).toEqual(["x", "y"]);
  });
});

describe("unassignPosition", () => {
  const base = draftOf(true, { PITCHER: "a", CATCHER: "b" }, ["x"]);

  it("empties the spot and appends the player to the pool", () => {
    const next = unassignPosition(base, "a");
    expect(next.assigned).toEqual({ CATCHER: "b" });
    expect(next.pool).toEqual(["x", "a"]);
  });

  it("is a no-op for a pooled or unknown player", () => {
    expect(unassignPosition(base, "x")).toBe(base);
    expect(unassignPosition(base, "nope")).toBe(base);
  });

  it("never mutates its input", () => {
    unassignPosition(base, "a");
    expect(base.assigned).toEqual({ PITCHER: "a", CATCHER: "b" });
  });
});

describe("samePositions", () => {
  it("compares the diamond and ignores pool order", () => {
    expect(samePositions({ PITCHER: "a" }, { PITCHER: "a" })).toBe(true);
    expect(samePositions({ PITCHER: "a" }, { PITCHER: "b" })).toBe(false);
    expect(samePositions({ PITCHER: "a" }, {})).toBe(false);
    expect(samePositions({}, {})).toBe(true);
    expect(
      samePositions({ PITCHER: "a", CATCHER: "b" }, { CATCHER: "b", PITCHER: "a" }),
    ).toBe(true);
  });
});

describe("storedPositions", () => {
  it("reads the positions the rows actually hold", () => {
    expect(
      storedPositions([
        { entryId: "a", position: "PITCHER" },
        { entryId: "b", position: null },
        { entryId: "c", position: "SHORTSTOP" },
      ]),
    ).toEqual({ PITCHER: "a", SHORTSTOP: "c" });
  });

  it("keeps a position the board can't drop on", () => {
    // The whole point: buildPositionsDraft pools this row under allPlay, so
    // only storedPositions can still see that the database says CENTER_FIELD.
    const entries = [{ entryId: "a", position: "CENTER_FIELD" as const }];

    expect(storedPositions(entries)).toEqual({ CENTER_FIELD: "a" });
    expect(buildPositionsDraft(entries, true).assigned).toEqual({});
  });

  it("differs from a freshly built allPlay draft exactly when a stale row exists", () => {
    // This inequality is what enables Save on load; the equality below is what
    // keeps it disabled when there is genuinely nothing to write.
    const stale = [{ entryId: "a", position: "LEFT_FIELD" as const }];
    expect(
      samePositions(buildPositionsDraft(stale, true).assigned, storedPositions(stale)),
    ).toBe(false);

    const clean = [
      { entryId: "a", position: "PITCHER" as const },
      { entryId: "b", position: null },
    ];
    expect(
      samePositions(buildPositionsDraft(clean, true).assigned, storedPositions(clean)),
    ).toBe(true);
  });

  it("agrees with a non-allPlay draft, which pools nothing", () => {
    // Every position is droppable there, so the two views can't diverge.
    const entries = [
      { entryId: "a", position: "RIGHT_FIELD" as const },
      { entryId: "b", position: null },
    ];

    expect(
      samePositions(
        buildPositionsDraft(entries, false).assigned,
        storedPositions(entries),
      ),
    ).toBe(true);
  });

  it("returns an empty board for an unplaced roster", () => {
    expect(storedPositions([{ entryId: "a", position: null }])).toEqual({});
    expect(storedPositions([])).toEqual({});
  });
});

describe("resolvePositionDrop", () => {
  const base = draftOf(false, { PITCHER: "a", CATCHER: "b" }, ["x"]);

  it("drops onto a position target by its enum name", () => {
    const next = resolvePositionDrop(base, "x", "SHORTSTOP");
    expect(next.assigned.SHORTSTOP).toBe("x");
    expect(next.pool).toEqual([]);
  });

  it("drops onto a seated player's chip by resolving to their position", () => {
    const next = resolvePositionDrop(base, "a", "b");
    expect(next.assigned).toEqual({ PITCHER: "b", CATCHER: "a" });
  });

  it("drops onto the zone", () => {
    const next = resolvePositionDrop(base, "a", POSITION_POOL_ID);
    expect(next.assigned).toEqual({ CATCHER: "b" });
    expect(next.pool).toEqual(["x", "a"]);
  });

  it("ignores a drop over nothing, itself, or empty grass", () => {
    expect(resolvePositionDrop(base, "a", null)).toBe(base);
    expect(resolvePositionDrop(base, "a", "a")).toBe(base);
    expect(resolvePositionDrop(base, "a", "not-a-target")).toBe(base);
  });

  it("ignores an outfield target under allPlay", () => {
    const allPlay = draftOf(true, {}, ["x"]);
    expect(resolvePositionDrop(allPlay, "x", "RIGHT_FIELD")).toBe(allPlay);
  });
});

describe("nextDroppableId", () => {
  const infield = droppablePositions(true);

  it("cycles forward through the positions and then the zone", () => {
    expect(nextDroppableId(infield, "PITCHER", 1)).toBe("CATCHER");
    expect(nextDroppableId(infield, "SHORTSTOP", 1)).toBe(POSITION_POOL_ID);
    expect(nextDroppableId(infield, POSITION_POOL_ID, 1)).toBe("PITCHER");
  });

  it("cycles backward too", () => {
    expect(nextDroppableId(infield, "CATCHER", -1)).toBe("PITCHER");
    expect(nextDroppableId(infield, "PITCHER", -1)).toBe(POSITION_POOL_ID);
  });

  it("reaches the outfield only when allPlay is off", () => {
    expect(nextDroppableId(droppablePositions(false), "SHORTSTOP", 1)).toBe(
      "LEFT_FIELD",
    );
  });

  it("starts at the first target for an id that isn't a droppable", () => {
    expect(nextDroppableId(infield, "some-entry-id", 1)).toBe("PITCHER");
  });
});

describe("validatePositions", () => {
  const roster = ["a", "b", "c"];

  it("accepts a chart and returns assignments in scorebook order", () => {
    expect(
      validatePositions({ SHORTSTOP: "c", PITCHER: "a" }, roster, true),
    ).toEqual({
      ok: true,
      assignments: [
        { entryId: "a", position: "PITCHER" },
        { entryId: "c", position: "SHORTSTOP" },
      ],
    });
  });

  it("accepts a partial chart — unplaced players are the outfield or the bench", () => {
    expect(validatePositions({}, roster, true)).toEqual({
      ok: true,
      assignments: [],
    });
    expect(validatePositions({ PITCHER: "a" }, roster, false)).toEqual({
      ok: true,
      assignments: [{ entryId: "a", position: "PITCHER" }],
    });
  });

  it("rejects ids not on this roster", () => {
    expect(validatePositions({ PITCHER: "intruder" }, roster, true)).toEqual({
      ok: false,
      reason: "unknown-entry",
    });
  });

  it("rejects the same player at two positions", () => {
    expect(
      validatePositions({ PITCHER: "a", CATCHER: "a" }, roster, true),
    ).toEqual({ ok: false, reason: "duplicate-entry" });
  });

  it("rejects a named outfield position for an allPlay team", () => {
    // allPlay toggled on mid-edit: the coach should see the board they're
    // actually saving, not have three assignments quietly dropped.
    expect(validatePositions({ LEFT_FIELD: "a" }, roster, true)).toEqual({
      ok: false,
      reason: "invalid-position",
    });
  });

  it("accepts that same outfield position when allPlay is off", () => {
    expect(validatePositions({ LEFT_FIELD: "a" }, roster, false)).toEqual({
      ok: true,
      assignments: [{ entryId: "a", position: "LEFT_FIELD" }],
    });
  });

  it("rejects a key that isn't a position at all", () => {
    expect(validatePositions({ SHORTSTOPP: "a" }, roster, false)).toEqual({
      ok: false,
      reason: "invalid-position",
    });
  });
});

describe("positions save then reload round trip", () => {
  function reload(
    roster: readonly string[],
    assignments: readonly { entryId: string; position: Position }[],
    allPlay: boolean,
  ) {
    return buildPositionsDraft(
      roster.map((entryId) => ({
        entryId,
        position:
          assignments.find((a) => a.entryId === entryId)?.position ?? null,
      })),
      allPlay,
    );
  }

  it("reloads an allPlay board to exactly what was persisted", () => {
    const roster = ["a", "b", "c"];
    const result = validatePositions({ PITCHER: "a", CATCHER: "b" }, roster, true);
    if (!result.ok) throw new Error("expected ok");

    const draft = reload(roster, result.assignments, true);
    expect(draft.assigned).toEqual({ PITCHER: "a", CATCHER: "b" });
    // 'c' persisted as null and comes back in the outfield zone.
    expect(draft.pool).toEqual(["c"]);
  });

  it("survives a second save with no edits (idempotent)", () => {
    const roster = ["a", "b", "c"];
    const first = validatePositions({ PITCHER: "a", SHORTSTOP: "c" }, roster, false);
    if (!first.ok) throw new Error("expected ok");

    const draft = reload(roster, first.assignments, false);
    const second = validatePositions(draft.assigned as Record<string, string>, roster, false);
    if (!second.ok) throw new Error("expected ok");

    expect(second.assignments).toEqual(first.assignments);
  });

  it("collapses an allPlay team's stale outfield row on the next save", () => {
    const roster = ["a", "b"];
    const draft = buildPositionsDraft(
      [fielder("a", "PITCHER"), fielder("b", "LEFT_FIELD")],
      true,
    );
    expect(draft.pool).toEqual(["b"]);

    const result = validatePositions(
      draft.assigned as Record<string, string>,
      roster,
      true,
    );
    // 'b' is simply absent from the assignments, so phase 1 of the write
    // leaves them null — in the outfield, where the editor already showed them.
    expect(result).toEqual({
      ok: true,
      assignments: [{ entryId: "a", position: "PITCHER" }],
    });
  });
});

describe("chartWriteFailure", () => {
  it("maps P2025 to roster-changed", () => {
    expect(chartWriteFailure({ code: "P2025" })).toBe("roster-changed");
  });

  it("maps a battingOrder P2002 to order-conflict, both target shapes", () => {
    expect(
      chartWriteFailure({ code: "P2002", meta: { target: ["teamId", "battingOrder"] } }),
    ).toBe("order-conflict");
    expect(
      chartWriteFailure({
        code: "P2002",
        meta: { target: "RosterEntry_teamId_battingOrder_key" },
      }),
    ).toBe("order-conflict");
  });

  it("maps a position P2002 to position-conflict, both target shapes", () => {
    expect(
      chartWriteFailure({ code: "P2002", meta: { target: ["teamId", "position"] } }),
    ).toBe("position-conflict");
    expect(
      chartWriteFailure({
        code: "P2002",
        meta: { target: "RosterEntry_teamId_position_key" },
      }),
    ).toBe("position-conflict");
  });

  it("returns null for other P2002 targets so callers rethrow", () => {
    expect(
      chartWriteFailure({ code: "P2002", meta: { target: ["teamId", "jerseyNumber"] } }),
    ).toBe(null);
  });

  it("returns null for non-Prisma errors", () => {
    expect(chartWriteFailure(new Error("boom"))).toBe(null);
    expect(chartWriteFailure(null)).toBe(null);
    expect(chartWriteFailure("P2025")).toBe(null);
  });
});
