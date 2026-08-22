import { db } from "./db";
import type { EventRsvpRow, RsvpSourceRow } from "./rsvp";

/// Team-scoped RSVP reads and writes, per AGENTS.md — "Never call Prisma
/// directly from a component." The pure tri-state logic lives next door in
/// rsvp.ts; this module is the thin data layer over it.
///
/// `listEventRsvps` does NOT swallow database errors, unlike most list
/// helpers elsewhere in `src/lib/`. An empty result here is a real product
/// state — "nobody has responded yet" — so a caught outage would silently
/// report every family as silent instead of failing, the same argument
/// `nextGame` makes in schedule.ts for its own null return.
///
/// `guardedRosteredPlayerIds` answers "which players may this caller RSVP
/// for", by intersecting `GuardianPlayer` (global — Decision 15) with
/// `RosterEntry` on *this* team. Guardianship alone is not enough: it would
/// let a parent RSVP a kid who only plays on another team onto this team's
/// event, the exact cross-team write `requireTeamAccess` cannot catch on its
/// own — see the argument on `requireEvent` in the schedule actions.

export async function listEventRsvps(
  teamId: string,
  eventId: string,
): Promise<RsvpSourceRow[]> {
  return db.rsvp.findMany({
    where: { eventId, event: { teamId } },
    select: { playerId: true, attending: true, recordedById: true },
  });
}

/**
 * The same read across several events at once, for team home (#48).
 *
 * Scoped by `teamId` exactly like `listEventRsvps`, so an id from another
 * team's schedule returns nothing rather than that team's attendance. Does not
 * swallow database errors, for the reason in the module docstring: "nobody has
 * answered" is a real product state and a caught outage would assert it.
 */
export async function listRsvpsForEvents(
  teamId: string,
  eventIds: readonly string[],
): Promise<EventRsvpRow[]> {
  if (eventIds.length === 0) {
    return [];
  }

  return db.rsvp.findMany({
    where: { eventId: { in: [...eventIds] }, event: { teamId } },
    select: { eventId: true, playerId: true, attending: true },
  });
}

export async function guardedRosteredPlayerIds(
  teamId: string,
  userId: string,
): Promise<Set<string>> {
  const links = await db.guardianPlayer.findMany({
    where: { userId, player: { rosterEntries: { some: { teamId } } } },
    select: { playerId: true },
  });

  return new Set(links.map((link) => link.playerId));
}

/**
 * Whether this player holds a roster spot on this team — the staff RSVP
 * path's counterpart to `guardedRosteredPlayerIds` (#54). Players are global
 * (Decision 15), so role alone must never authorize a write against a raw
 * playerId: without this, a coach's form could RSVP a kid who only plays on
 * another team onto this team's event.
 */
export async function isPlayerRostered(
  teamId: string,
  playerId: string,
): Promise<boolean> {
  const entry = await db.rosterEntry.findUnique({
    where: { playerId_teamId: { playerId, teamId } },
    select: { id: true },
  });
  return entry !== null;
}

/// Upserts on the `eventId_playerId` unique. Callers must already have
/// proven the event belongs to the caller's team (`getEvent`) and that the
/// caller may write for this player (`guardedRosteredPlayerIds`, or COACH+
/// with `isPlayerRostered`) — this function trusts both and does neither
/// check itself.
///
/// `recordedById` is written on create AND update: null for a family's own
/// tap, the staff user's id for a coach recording on their behalf. Writing it
/// unconditionally is what makes last-write-wins carry provenance — a
/// guardian's tap erases the "recorded by coach" note, and vice versa, in the
/// same statement that writes the state.
export async function upsertRsvp(
  eventId: string,
  playerId: string,
  attending: boolean,
  recordedById: string | null,
): Promise<void> {
  await db.rsvp.upsert({
    where: { eventId_playerId: { eventId, playerId } },
    create: { eventId, playerId, attending, recordedById },
    update: { attending, recordedById },
  });
}

/// Removes the row outright, returning the player to "no response" — the
/// tri-state in rsvp.ts treats row-absence as the real state, so clearing is
/// a delete, not a third value. `deleteMany` rather than `delete` because
/// clearing an already-clear player (two coaches, one kid) must be a no-op,
/// not a P2025.
export async function clearRsvp(eventId: string, playerId: string): Promise<void> {
  await db.rsvp.deleteMany({ where: { eventId, playerId } });
}
