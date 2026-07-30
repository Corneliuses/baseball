import { db } from "./db";
import type { RsvpRow } from "./rsvp";

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
): Promise<RsvpRow[]> {
  return db.rsvp.findMany({
    where: { eventId, event: { teamId } },
    select: { playerId: true, attending: true },
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

/// Upserts on the `eventId_playerId` unique. Callers must already have
/// proven the event belongs to the caller's team (`getEvent`) and that the
/// caller guards this player (`guardedRosteredPlayerIds`) — this function
/// trusts both and does neither check itself.
export async function upsertRsvp(
  eventId: string,
  playerId: string,
  attending: boolean,
): Promise<void> {
  await db.rsvp.upsert({
    where: { eventId_playerId: { eventId, playerId } },
    create: { eventId, playerId, attending },
    update: { attending },
  });
}
