import { describe, expect, it } from "vitest";

import {
  buildBattingDraft,
  chartWriteFailure,
  emptySlotId,
  placeInSlot,
  resolveDrop,
  sameOrder,
  slotCount,
  unassign,
  UNASSIGNED_ID,
  validateBattingOrder,
  type BattingDraft,
} from "./chart";

function entry(entryId: string, battingOrder: number | null = null) {
  return { entryId, battingOrder };
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
