import type { Position } from "@/generated/prisma/enums";
import {
  ALL_PLAY_POSITIONS,
  ALL_POSITIONS,
  positionCapacity,
} from "@/lib/positions";

/// Pure chart editing logic: the batting order (#10) and the positions
/// diamond (#11).
///
/// The batting draft model is a fixed array of slots (index i = batting slot
/// i + 1) plus an unassigned pool; the positions draft model is a
/// position → entry-ids map plus a pool (one id per spot, except an allPlay
/// team's outfield spots, which stack to three). Both hold `RosterEntry` ids. Everything
/// here is DB-free and DOM-free: each dnd-kit component is a thin shell that
/// maps drag events onto these functions (`resolveDrop`,
/// `resolvePositionDrop`), and the server actions re-run the matching
/// `validate*` against the roster they load themselves — client input never
/// decides which rows get written.
///
/// Drops SWAP, they never insert-and-shift — dropping onto an occupied slot or
/// position exchanges the two players (issue #10's stated behavior, previewed
/// in the UI with @dnd-kit/sortable's rectSwappingStrategy, not arrayMove; #11
/// follows the same grammar so the two editors don't disagree).
///
/// The positions half takes `(entryId, position)` rather than a drag event, so
/// the *Later* tap-to-select mode can drive it unchanged — `resolvePositionDrop`
/// is the only drag-shaped function, and it is a thin adapter.

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

/**
 * The batting order as the database currently holds it: entry ids in
 * ascending `battingOrder`, benched entries omitted. The lost-update baseline
 * — see `storedPositions` for the positions half and the hazard both guard.
 *
 * The *sequence*, deliberately, not the numbers. A sparse hand-set order
 * (1, 2, 5) and the dense one another coach's save compacts it to (1, 2, 3)
 * fingerprint the same, because they seat the same players in the same order:
 * a save landing on top of that renumber destroys nothing, and failing it
 * would be a conflict a coach cannot see or explain. Any change that moves,
 * adds, or benches a player changes the sequence and is caught.
 *
 * Not `buildBattingDraft(...).slots`, for the reason `storedPositions` isn't
 * the draft either: that packs sparse orders densely, so the draft is already
 * the compacted form and could never reveal the difference.
 */
export function storedBattingOrder(
  entries: readonly BattingChartEntry[],
): string[] {
  return entries
    .filter((entry) => entry.battingOrder !== null)
    .sort((a, b) => a.battingOrder! - b.battingOrder!)
    .map((entry) => entry.entryId);
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
 * itself. The client only ever chooses which entry sits where, never the
 * numbers — `battingOrder` is derived here.
 *
 * **Empty slots collapse.** A batting order is contiguous by nature: with
 * seven batters the order is 1–7, and "nobody bats 2nd" is not a lineup a
 * coach can read off a card. So the numbers come from a running counter over
 * the filled slots, not from array position. Deriving them from position
 * instead persisted a gap (slots 1 and 3 filled → battingOrder 1 and 3) that
 * `buildBattingDraft` then packed away on the next load — the view page said
 * a player batted 3rd while the editor showed them 2nd, for the same saved
 * chart. Compacting here is what makes the two agree.
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

  for (const entryId of orderedIds) {
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
    assignments.push({ entryId, battingOrder: assignments.length + 1 });
  }

  if (allPlay && seen.size < rosterEntryIds.length) {
    return { ok: false, reason: "missing-players" };
  }

  return { ok: true, assignments };
}

// ---------------------------------------------------------------------------
// Positions diamond (#11)
// ---------------------------------------------------------------------------

export type PositionsDraft = {
  /// The droppable positions on this board, in scorebook order. Carried on the
  /// draft rather than passed alongside it so every mutation below can reject
  /// a position the board doesn't have — under allPlay that is what makes
  /// "a catcher assignment is unrepresentable" structural instead of a rule
  /// each caller has to remember.
  positions: readonly Position[];
  /// Whether this is an allPlay board — carried for the same reason as
  /// `positions`: per-spot capacity (`positionCapacity`) is a property of the
  /// board, and a mutation that had to be told the capacity per call could be
  /// told the wrong one.
  allPlay: boolean;
  /// position → entry ids, for filled spots only — a key is present only while
  /// its array is non-empty. One entry everywhere except an allPlay team's
  /// LF/CF/RF, which stack to `OUTFIELD_SPOT_CAPACITY`. Array order is arrival
  /// order and is presentation only: nothing persisted distinguishes two
  /// orderings of the same spot (see `samePositions`).
  assigned: Partial<Record<Position, readonly string[]>>;
  /// Everyone else, in the order the caller supplied (roster order): the
  /// general outfield zone under allPlay, the bench otherwise. Both persist as
  /// null.
  pool: string[];
};

export type PositionChartEntry = {
  entryId: string;
  position: Position | null;
};

/**
 * Which positions are drop targets.
 *
 * An allPlay team has no catcher — the coach pitches — so C is not droppable
 * there, and a catcher row lands in the general outfield along with everyone
 * else the board doesn't seat. LF/CF/RF ARE droppable under allPlay (revised
 * with the named-outfield-spots change): each stacks to
 * `OUTFIELD_SPOT_CAPACITY`, and whoever the coach leaves unpinned persists as
 * `position = null` — the general outfield zone, which is unambiguous because
 * an allPlay team has no bench.
 */
export function droppablePositions(allPlay: boolean): readonly Position[] {
  return allPlay ? ALL_PLAY_POSITIONS : ALL_POSITIONS;
}

/// Where `entryId` currently stands, or null if they're in the pool or absent.
export function positionOf(
  draft: PositionsDraft,
  entryId: string,
): Position | null {
  for (const position of draft.positions) {
    if (draft.assigned[position]?.includes(entryId)) {
      return position;
    }
  }
  return null;
}

/**
 * Initial draft from the current chart.
 *
 * An entry whose stored position isn't droppable on this board lands in the
 * pool — that is how an allPlay team's stale CATCHER row (hand-set during #9,
 * or left behind when allPlay was switched on) shows up in the outfield zone.
 * It is only collapsed to null when the coach actually saves, so nothing
 * changes behind their back. Likewise a spot holding more entries than its
 * capacity (a named outfield stack after allPlay was switched OFF) keeps the
 * first arrivals and pools the rest rather than dropping anyone.
 */
export function buildPositionsDraft(
  entries: readonly PositionChartEntry[],
  allPlay: boolean,
): PositionsDraft {
  const positions = droppablePositions(allPlay);
  const droppable = new Set(positions);
  const assigned: Partial<Record<Position, string[]>> = {};
  const pool: string[] = [];

  for (const entry of entries) {
    const { position } = entry;
    if (
      position !== null &&
      droppable.has(position) &&
      (assigned[position]?.length ?? 0) < positionCapacity(position, allPlay)
    ) {
      (assigned[position] ??= []).push(entry.entryId);
    } else {
      pool.push(entry.entryId);
    }
  }

  return { positions, allPlay, assigned, pool };
}

/**
 * Put `entryId` at `position`, the one mutation the diamond performs — the
 * swap grammar of `placeInSlot`, generalised to spots with room to spare:
 *
 *   - position has room (an allPlay outfield spot below capacity, or any
 *     empty spot) → the entry simply joins it, leaving wherever it stood.
 *   - position is full → the entry SWAPS with the spot's most recent arrival:
 *     the displaced player takes the dragged player's old place (their old
 *     position, or their spot in the pool). At capacity 1 this is exactly the
 *     old grammar, so the infield behaves as it always has.
 *
 * Positions off this board, unknown entries, and drops onto a spot the entry
 * already holds return the draft unchanged. Never mutates its input.
 */
export function placeAtPosition(
  draft: PositionsDraft,
  entryId: string,
  position: Position,
): PositionsDraft {
  if (!draft.positions.includes(position)) {
    return draft;
  }

  const from = positionOf(draft, entryId);
  const fromPool = draft.pool.indexOf(entryId);
  if (from === null && fromPool === -1) {
    return draft;
  }
  if (from === position) {
    return draft;
  }

  const assigned = { ...draft.assigned };
  const pool = [...draft.pool];
  const target = [...(assigned[position] ?? [])];
  const capacity = positionCapacity(position, draft.allPlay);

  // Room to join, or a full spot's last arrival to displace.
  const displaced =
    target.length < capacity ? undefined : target.pop();
  target.push(entryId);
  assigned[position] = target;

  if (from !== null) {
    const source = (assigned[from] ?? []).filter((id) => id !== entryId);
    if (displaced !== undefined) {
      source.push(displaced);
    }
    if (source.length > 0) {
      assigned[from] = source;
    } else {
      delete assigned[from];
    }
  } else if (displaced !== undefined) {
    pool.splice(fromPool, 1, displaced);
  } else {
    pool.splice(fromPool, 1);
  }

  return { positions: draft.positions, allPlay: draft.allPlay, assigned, pool };
}

/// Drop onto the zone: the entry leaves the diamond. Under allPlay that means
/// the general outfield, otherwise the bench — both are `position = null`.
/// No-op for an entry already pooled.
export function unassignPosition(
  draft: PositionsDraft,
  entryId: string,
): PositionsDraft {
  const from = positionOf(draft, entryId);
  if (from === null) {
    return draft;
  }

  const assigned = { ...draft.assigned };
  const remaining = (assigned[from] ?? []).filter((id) => id !== entryId);
  if (remaining.length > 0) {
    assigned[from] = remaining;
  } else {
    delete assigned[from];
  }
  return {
    positions: draft.positions,
    allPlay: draft.allPlay,
    assigned,
    pool: [...draft.pool, entryId],
  };
}

/// Compare two boards. Only the diamond matters — pool order is presentation,
/// since every pooled player persists as the same null — and WHO holds a spot
/// matters while the order they arrived in does not: nothing persisted
/// distinguishes two orderings of one outfield stack (`positionSlot` is a
/// uniqueness mechanism, renumbered on every save). Spans all nine positions,
/// not just the droppable ones, so it can also compare a draft against what
/// the database holds (see `storedPositions`).
export function samePositions(
  a: Partial<Record<Position, readonly string[]>>,
  b: Partial<Record<Position, readonly string[]>>,
): boolean {
  return ALL_POSITIONS.every((position) => {
    const atA = a[position] ?? [];
    const atB = b[position] ?? [];
    return (
      atA.length === atB.length && atA.every((entryId) => atB.includes(entryId))
    );
  });
}

/**
 * The board as the database currently holds it, including positions that
 * aren't droppable on this team's board.
 *
 * This is the only honest answer to "would saving change anything?", and it is
 * not `buildPositionsDraft(...).assigned`: that pools an allPlay team's stale
 * CATCHER row (and any over-capacity outfield stack left by an allPlay
 * toggle), so a freshly-loaded draft compares equal to itself while the
 * stored row still says CATCHER. Gating Save on the draft alone would disable
 * the one button that collapses that row, stranding it until the coach
 * happened to make an unrelated change.
 */
export function storedPositions(
  entries: readonly PositionChartEntry[],
): Partial<Record<Position, string[]>> {
  const stored: Partial<Record<Position, string[]>> = {};
  for (const entry of entries) {
    // Every row is kept, capacity or not — this is the database's answer, and
    // `samePositions` is order-insensitive, so entry order doesn't matter.
    if (entry.position !== null) {
      (stored[entry.position] ??= []).push(entry.entryId);
    }
  }
  return stored;
}

/// Droppable id of the zone below the diamond (outfield or bench).
export const POSITION_POOL_ID = "position-pool";

/**
 * Map a dnd-kit drag end onto the draft. Droppable ids are the `Position` enum
 * names themselves, so no parsing is needed; an `overId` that is an entry id
 * instead (a drop landing on a chip rather than its target) resolves to that
 * player's position, mirroring `resolveDrop`.
 */
export function resolvePositionDrop(
  draft: PositionsDraft,
  activeId: string,
  overId: string | null,
): PositionsDraft {
  if (overId === null || overId === activeId) {
    return draft;
  }

  if (overId === POSITION_POOL_ID) {
    return unassignPosition(draft, activeId);
  }

  const target =
    draft.positions.find((position) => position === overId) ??
    positionOf(draft, overId);
  return target === null ? draft : placeAtPosition(draft, activeId, target);
}

/**
 * The droppable one step from `currentId`, cycling positions in scorebook
 * order and then the zone. Backs the keyboard sensor.
 *
 * A flat cycle, not spatial arrow navigation: the diamond's targets don't sit
 * on a grid, so "what is left of shortstop" has no answer a coach could
 * predict, whereas P → C → 1B → … → zone → P is the order the position labels
 * already imply.
 */
export function nextDroppableId(
  positions: readonly Position[],
  currentId: string,
  step: 1 | -1,
): string {
  const ids: string[] = [...positions, POSITION_POOL_ID];
  const index = ids.indexOf(currentId);
  if (index === -1) {
    return ids[0];
  }
  return ids[(index + step + ids.length) % ids.length];
}

export type PositionAssignment = {
  entryId: string;
  position: Position;
  /// 0 everywhere except an allPlay outfield stack, where the spot's players
  /// number 0..n-1 in submitted order. Exists to satisfy the unique index
  /// `[teamId, position, positionSlot]`; nothing reads it back.
  positionSlot: number;
};

export type PositionsInvalidReason =
  | "unknown-entry"
  | "duplicate-entry"
  | "invalid-position"
  | "position-full";

export type PositionsValidation =
  | { ok: true; assignments: PositionAssignment[] }
  | { ok: false; reason: PositionsInvalidReason };

/**
 * Validate a submitted position → entry-ids map against the roster and
 * allPlay flag the server loaded itself.
 *
 * **A partial chart is valid.** Unlike `validateBattingOrder`, there is no
 * "everyone must be placed" rule to enforce under allPlay: an empty shortstop
 * still leaves every kid playing, because the unplaced ones are in the
 * outfield. "No chart set yet" is a real state the view page renders (#8), and
 * #9's weekend produced half-entered charts on purpose.
 *
 * A CATCHER submitted for an allPlay team is `invalid-position` rather than
 * something to quietly drop — it means the setting was toggled mid-edit, and
 * the coach should see the board they're actually saving. A spot holding more
 * entries than `positionCapacity` allows is `position-full` by the same logic:
 * the honest boards the editor builds can't produce it (two at shortstop, or
 * four at an outfield spot — including three at LF/CF/RF the instant allPlay
 * is toggled off), so the coach should see what the board has become.
 */
export function validatePositions(
  submitted: Readonly<Record<string, readonly string[]>>,
  rosterEntryIds: readonly string[],
  allPlay: boolean,
): PositionsValidation {
  const positions = droppablePositions(allPlay);
  const droppable = new Set<string>(positions);

  for (const key of Object.keys(submitted)) {
    if (!droppable.has(key)) {
      return { ok: false, reason: "invalid-position" };
    }
  }

  const roster = new Set(rosterEntryIds);
  const seen = new Set<string>();
  const assignments: PositionAssignment[] = [];

  // Scorebook order, not the submitted key order, so the write is the same
  // regardless of how the client happened to serialize the map.
  for (const position of positions) {
    const entryIds = submitted[position];
    if (entryIds === undefined) {
      continue;
    }
    if (entryIds.length > positionCapacity(position, allPlay)) {
      return { ok: false, reason: "position-full" };
    }
    for (const [positionSlot, entryId] of entryIds.entries()) {
      if (!roster.has(entryId)) {
        return { ok: false, reason: "unknown-entry" };
      }
      if (seen.has(entryId)) {
        return { ok: false, reason: "duplicate-entry" };
      }
      seen.add(entryId);
      assignments.push({ entryId, position, positionSlot });
    }
  }

  return { ok: true, assignments };
}

// ---------------------------------------------------------------------------
// Write-failure translation
// ---------------------------------------------------------------------------

export type ChartWriteFailure =
  | "roster-changed"
  | "order-conflict"
  | "position-conflict"
  | null;

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
 *   - P2002 on battingOrder or position: should be unreachable given the
 *     two-phase write, but translated defensively rather than becoming a 500.
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
    if (targetText.includes("position")) {
      return "position-conflict";
    }
  }

  return null;
}
