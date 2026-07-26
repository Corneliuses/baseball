import { Position } from "@/generated/prisma/enums";
import { ALL_POSITIONS } from "@/lib/positions";

/// The next-game readiness check.
///
/// This is a READ-ONLY derivation: it reports how the team's standing chart
/// fares against one game's RSVPs and writes nothing. It does not rearrange the
/// chart, and it must never persist an "effective lineup" — that is how per-game
/// lineup rows creep back in, which Decision 16 deliberately removed.
///
/// Deliberately pure and DB-free so it can be tested without a database. The
/// caller supplies the team's roster chart and that event's RSVPs.

export type ChartEntry = {
  playerId: string;
  playerName: string;
  /// Null means the player is not in the batting order (bench).
  battingOrder: number | null;
  /// Null means the player has no fielding assignment (bench).
  position: Position | null;
};

export type Readiness = {
  /// Rostered players in the standing batting order who are not attending.
  absentFromOrder: ChartEntry[];
  /// Positions left empty because the assigned player is out.
  uncoveredPositions: Position[];
  /// The batting order for this game: attending players only, ranks closed up.
  effectiveOrder: ChartEntry[];
  /// True when nothing needs the coach's attention.
  ready: boolean;
};

/**
 * @param chart      The team's standing chart — every roster entry.
 * @param attending  Player IDs RSVP'd attending for this one game.
 */
export function computeReadiness(
  chart: readonly ChartEntry[],
  attending: ReadonlySet<string>,
): Readiness {
  const inOrder = chart
    .filter((entry) => entry.battingOrder !== null)
    .sort((a, b) => a.battingOrder! - b.battingOrder!);

  const absentFromOrder = inOrder.filter(
    (entry) => !attending.has(entry.playerId),
  );

  const assigned = new Map<Position, ChartEntry>();
  for (const entry of chart) {
    if (entry.position !== null) assigned.set(entry.position, entry);
  }

  const uncoveredPositions = ALL_POSITIONS.filter((position) => {
    const holder = assigned.get(position);
    return holder !== undefined && !attending.has(holder.playerId);
  });

  const effectiveOrder = inOrder.filter((entry) => attending.has(entry.playerId));

  return {
    absentFromOrder,
    uncoveredPositions,
    effectiveOrder,
    ready: absentFromOrder.length === 0 && uncoveredPositions.length === 0,
  };
}
