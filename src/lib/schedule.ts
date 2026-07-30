import { EventType } from "@/generated/prisma/enums";
import {
  GAME_GRACE_MS,
  monthGridRange,
  selectNextGame,
  startOfDayInZone,
  type CalendarMonth,
} from "./calendar";
import { db } from "./db";

/// Team-scoped schedule reads and writes, per AGENTS.md — "Never call Prisma
/// directly from a component." The pure date logic lives next door in
/// calendar.ts; this module is the thin data layer over it.
///
/// Error handling differs by shape, not by read-vs-write, matching the rule
/// roster.ts and teams.ts already follow:
///   - The list helpers swallow database errors and return an empty result. A
///     dead database should render an empty schedule, not crash a request.
///   - `getEvent` does NOT swallow — its caller turns a null return into
///     `notFound()`, so a caught outage would misreport "this event doesn't
///     exist" for one that does. Same fix `getTeamById` got in #3.
///   - `nextGame` does NOT swallow either, for a sharper version of the same
///     reason: `null` is a meaningful product state ("no upcoming game") that
///     #8 and #12 both render. A swallowed outage would quietly assert that
///     state instead of failing, and the coach would see "no upcoming game" on
///     the morning of one.
///   - The mutations propagate too: callers (server actions) run
///     requireTeamAccess before calling any of these, and a write that
///     silently fails and still looks like it succeeded is worse than one that
///     throws.
///
/// **Every function takes `teamId` and puts it in the where clause.**
/// `requireTeamAccess` proves the caller may act on *this* team; it cannot
/// prove the record they named belongs to it, because a server action POSTs to
/// the current page URL and only the action knows what it is about to mutate.
/// Without the scope a coach on team A could delete team B's game — cascading
/// team B's RSVPs with it, since `Rsvp.event` is `onDelete: Cascade`. See
/// design-doc.md #6 Decision 5 and the same argument on `requireRosterEntry`.

export type ScheduleEvent = {
  id: string;
  type: EventType;
  startsAt: Date;
  location: string | null;
  opponent: string | null;
  notes: string | null;
};

const EVENT_SELECT = {
  id: true,
  type: true,
  startsAt: true,
  location: true,
  opponent: true,
  notes: true,
} as const;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/// Every event the month grid renders — the padded week range, not just the
/// month, so a cell for 30 July in the August grid is not silently empty.
/// `monthGridRange` does the zone conversion so the bounds are real instants.
export async function listEventsInMonthGrid(
  teamId: string,
  month: CalendarMonth,
): Promise<ScheduleEvent[]> {
  const { start, end } = monthGridRange(month);

  try {
    return await db.event.findMany({
      where: { teamId, startsAt: { gte: start, lte: end } },
      select: EVENT_SELECT,
      orderBy: { startsAt: "asc" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch events for month:", message);
    return [];
  }
}

/**
 * Today forward, soonest first — the list view's default.
 *
 * The boundary is the **start of today in APP_TIMEZONE**, not `now`. Cutting
 * at `now` would drop a game off this list the instant it began, so a coach
 * standing at the field at 3pm would be told there is nothing scheduled. Pairs
 * with `listPastEvents`, which uses the same boundary so the two partition the
 * schedule exactly once.
 */
export async function listUpcomingEvents(
  teamId: string,
  now: Date = new Date(),
): Promise<ScheduleEvent[]> {
  try {
    return await db.event.findMany({
      where: { teamId, startsAt: { gte: startOfDayInZone(now) } },
      select: EVENT_SELECT,
      orderBy: { startsAt: "asc" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch upcoming events:", message);
    return [];
  }
}

/// Everything before today, **most recent first** — the useful order for
/// looking backwards, and the reverse of the upcoming list on purpose. Shares
/// the start-of-today boundary with `listUpcomingEvents`, so today's earlier
/// events appear in exactly one of the two lists.
export async function listPastEvents(
  teamId: string,
  now: Date = new Date(),
): Promise<ScheduleEvent[]> {
  try {
    return await db.event.findMany({
      where: { teamId, startsAt: { lt: startOfDayInZone(now) } },
      select: EVENT_SELECT,
      orderBy: { startsAt: "desc" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch past events:", message);
    return [];
  }
}

/**
 * One event on one team.
 *
 * Database errors are deliberately NOT swallowed — see the module docstring.
 * `null` here means "not on this team", nothing else, and the caller turns it
 * into `notFound()`.
 *
 * This is also the authoritative resolver for an event id: it is scoped by
 * `teamId`, so server actions resolve through it rather than trusting a form
 * field.
 */
export async function getEvent(
  teamId: string,
  eventId: string,
): Promise<ScheduleEvent | null> {
  return db.event.findFirst({
    where: { id: eventId, teamId },
    select: EVENT_SELECT,
  });
}

/**
 * The team's next game — **games only, never practices**.
 *
 * Practices have RSVPs but no chart, so the readiness check (#12) and the view
 * page (#8) both ignore them. This function is the single home for that rule.
 *
 * The grace window is applied twice on purpose: once in the `where` clause so
 * Postgres does the filtering, and once through `selectNextGame` so the
 * definition of "next" lives in one pure, tested place rather than being
 * re-expressed in SQL. If the two ever disagree, the pure one wins.
 */
export async function nextGame(
  teamId: string,
  now: Date = new Date(),
): Promise<ScheduleEvent | null> {
  // No `take: 1` here, deliberately. If the SQL filter and selectNextGame's
  // definition of "next" ever diverge — someone loosens the `where` clause
  // without updating this function, say — the pure function needs every
  // candidate the loosened query returns to still pick correctly, not just a
  // single pre-filtered row it may have to reject outright. A season's worth
  // of games is small enough that fetching all of them is free.
  const candidates = await db.event.findMany({
    where: {
      teamId,
      type: "GAME",
      startsAt: { gt: new Date(now.getTime() - GAME_GRACE_MS) },
    },
    select: EVENT_SELECT,
    orderBy: { startsAt: "asc" },
  });

  return selectNextGame(candidates, now);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type EventInput = {
  type: EventType;
  /// A true UTC instant, already converted from the coach's wall clock by
  /// `wallClockToInstant`. Never a naive local time.
  startsAt: Date;
  location: string | null;
  opponent: string | null;
  notes: string | null;
};

export async function createEvent(
  teamId: string,
  input: EventInput,
): Promise<ScheduleEvent> {
  return db.event.create({
    data: { teamId, ...input },
    select: EVENT_SELECT,
  });
}

export async function updateEvent(
  teamId: string,
  eventId: string,
  input: EventInput,
): Promise<ScheduleEvent> {
  return db.event.update({
    where: { id: eventId, teamId },
    data: input,
    select: EVENT_SELECT,
  });
}

/// Deletes the event and, by `Rsvp.event`'s `onDelete: Cascade`, every RSVP
/// attached to it. That is correct — an event that never happens has no
/// attendance — but it is irreversible, which is why the UI confirms first.
export async function deleteEvent(teamId: string, eventId: string): Promise<void> {
  await db.event.delete({
    where: { id: eventId, teamId },
  });
}
