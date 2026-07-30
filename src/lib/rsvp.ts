/// The RSVP tri-state model. Attending, declined, and no-response are
/// distinct states — and the absence of an `Rsvp` row is what makes
/// no-response real rather than a fallback. This module is the contract #8
/// (view page) and #12 (readiness) both consume.
///
/// RSVP is reporting, never a gate: nothing here filters a roster or chart by
/// state, and nothing downstream may either. A player with `declined` or
/// `no-response` is still fully rosterable and fully placeable in the batting
/// order and on the diamond.
///
/// Deliberately pure and DB-free so it tests without a database. Data
/// loading belongs in the thin wrapper next door, `src/lib/rsvps.ts`.

export type RsvpState = "attending" | "declined" | "no-response";

/// The one field of `Rsvp` the derivation needs — structural, so tests and
/// callers never import the generated Prisma client.
export type RsvpRow = { playerId: string; attending: boolean };

/**
 * @param row The player's `Rsvp` row for this event, or undefined if none exists.
 */
export function deriveRsvpState(row: { attending: boolean } | undefined): RsvpState {
  if (row === undefined) return "no-response";
  return row.attending ? "attending" : "declined";
}

/**
 * One event's RSVP state across a roster. Every player in `playerIds` gets an
 * entry, defaulting to "no-response" when no row exists. A row for a player
 * NOT in `playerIds` — e.g. one removed from the roster after RSVPing — is
 * excluded: this answers "where does this roster stand", not "what rows
 * exist".
 */
export function buildRsvpStateMap(
  playerIds: readonly string[],
  rows: readonly RsvpRow[],
): Map<string, RsvpState> {
  const rowByPlayerId = new Map(rows.map((row) => [row.playerId, row]));

  return new Map(
    playerIds.map((playerId) => [
      playerId,
      deriveRsvpState(rowByPlayerId.get(playerId)),
    ]),
  );
}
