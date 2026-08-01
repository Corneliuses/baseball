import { Position } from "@/generated/prisma/enums";
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
  /// True when at least one roster entry has a batting order or a position
  /// set — a partial chart (entered incrementally by hand during the
  /// validation weekend) still counts. Only a fully empty chart is "no chart
  /// set yet".
  hasChart: boolean;
};

export function buildChartView(
  entries: readonly ChartViewEntry[],
  rsvpStates: ReadonlyMap<string, RsvpState>,
): ChartView {
  const players = entries.map((entry) => ({
    ...entry,
    rsvpState: rsvpStates.get(entry.playerId) ?? "no-response",
  }));

  const lineup = players
    .filter((player) => player.battingOrder !== null)
    .sort((a, b) => a.battingOrder! - b.battingOrder!);

  const byPosition = new Map<Position, ChartViewPlayer>();
  for (const player of players) {
    if (player.position !== null) byPosition.set(player.position, player);
  }

  const hasChart = players.some(
    (player) => player.battingOrder !== null || player.position !== null,
  );

  return { lineup, byPosition, hasChart };
}
