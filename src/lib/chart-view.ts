import { Position } from "@/generated/prisma/enums";
import { ALL_PLAY_INFIELD_POSITIONS, ALL_POSITIONS } from "@/lib/positions";
import type { RsvpState } from "@/lib/rsvp";

/// The view page's read-only render model (#8).
///
/// RSVP state is decoration, never a filter: `buildChartView` attaches an
/// `RsvpState` to every entry but never uses it to reorder, renumber, or drop
/// anyone from the lineup or the diamond. Deliberately does NOT reuse
/// readiness.ts's `ChartEntry` — readiness filters by attendance, which is
/// exactly what this module must never do, and importing that type would
/// invite importing that behavior too.
///
/// Pure and DB-free so it tests without a database; `getChart` in roster.ts
/// is the thin data layer that feeds it.

export type ChartViewEntry = {
  /// The RosterEntry id — the roster spot, not the global person. The chart
  /// editor (#10) keys its writes on this; the view page ignores it.
  entryId: string;
  playerId: string;
  playerName: string;
  jerseyNumber: number | null;
  /// Null means the player is not in the batting order (bench).
  battingOrder: number | null;
  /// Null means the player has no fielding assignment (bench).
  position: Position | null;
};

export type ChartViewPlayer = ChartViewEntry & {
  rsvpState: RsvpState;
};

export type ChartView = {
  /// Rostered players in the standing batting order, ascending.
  lineup: ChartViewPlayer[];
  /// Every position that has an assigned player, keyed by position.
  byPosition: Map<Position, ChartViewPlayer>;
  /// Everyone the diamond doesn't seat, in the roster's jersey-then-name order.
  /// What this means depends on the team's `allPlay` setting, which is why it
  /// isn't named here: on an allPlay team it's the outfield (LF/CF/RF are one
  /// zone and hold everyone left over — see `droppablePositions` in chart.ts),
  /// and otherwise it's the bench. The page decides how to say it.
  unassigned: ChartViewPlayer[];
  /// True when at least one roster entry has a batting order or a position
  /// set — a partial chart (entered incrementally by hand during the
  /// validation weekend) still counts. Only a fully empty chart is "no chart
  /// set yet".
  hasChart: boolean;
};

/// `sortRoster`'s ordering, restated over this module's render model rather
/// than imported: that one keys off `player.name` on a Prisma-shaped row, and
/// reshaping a ChartViewPlayer to borrow it costs more than the four lines.
/// Unnumbered players sort last; jerseys are unique per team, so the name
/// comparison only ever settles two unnumbered players.
function byJerseyThenName(a: ChartViewPlayer, b: ChartViewPlayer): number {
  if (a.jerseyNumber === null && b.jerseyNumber === null) {
    return a.playerName.localeCompare(b.playerName);
  }
  if (a.jerseyNumber === null) return 1;
  if (b.jerseyNumber === null) return -1;
  return a.jerseyNumber - b.jerseyNumber;
}

/**
 * @param allPlay Which spots this team actually fields. The read-side twin of
 * `buildPositionsDraft`'s parameter of the same name, and it does the same job:
 * a player stored at a position the team doesn't field — an allPlay team's
 * stale LF/CF/RF or CATCHER row, hand-set during #9 or left behind when allPlay
 * was switched on — is pooled rather than seated.
 *
 * That is what keeps the two diamonds telling one story. The editor already
 * shows those players in its outfield zone, and the view page draws its zone at
 * the very coordinates a named outfield marker would occupy, so seating them
 * here would stack two markers on one spot and make both names unreadable.
 * Nobody vanishes either way — they are in the outfield, which is where the
 * coach's next save will put them.
 */
export function buildChartView(
  entries: readonly ChartViewEntry[],
  rsvpStates: ReadonlyMap<string, RsvpState>,
  allPlay: boolean,
): ChartView {
  const players = entries.map((entry) => ({
    ...entry,
    rsvpState: rsvpStates.get(entry.playerId) ?? "no-response",
  }));

  const lineup = players
    .filter((player) => player.battingOrder !== null)
    .sort((a, b) => a.battingOrder! - b.battingOrder!);

  const fielded = new Set<Position>(
    allPlay ? ALL_PLAY_INFIELD_POSITIONS : ALL_POSITIONS,
  );
  const byPosition = new Map<Position, ChartViewPlayer>();
  const unseated: ChartViewPlayer[] = [];
  for (const player of players) {
    // First writer wins, matching buildPositionsDraft. The unique index makes a
    // collision unreachable from a real read, but the loser is pooled rather
    // than dropped if it ever happens.
    if (
      player.position !== null &&
      fielded.has(player.position) &&
      !byPosition.has(player.position)
    ) {
      byPosition.set(player.position, player);
    } else {
      unseated.push(player);
    }
  }

  // Sorted, not left in the order `getChart` handed over: that is a findMany
  // with no orderBy, so Postgres is free to return the rows differently between
  // two requests and the outfield cluster would visibly reshuffle. Jersey then
  // name is `sortRoster`'s order (roster-rules.ts), which is what the coach
  // arranged in the editor's zone.
  const unassigned = unseated.sort(byJerseyThenName);

  const hasChart = players.some(
    (player) => player.battingOrder !== null || player.position !== null,
  );

  return { lineup, byPosition, unassigned, hasChart };
}
