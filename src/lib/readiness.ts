import { Position } from "@/generated/prisma/enums";
import { ALL_PLAY_INFIELD_POSITIONS, ALL_POSITIONS } from "@/lib/positions";
import type { RsvpState } from "@/lib/rsvp";

/// The next-game readiness check.
///
/// This is a READ-ONLY derivation: it reports how the team's standing chart
/// fares against one game's RSVPs and writes nothing. It does not rearrange the
/// chart, and it must never persist an "effective lineup" — that is how per-game
/// lineup rows creep back in, which Decision 16 deliberately removed.
///
/// **Silence is not absence.** The input is the tri-state map from rsvp.ts, not
/// a set of attendees, because those are different questions: a family that
/// declined is not coming, and a family that hasn't answered probably is. An
/// earlier version tested `attending.has(playerId)`, which collapsed the two —
/// so before the first RSVP landed on a game it reported every batter absent
/// and every position uncovered. That is noise that trains a coach to ignore
/// the screen, which is worse than no screen.
///
/// So the two are reported separately and only one of them alarms:
///   - `declined` and `uncoveredPositions` are the problems. A decline is a
///     stated fact about Saturday, and it is the only thing that empties a spot.
///   - `awaiting` is information. It is always shown and never blocks `ready`.
///
/// `ready` therefore means **no declines affecting the chart** — not "everyone
/// has answered". Outstanding responses are surfaced next to it rather than
/// folded into it.
///
/// Deliberately pure and DB-free so it can be tested without a database. The
/// caller supplies the team's roster chart and that event's RSVP states.

export type ChartEntry = {
  playerId: string;
  playerName: string;
  /// Null means the player is not in the batting order (bench).
  battingOrder: number | null;
  /// Null means the player has no fielding assignment (bench).
  position: Position | null;
};

export type Readiness<T extends ChartEntry> = {
  /// Chart-affecting players who declined — the coach's actual problem.
  declined: T[];
  /// Chart-affecting players who haven't answered. Reported, never alarming:
  /// these are the players `uncoveredPositions` deliberately says nothing about.
  awaiting: T[];
  /// Positions left empty because the assigned player **declined**. In
  /// scorebook order, and limited to the spots this team actually fields.
  uncoveredPositions: Position[];
  /// The batting order for this game with declined players removed and ranks
  /// closed up. No-response players stay in it — see `chartState` below.
  effectiveOrder: T[];
  /// True when nothing needs the coach's attention: no declines affect the
  /// chart. Awaiting responses do not make a team un-ready.
  ready: boolean;
};

/**
 * The order both people-lists are reported in: batting slot ascending, then
 * players with no slot (position-only, on a selective team), then by name.
 *
 * Matching the batting order rather than the roster's jersey order is
 * deliberate — the coach reads this list against the order they just wrote in
 * the editor, and "who is out of my top of the order" is the question being
 * asked. Jerseys are unique per team but slots may repeat across the two lists,
 * so the name comparison settles the slotless pairs.
 */
function byBattingSlotThenName(a: ChartEntry, b: ChartEntry): number {
  if (a.battingOrder === null && b.battingOrder === null) {
    return a.playerName.localeCompare(b.playerName);
  }
  if (a.battingOrder === null) return 1;
  if (b.battingOrder === null) return -1;
  return a.battingOrder - b.battingOrder;
}

/**
 * @param chart    The team's standing chart — every roster entry. Generic over
 *                 the entry type so a caller holding richer rows (`getChart`'s
 *                 `ChartViewEntry`, which carries the jersey number the panel
 *                 renders) gets those rows back out, rather than this module
 *                 widening `ChartEntry` toward one caller's render model.
 * @param rsvps    Per-player RSVP state for this one game, from
 *                 `buildRsvpStateMap`. A player missing from the map is treated
 *                 as no-response — the same fallback `buildChartView` applies,
 *                 and the safe direction: the failure mode worth avoiding is
 *                 inventing an absence, never inventing an attendance.
 * @param allPlay  Which spots this team actually fields, as on `buildChartView`.
 */
export function computeReadiness<T extends ChartEntry>(
  chart: readonly T[],
  rsvps: ReadonlyMap<string, RsvpState>,
  allPlay: boolean,
): Readiness<T> {
  const stateOf = (entry: ChartEntry): RsvpState =>
    rsvps.get(entry.playerId) ?? "no-response";

  // A player with neither a slot nor a position is benched, and benched players
  // are ignored entirely: their RSVP cannot change what happens on the field,
  // so naming them here would be the same noise in a smaller font. Note this is
  // wider than "in the batting order" — on a selective team a kid can field
  // without batting, and if they declined, the old check emptied their position
  // while naming nobody as out.
  const chartAffecting = chart.filter(
    (entry) => entry.battingOrder !== null || entry.position !== null,
  );

  const declined = chartAffecting
    .filter((entry) => stateOf(entry) === "declined")
    .sort(byBattingSlotThenName);

  const awaiting = chartAffecting
    .filter((entry) => stateOf(entry) === "no-response")
    .sort(byBattingSlotThenName);

  // The spots this team fields, exactly as buildChartView and
  // buildPositionsDraft decide it. A stale CENTER_FIELD or CATCHER row on an
  // allPlay team — hand-seeded during #9, or left behind when allPlay was
  // switched on — is not a seat that team has, so reporting it uncovered would
  // hand the coach a hole they cannot fill: this issue's own bug, one level
  // down. The player is still named in `declined`; nobody disappears.
  const fielded = new Set<Position>(
    allPlay ? ALL_PLAY_INFIELD_POSITIONS : ALL_POSITIONS,
  );

  const assigned = new Map<Position, T>();
  for (const entry of chart) {
    // First writer wins, matching buildChartView. The unique index makes a
    // collision unreachable from a real read.
    if (
      entry.position !== null &&
      fielded.has(entry.position) &&
      !assigned.has(entry.position)
    ) {
      assigned.set(entry.position, entry);
    }
  }

  // Filtered from ALL_POSITIONS rather than assembled, so the result is in
  // scorebook order however the chart rows arrived.
  const uncoveredPositions = ALL_POSITIONS.filter((position) => {
    const holder = assigned.get(position);
    return holder !== undefined && stateOf(holder) === "declined";
  });

  const inOrder = chart
    .filter((entry) => entry.battingOrder !== null)
    .sort((a, b) => a.battingOrder! - b.battingOrder!);

  // Declined only. A no-response player keeps their at-bat here for the same
  // reason rsvp.ts greys nobody for silence: they are most likely playing, and
  // an order that quietly drops them tells the coach something false.
  const effectiveOrder = inOrder.filter((entry) => stateOf(entry) !== "declined");

  return {
    declined,
    awaiting,
    uncoveredPositions,
    effectiveOrder,
    // uncoveredPositions is non-empty only when a declined player holds a
    // fielded spot, so declines alone decide this.
    ready: declined.length === 0,
  };
}
