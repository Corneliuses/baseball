import { deriveRsvpState, type RsvpState } from "./rsvp";

/// Day-of reminders (#47): who gets told what, on the morning of a team's
/// game or practice.
///
/// Pure and DB-free, per AGENTS.md — the loading half lives next door in
/// `reminder-data.ts` and the sending half in the cron route. Everything here
/// is a decision about grouping and content, which is exactly the part worth
/// testing without a database.
///
/// The one rule this module encodes, and the reason it is a function rather
/// than a query: **one email per guardian per event, listing all of that
/// guardian's kids on the team.** A household with two kids on the roster gets
/// one message naming both, not two nearly identical ones — the same
/// one-per-household instinct as Decision 15's step 4, which keys its notice
/// off newly created memberships rather than the guardian list.
///
/// Recipients are reached through the roster (`RosterEntry -> Player ->
/// GuardianPlayer -> User`), never through `Membership`. A coach with no kid
/// on the team has nothing to be reminded *about* — no RSVP state to report —
/// and already lives in the schedule. Reading guardians this way also keeps
/// the "people are global, participation is team-scoped" split intact: the
/// team's roster is what selects the people.

/// The shape `loadTodaysReminderWork` returns for one event. Structural rather
/// than Prisma types, so tests and callers never import the generated client.
export type ReminderEvent = {
  id: string;
  teamId: string;
  teamName: string;
  type: "GAME" | "PRACTICE";
  startsAt: Date;
  location: string | null;
  opponent: string | null;
  notes: string | null;
  /// One entry per player rostered on this event's team.
  roster: ReminderRosterEntry[];
  /// This event's RSVP rows. A player with no row is no-response.
  rsvps: { playerId: string; attending: boolean }[];
};

export type ReminderRosterEntry = {
  playerId: string;
  playerName: string;
  guardians: ReminderGuardian[];
};

export type ReminderGuardian = {
  userId: string;
  email: string;
  name: string | null;
};

/// One kid's line in a reminder email.
export type ReminderKid = {
  playerId: string;
  name: string;
  rsvp: RsvpState;
};

/// Everything one email needs: who it goes to, which event, and that
/// recipient's own kids. Nothing about any other family — contact details and
/// attendance stay staff-facing everywhere else in the app, and a reminder is
/// not the place to leak them.
export type ReminderPayload = {
  eventId: string;
  teamId: string;
  teamName: string;
  userId: string;
  email: string;
  guardianName: string | null;
  type: "GAME" | "PRACTICE";
  startsAt: Date;
  location: string | null;
  opponent: string | null;
  notes: string | null;
  kids: ReminderKid[];
};

/**
 * Fan one day's events out into one payload per (guardian, event) pair.
 *
 * Ordering is deterministic — events as given (the query sorts by `startsAt`),
 * then guardians in first-seen roster order, then each guardian's kids in
 * roster order. The cron sends in this order and its receipts are keyed on
 * `(eventId, userId)`, so a re-run after a partial failure walks the same
 * sequence and skips exactly what already went.
 *
 * A guardian with no email is skipped: `User.email` is non-null in the schema,
 * but the loader's select is the only thing enforcing that here and an empty
 * string would become a send to nowhere.
 *
 * Note what is deliberately *not* filtered — RSVP state. A family that already
 * said yes still gets the reminder: the email tells them where and when, and
 * "you said yes" is part of the content, not a reason to stay silent. Nor is a
 * declined family skipped, because plans change on the morning of a game.
 */
export function buildReminderBatch(
  events: readonly ReminderEvent[],
): ReminderPayload[] {
  return events.flatMap((event) => buildEventPayloads(event));
}

function buildEventPayloads(event: ReminderEvent): ReminderPayload[] {
  const rsvpByPlayerId = new Map(
    event.rsvps.map((row) => [row.playerId, row] as const),
  );

  // Insertion-ordered, so guardians come out in roster order and a household
  // is collected across however many kids it guards.
  const byUserId = new Map<
    string,
    { guardian: ReminderGuardian; kids: ReminderKid[] }
  >();

  for (const entry of event.roster) {
    const kid: ReminderKid = {
      playerId: entry.playerId,
      name: entry.playerName,
      rsvp: deriveRsvpState(rsvpByPlayerId.get(entry.playerId)),
    };

    for (const guardian of entry.guardians) {
      if (!guardian.email) {
        continue;
      }

      const existing = byUserId.get(guardian.userId);
      if (existing) {
        // A guardian listed twice on one kid (impossible under the composite
        // primary key, but the loader's shape does not prove it) must not
        // list that kid twice.
        if (!existing.kids.some((k) => k.playerId === kid.playerId)) {
          existing.kids.push(kid);
        }
        continue;
      }

      byUserId.set(guardian.userId, { guardian, kids: [kid] });
    }
  }

  return [...byUserId.values()].map(({ guardian, kids }) => ({
    eventId: event.id,
    teamId: event.teamId,
    teamName: event.teamName,
    userId: guardian.userId,
    email: guardian.email,
    guardianName: guardian.name,
    type: event.type,
    startsAt: event.startsAt,
    location: event.location,
    opponent: event.opponent,
    notes: event.notes,
    kids,
  }));
}
