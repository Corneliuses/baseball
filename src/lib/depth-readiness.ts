import type { CourtPosition } from "@/generated/prisma/enums";
import { COURT_POSITIONS } from "@/lib/court-positions";
import { buildDepthDraft, type DepthChartEntry } from "@/lib/depth-chart";
import type { RsvpState } from "@/lib/rsvp";

/// Basketball's next-game readiness check — readiness.ts's counterpart for the
/// depth chart, behind the same sport gate as the rest of the court
/// (AGENTS.md rule 4).
///
/// The same contract as the baseball check, and for the same reasons:
///   - **Read-only.** It reports how the standing depth chart fares against one
///     game's RSVPs. It never moves anyone off the bench, and the effective
///     bench below is worked out fresh on every read, never stored — a stored
///     one is a per-game lineup row by another name (Decision 16).
///   - **Silence is not absence.** Only a stated decline empties a spot;
///     `awaiting` is reported beside `ready` and never folded into it.
///
/// What differs is the chart. Every rostered kid is in basketball's rotation —
/// `buildDepthDraft` puts anyone the coach hasn't placed at the bottom of the
/// bench — so there is no "benched, so their RSVP can't matter" exclusion: a
/// decline anywhere on the roster shortens the rotation. And basketball can be
/// short in a way baseball's chart never is: five have to take the floor, so
/// `available` is counted and `shortHanded` raised when fewer than five are
/// left. That one is a problem, not information, so it alarms like a decline.
///
/// Pure and DB-free. The caller supplies the depth chart rows **sorted
/// jersey-then-name** (the order `buildDepthDraft` expects, and what keeps the
/// unplaced tail of the bench stable between reads) and that event's RSVPs.

/// Five on the floor. Fewer than this coming and the team cannot start a game.
export const PLAYERS_ON_COURT = 5;

export type DepthReadinessEntry = DepthChartEntry & { playerId: string };

/// A player and their spot in the rotation: a starting position, or their
/// place in the bench order (1 = first off the bench).
export type RotationSpot<T> =
  | { entry: T; kind: "starter"; position: CourtPosition }
  | { entry: T; kind: "bench"; benchSlot: number };

export type DepthReadiness<T extends DepthReadinessEntry> = {
  /// Declined players, starters first in court order, then the bench in the
  /// order it comes on.
  declined: RotationSpot<T>[];
  /// Players who haven't answered, in the same order as `declined`. Reported,
  /// never alarming.
  awaiting: RotationSpot<T>[];
  /// Starting spots whose starter declined, in court order. An open spot the
  /// coach never filled is not "uncovered" — nobody's absence emptied it — so
  /// it is not reported here, matching readiness.ts.
  uncoveredPositions: CourtPosition[];
  /// The bench for this game with the declined lifted out and the order closed
  /// up. No-response players keep their place: they are most likely coming.
  effectiveBench: T[];
  /// Players not known to be missing — everyone on the roster but the declined.
  available: number;
  /// True when fewer than `PLAYERS_ON_COURT` are available.
  shortHanded: boolean;
  /// Nothing needs the coach: no declines and not short-handed. Awaiting
  /// answers never make a team un-ready.
  ready: boolean;
};

export function computeDepthReadiness<T extends DepthReadinessEntry>(
  entries: readonly T[],
  rsvps: ReadonlyMap<string, RsvpState>,
): DepthReadiness<T> {
  const stateOf = (entry: T): RsvpState =>
    rsvps.get(entry.playerId) ?? "no-response";

  const byEntryId = new Map(entries.map((entry) => [entry.entryId, entry]));
  const draft = buildDepthDraft(entries);

  // Walked in rotation order — the starting five, then the bench — so both
  // people-lists read in the order the coach sends kids onto the floor.
  const rotation: RotationSpot<T>[] = [];
  for (const position of COURT_POSITIONS) {
    const entryId = draft.starters[position];
    if (entryId !== null) {
      rotation.push({ entry: byEntryId.get(entryId)!, kind: "starter", position });
    }
  }
  draft.bench.forEach((entryId, index) => {
    rotation.push({ entry: byEntryId.get(entryId)!, kind: "bench", benchSlot: index + 1 });
  });

  const declined = rotation.filter((spot) => stateOf(spot.entry) === "declined");
  const awaiting = rotation.filter(
    (spot) => stateOf(spot.entry) === "no-response",
  );

  const uncoveredPositions = declined.flatMap((spot) =>
    spot.kind === "starter" ? [spot.position] : [],
  );

  const effectiveBench = draft.bench
    .map((entryId) => byEntryId.get(entryId)!)
    .filter((entry) => stateOf(entry) !== "declined");

  const available = entries.length - declined.length;
  // An empty roster is not "short-handed" — there is no team to be short of,
  // and the page says "no chart set" instead.
  const shortHanded = entries.length > 0 && available < PLAYERS_ON_COURT;

  return {
    declined,
    awaiting,
    uncoveredPositions,
    effectiveBench,
    available,
    shortHanded,
    // A roster of four with nobody declining is short-handed without a single
    // decline, and that still needs the coach — so both decide this.
    ready: declined.length === 0 && !shortHanded,
  };
}
