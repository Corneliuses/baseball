/// Pure batting-order editing logic for the chart editor (#10).
///
/// The draft model is a fixed array of slots (index i = batting slot i + 1)
/// plus an unassigned pool, both holding `RosterEntry` ids. Everything here is
/// DB-free and DOM-free: the dnd-kit component is a thin shell that maps drag
/// events onto these functions (`resolveDrop`), and the server action re-runs
/// `validateBattingOrder` against the roster it loads itself — client input
/// never decides which rows get written.
///
/// Drops SWAP, they never insert-and-shift — dropping onto an occupied slot
/// exchanges the two players (issue #10's stated behavior, previewed in the
/// UI with @dnd-kit/sortable's rectSwappingStrategy, not arrayMove).

export type BattingDraft = {
  /// slots[i] holds the entry in batting slot i + 1; null = empty slot.
  slots: (string | null)[];
  /// Rostered entries with no batting slot. Always empty when allPlay is true.
  unassigned: string[];
};

export type BattingChartEntry = {
  entryId: string;
  battingOrder: number | null;
};

/// allPlay teams bat everyone; otherwise a standard 9-slot order, shrunk to
/// the roster when the roster is smaller than 9.
export function slotCount(rosterSize: number, allPlay: boolean): number {
  return allPlay ? rosterSize : Math.min(9, rosterSize);
}

/**
 * Initial draft from the current chart. Hand-set data from the #9 validation
 * weekend can be sparse (1, 2, 5) or hold more assigned players than slots
 * (allPlay toggled off after a full order was set), so assigned entries are
 * packed densely into slots in battingOrder order; overflow lands in the
 * unassigned pool, visible before anything is written.
 *
 * When allPlay is true every player gets a slot: entries with no battingOrder
 * fill the remaining slots in the order given (callers pass roster order), so
 * the pool is always empty. Nothing is persisted until Save.
 */
export function buildBattingDraft(
  entries: readonly BattingChartEntry[],
  allPlay: boolean,
): BattingDraft {
  const count = slotCount(entries.length, allPlay);
  const assigned = entries
    .filter((entry) => entry.battingOrder !== null)
    .sort((a, b) => a.battingOrder! - b.battingOrder!);
  const rest = entries.filter((entry) => entry.battingOrder === null);

  const slots: (string | null)[] = new Array(count).fill(null);
  const unassigned: string[] = [];

  let next = 0;
  for (const entry of assigned) {
    if (next < count) {
      slots[next] = entry.entryId;
      next += 1;
    } else {
      unassigned.push(entry.entryId);
    }
  }

  for (const entry of rest) {
    if (allPlay) {
      slots[next] = entry.entryId;
      next += 1;
    } else {
      unassigned.push(entry.entryId);
    }
  }

  return { slots, unassigned };
}

/**
 * Drop `entryId` onto slot `slot` (0-based). The one mutation the UI performs:
 *
 *   - entry was in another slot → the two slots SWAP (the displaced player
 *     takes the dragged player's old slot, which may mean an empty slot).
 *   - entry was unassigned, slot occupied → still a swap: the entry takes the
 *     slot and the displaced player takes the entry's place in the pool.
 *   - entry was unassigned, slot empty → the entry just takes the slot.
 *
 * Out-of-range slots, unknown entries, and self-drops return the draft
 * unchanged. Never mutates its input.
 */
export function placeInSlot(
  draft: BattingDraft,
  entryId: string,
  slot: number,
): BattingDraft {
  if (slot < 0 || slot >= draft.slots.length) {
    return draft;
  }

  const fromSlot = draft.slots.indexOf(entryId);
  const fromPool = draft.unassigned.indexOf(entryId);
  if (fromSlot === -1 && fromPool === -1) {
    return draft;
  }
  if (fromSlot === slot) {
    return draft;
  }

  const slots = [...draft.slots];
  const unassigned = [...draft.unassigned];
  const occupant = slots[slot];

  slots[slot] = entryId;
  if (fromSlot !== -1) {
    slots[fromSlot] = occupant;
  } else if (occupant !== null) {
    unassigned.splice(fromPool, 1, occupant);
  } else {
    unassigned.splice(fromPool, 1);
  }

  return { slots, unassigned };
}

/// Drop onto the unassigned pool: the entry leaves its slot. Only reachable
/// when the pool is rendered (allPlay = false). No-op if already unassigned.
export function unassign(draft: BattingDraft, entryId: string): BattingDraft {
  const fromSlot = draft.slots.indexOf(entryId);
  if (fromSlot === -1) {
    return draft;
  }

  const slots = [...draft.slots];
  slots[fromSlot] = null;
  return { slots, unassigned: [...draft.unassigned, entryId] };
}

/// Dirty check for Save/Cancel enablement. Only slots matter — pool order is
/// presentation, nothing persisted distinguishes two pool orderings.
export function sameOrder(
  a: readonly (string | null)[],
  b: readonly (string | null)[],
): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

// ---------------------------------------------------------------------------
// dnd-kit id mapping
// ---------------------------------------------------------------------------

/// Droppable id of the unassigned pool container.
export const UNASSIGNED_ID = "unassigned";

/// Sortable item id for an empty slot (occupied slots use the entry id).
export function emptySlotId(index: number): string {
  return `empty-slot-${index}`;
}

function parseEmptySlotId(id: string): number | null {
  const match = /^empty-slot-(\d+)$/.exec(id);
  return match ? Number(match[1]) : null;
}

/**
 * Map a dnd-kit drag end (active id dropped over `overId`) onto the draft.
 * Kept here rather than in the component so the whole outcome of a drag is
 * pure and testable — jsdom cannot simulate real pointer drags.
 */
export function resolveDrop(
  draft: BattingDraft,
  activeId: string,
  overId: string | null,
): BattingDraft {
  if (overId === null || overId === activeId) {
    return draft;
  }

  if (overId === UNASSIGNED_ID) {
    return unassign(draft, activeId);
  }

  const emptyIndex = parseEmptySlotId(overId);
  const slot = emptyIndex ?? draft.slots.indexOf(overId);
  return slot === -1 ? draft : placeInSlot(draft, activeId, slot);
}

// ---------------------------------------------------------------------------
// Server-side validation
// ---------------------------------------------------------------------------

export type BattingOrderAssignment = {
  entryId: string;
  battingOrder: number;
};

export type BattingOrderInvalidReason =
  | "unknown-entry"
  | "duplicate-entry"
  | "too-many-slots"
  | "missing-players";

export type BattingOrderValidation =
  | { ok: true; assignments: BattingOrderAssignment[] }
  | { ok: false; reason: BattingOrderInvalidReason };

/**
 * Validate a submitted slots array against the roster the server loaded
 * itself. `battingOrder` is derived from slot position (index + 1) — the
 * client only ever chooses which entry sits where, never the numbers. Empty
 * slots are allowed when allPlay is false, so a non-allPlay order may have
 * gaps (slots 1 and 3 filled); the view page sorts ascending either way.
 *
 * Checking against the roster and allPlay loaded at save time also catches a
 * roster edit or settings toggle that raced the editing session.
 */
export function validateBattingOrder(
  orderedIds: readonly (string | null)[],
  rosterEntryIds: readonly string[],
  allPlay: boolean,
): BattingOrderValidation {
  const count = slotCount(rosterEntryIds.length, allPlay);
  if (orderedIds.length > count) {
    return { ok: false, reason: "too-many-slots" };
  }

  const roster = new Set(rosterEntryIds);
  const seen = new Set<string>();
  const assignments: BattingOrderAssignment[] = [];

  for (let index = 0; index < orderedIds.length; index += 1) {
    const entryId = orderedIds[index];
    if (entryId === null) {
      continue;
    }
    if (!roster.has(entryId)) {
      return { ok: false, reason: "unknown-entry" };
    }
    if (seen.has(entryId)) {
      return { ok: false, reason: "duplicate-entry" };
    }
    seen.add(entryId);
    assignments.push({ entryId, battingOrder: index + 1 });
  }

  if (allPlay && seen.size < rosterEntryIds.length) {
    return { ok: false, reason: "missing-players" };
  }

  return { ok: true, assignments };
}

// ---------------------------------------------------------------------------
// Write-failure translation
// ---------------------------------------------------------------------------

export type ChartWriteFailure = "roster-changed" | "order-conflict" | null;

type PrismaLikeError = {
  code?: unknown;
  meta?: { target?: unknown };
};

/**
 * Translate a failed `saveBattingOrder` into something the page can explain.
 * Duck-typed for the same reason as `rosterWriteFailure` in roster-rules.ts
 * (the generated client's error class isn't a stable import), and matching
 * both `meta.target` shapes with the same unverified-on-live-Postgres caveat.
 *
 *   - P2025: a phase-2 update matched no row — an entry was removed (or moved
 *     teams) between load and save. The transaction rolled back; reload.
 *   - P2002 on battingOrder: should be unreachable given the two-phase write,
 *     but translated defensively rather than becoming a 500.
 */
export function chartWriteFailure(error: unknown): ChartWriteFailure {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  const prismaError = error as PrismaLikeError;
  if (prismaError.code === "P2025") {
    return "roster-changed";
  }

  if (prismaError.code === "P2002") {
    const target = prismaError.meta?.target;
    const targetText = Array.isArray(target)
      ? target.join(",")
      : typeof target === "string"
        ? target
        : "";
    if (targetText.includes("battingOrder")) {
      return "order-conflict";
    }
  }

  return null;
}
