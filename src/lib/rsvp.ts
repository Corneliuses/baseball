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

/// The subset of `Rsvp` the derivation needs — structural, so tests and
/// callers never import the generated Prisma client. `attending` drives
/// `deriveRsvpState`; `playerId` is what `buildRsvpStateMap` keys on.
export type RsvpRow = { playerId: string; attending: boolean };

/// A row that also carries provenance (#54): `recordedById` is set only when
/// a staff member recorded the response on the family's behalf, null when the
/// family recorded it themselves.
export type RsvpSourceRow = RsvpRow & { recordedById: string | null };

/**
 * The players whose *current* response was recorded by staff rather than
 * their own family — what the event page's "Recorded by coach" note keys on.
 * Provenance never affects state: `deriveRsvpState` and the maps below stay
 * blind to it, which is what keeps readiness unchanged by #54.
 */
export function staffRecordedPlayerIds(
  rows: readonly RsvpSourceRow[],
): Set<string> {
  return new Set(
    rows.filter((row) => row.recordedById !== null).map((row) => row.playerId),
  );
}

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
/// A row carrying which event it belongs to — what a read across several
/// events at once has to return, since `playerId` alone no longer identifies it.
export type EventRsvpRow = RsvpRow & { eventId: string };

/**
 * One state map per event, keyed by event id.
 *
 * Team home (#48) asks the same question of three events at once, and asking
 * it three times over separately fetched rows is how two of them end up
 * disagreeing about the same family. Every id in `eventIds` gets a map and
 * every player in `playerIds` gets an entry in it, so a lookup never misses —
 * an event nobody has answered for is a map of "no-response", not an absent key
 * the caller has to remember to default.
 */
export function buildRsvpStateMapsByEvent(
  eventIds: readonly string[],
  playerIds: readonly string[],
  rows: readonly EventRsvpRow[],
): Map<string, Map<string, RsvpState>> {
  const rowsByEventId = new Map<string, EventRsvpRow[]>();
  for (const row of rows) {
    const bucket = rowsByEventId.get(row.eventId);
    if (bucket) {
      bucket.push(row);
    } else {
      rowsByEventId.set(row.eventId, [row]);
    }
  }

  return new Map(
    eventIds.map((eventId) => [
      eventId,
      buildRsvpStateMap(playerIds, rowsByEventId.get(eventId) ?? []),
    ]),
  );
}

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
