import type { CourtPosition } from "@/generated/prisma/enums";
import { COURT_POSITIONS, isCourtPosition } from "@/lib/court-positions";

/**
 * Basketball's depth chart, pure and DB-free (Decision 17's "a new module
 * behind the sport gate", not columns borrowed from the baseball chart): five
 * starters, one per court position, and everyone else on an ordered bench —
 * first off the bench, second, and so on.
 *
 * Like the baseball chart it is **standing, not per-game**: the state lives on
 * the roster entries themselves, with no per-game rows, and RSVP state never
 * reaches anything here.
 */

/// The chart's slice of a roster entry.
export type DepthChartEntry = {
  entryId: string;
  playerName: string;
  jerseyNumber: number | null;
  courtPosition: CourtPosition | null;
  benchOrder: number | null;
};

/// The starting five by position (null = open) and the bench, in order.
export type DepthDraft = {
  starters: Record<CourtPosition, string | null>;
  bench: string[];
};

function emptyStarters(): Record<CourtPosition, string | null> {
  return {
    POINT_GUARD: null,
    SHOOTING_GUARD: null,
    SMALL_FORWARD: null,
    POWER_FORWARD: null,
    CENTER: null,
  };
}

/**
 * The chart as stored. The bench is the numbered players by `benchOrder`, then
 * everyone the coach hasn't placed yet — a kid added to the roster since the
 * last save — in the order `entries` arrived, so callers pass the roster
 * sorted jersey-then-name. Two starters at one position (which the unique
 * index forbids) keep the first and bench the second rather than losing one.
 *
 * Deterministic for a given roster order, which is what lets it double as the
 * save's baseline: the editor posts this for the board it loaded, and the
 * action rebuilds it from a fresh read.
 */
export function buildDepthDraft(
  entries: readonly DepthChartEntry[],
): DepthDraft {
  const starters = emptyStarters();
  const numbered: { id: string; order: number; index: number }[] = [];
  const unplaced: string[] = [];

  entries.forEach((entry, index) => {
    const position = entry.courtPosition;
    if (position !== null && starters[position] === null) {
      starters[position] = entry.entryId;
    } else if (entry.benchOrder !== null) {
      numbered.push({ id: entry.entryId, order: entry.benchOrder, index });
    } else {
      unplaced.push(entry.entryId);
    }
  });

  numbered.sort((a, b) => a.order - b.order || a.index - b.index);
  return { starters, bench: [...numbered.map(({ id }) => id), ...unplaced] };
}

/// Whether the coach has set anything at all — the "no lineup set yet"
/// question, asked across the whole roster.
export function hasDepthChartSet(entries: readonly DepthChartEntry[]): boolean {
  return entries.some(
    (entry) => entry.courtPosition !== null || entry.benchOrder !== null,
  );
}

/// The position an entry starts at on a draft, or null if it is on the bench.
export function startingPositionOf(
  draft: DepthDraft,
  entryId: string,
): CourtPosition | null {
  return (
    COURT_POSITIONS.find((position) => draft.starters[position] === entryId) ??
    null
  );
}

/**
 * Start `entryId` at `position`. Whoever started there swaps into the moved
 * player's old place: their position if they were starting elsewhere, or
 * their exact bench slot if they came off the bench — so one drag never
 * reshuffles anyone else.
 */
export function placeStarter(
  draft: DepthDraft,
  entryId: string,
  position: CourtPosition,
): DepthDraft {
  const current = draft.starters[position];
  if (current === entryId) {
    return draft;
  }
  const starters = { ...draft.starters };
  const bench = [...draft.bench];

  const from = startingPositionOf(draft, entryId);
  if (from !== null) {
    starters[from] = current;
  } else {
    const index = bench.indexOf(entryId);
    if (index !== -1) {
      if (current !== null) {
        bench.splice(index, 1, current);
      } else {
        bench.splice(index, 1);
      }
    }
  }
  starters[position] = entryId;
  return { starters, bench };
}

/**
 * Put `entryId` on the bench at `index` (0 = first off the bench), taking that
 * slot: whoever held it and everyone after moves down one, and an index past
 * the end joins the bottom. Moving within the bench works the same way, which
 * is why the player is lifted out first — dragging the 2nd onto the 4th's
 * chip makes them 4th.
 */
export function placeOnBench(
  draft: DepthDraft,
  entryId: string,
  index: number,
): DepthDraft {
  const starters = { ...draft.starters };
  const from = startingPositionOf(draft, entryId);
  if (from !== null) {
    starters[from] = null;
  }
  const bench = draft.bench.filter((id) => id !== entryId);
  bench.splice(Math.max(0, Math.min(index, bench.length)), 0, entryId);
  return { starters, bench };
}

/// A starting spot's drop target id.
export function courtSpotId(position: CourtPosition): string {
  return `court:${position}`;
}

/// A bench slot's drop target id: dropping there takes that slot.
export function benchSlotId(index: number): string {
  return `bench:${index}`;
}

/// The bench as a whole — dropping on it joins the bottom.
export const BENCH_ID = "bench";

/**
 * What a finished drag does. `overId` is a `courtSpotId`, a `benchSlotId`,
 * `BENCH_ID`, or null (dropped on nothing — no change). Kept here rather than
 * in the editor because jsdom cannot simulate a real pointer drag, so this is
 * where every drop outcome is tested.
 */
export function resolveDepthDrop(
  draft: DepthDraft,
  entryId: string,
  overId: string | null,
): DepthDraft {
  if (overId === null) {
    return draft;
  }
  if (overId === BENCH_ID) {
    return placeOnBench(draft, entryId, Number.MAX_SAFE_INTEGER);
  }
  const [kind, value] = overId.split(":");
  if (kind === "court" && value !== undefined && isCourtPosition(value)) {
    return placeStarter(draft, entryId, value);
  }
  const index = Number(value);
  if (kind === "bench" && Number.isInteger(index) && index >= 0) {
    return placeOnBench(draft, entryId, index);
  }
  return draft;
}

/// The board as posted: starters by position (open spots omitted) and the
/// bench in order.
export type DepthBoard = {
  starters: Partial<Record<string, string>>;
  bench: readonly string[];
};

export function boardOf(draft: DepthDraft): {
  starters: Partial<Record<CourtPosition, string>>;
  bench: string[];
} {
  const starters: Partial<Record<CourtPosition, string>> = {};
  for (const position of COURT_POSITIONS) {
    const id = draft.starters[position];
    if (id !== null) {
      starters[position] = id;
    }
  }
  return { starters, bench: [...draft.bench] };
}

/// Board equality: same starter at every position, same bench in the same
/// order.
export function sameDepth(a: DepthBoard, b: DepthBoard): boolean {
  const startersMatch = COURT_POSITIONS.every(
    (position) => (a.starters[position] ?? null) === (b.starters[position] ?? null),
  );
  return (
    startersMatch &&
    a.bench.length === b.bench.length &&
    a.bench.every((id, i) => id === b.bench[i])
  );
}

export type DepthAssignment = {
  entryId: string;
  courtPosition: CourtPosition | null;
  benchOrder: number | null;
};

export type DepthChartInvalidReason =
  | "invalid-position"
  | "unknown-entry"
  | "duplicate-entry";

export type DepthChartValidation =
  | { ok: true; assignments: DepthAssignment[] }
  | { ok: false; reason: DepthChartInvalidReason };

/**
 * Check a submitted board against the roster the server just read, and turn
 * it into rows to write. Bench slots are numbered 1..n from the array order,
 * so a client never chooses a `benchOrder` directly. A rostered player the
 * board leaves out is written with neither column — the "not placed yet"
 * state a newly added kid is in — rather than refused.
 */
export function validateDepthChart(
  board: DepthBoard,
  rosterEntryIds: readonly string[],
): DepthChartValidation {
  const roster = new Set(rosterEntryIds);
  const seen = new Set<string>();
  const assignments: DepthAssignment[] = [];

  const take = (entryId: string): DepthChartInvalidReason | null => {
    if (!roster.has(entryId)) {
      return "unknown-entry";
    }
    if (seen.has(entryId)) {
      return "duplicate-entry";
    }
    seen.add(entryId);
    return null;
  };

  for (const [position, entryId] of Object.entries(board.starters)) {
    if (!isCourtPosition(position)) {
      return { ok: false, reason: "invalid-position" };
    }
    if (entryId === undefined) {
      continue;
    }
    const problem = take(entryId);
    if (problem) {
      return { ok: false, reason: problem };
    }
    assignments.push({ entryId, courtPosition: position, benchOrder: null });
  }

  for (const [index, entryId] of board.bench.entries()) {
    const problem = take(entryId);
    if (problem) {
      return { ok: false, reason: problem };
    }
    assignments.push({ entryId, courtPosition: null, benchOrder: index + 1 });
  }

  return { ok: true, assignments };
}
