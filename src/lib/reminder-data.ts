import { endOfDayInZone } from "./calendar";
import { db } from "./db";
import { loadGuardianRostersByTeamId } from "./guardians";
import { pickUnsubscribeContact, type ReminderEvent } from "./reminders";

/// The database half of day-of reminders (#47) — the loader and the receipt
/// ledger. The decisions live next door in `reminders.ts`, which is pure;
/// everything that touches Prisma is here, per AGENTS.md.
///
/// Nothing in this module calls `requireTeamAccess`, and that is not an
/// oversight: the cron runs as the system, with no user acting, so there is no
/// membership to resolve. The safety it would have provided is carried by the
/// queries instead — `loadTodaysReminderWork` filters `team.archivedAt: null`
/// itself, and the only write is the receipts ledger, which belongs to no
/// team. The route's `CRON_SECRET` check is what proves the caller is the
/// platform.

/// Belt and braces against a runaway query: a day's events for a single
/// operator's teams is a handful, and anything wildly past that is a bug or a
/// test fixture rather than a real Saturday.
///
/// Hitting it is reported rather than absorbed — see `ReminderWork.truncated`.
/// A cap that quietly drops events would make a half-covered day look
/// identical to a fully covered one in the run summary, which is the failure
/// mode that hides itself.
const MAX_EVENTS_PER_RUN = 50;

export type ReminderWork = {
  events: ReminderEvent[];
  /// True when the day held more events than `MAX_EVENTS_PER_RUN`. Those
  /// events get no reminder and no receipt this run, so the route surfaces
  /// this in its summary instead of reporting a clean sweep.
  truncated: boolean;
};

/**
 * Every event still to come today, on a team that is not archived, with the
 * roster, guardians and RSVP rows each reminder needs.
 *
 * The window is `[now, endOfDayInZone(now)]`, and both halves are load-bearing:
 *
 * - The upper bound is the end of today **in `APP_TIMEZONE`**, so a 7:30 PM
 *   Central game — already tomorrow in UTC — is today's. Anything computed in
 *   the server's zone gets this wrong in production and right on a
 *   Central-set laptop, which is the whole reason `calendar.ts` exists.
 * - The lower bound is `now` rather than the start of today, so a re-run at 3
 *   PM after a failed morning does not "remind" anyone about the 9 AM game
 *   they already played. Deliberately *not* `GAME_GRACE_MS`: that window keeps
 *   an in-progress game current for a display, and this is a send.
 *
 * Archived teams are excluded here rather than downstream (AC 5) — one filter,
 * on the query that names the events, so no later code can reintroduce them.
 *
 * Errors propagate. A caught failure would look identical to "no events
 * today", and silently sending nothing on a game morning is the failure this
 * feature exists to prevent — the same argument `listEventRsvps` makes.
 */
export async function loadTodaysReminderWork(
  now: Date,
): Promise<ReminderWork> {
  // One over the cap, so hitting it is detectable rather than merely
  // indistinguishable from a day that happened to hold exactly that many.
  const found = await db.event.findMany({
    where: {
      startsAt: { gte: now, lte: endOfDayInZone(now) },
      team: { archivedAt: null },
    },
    orderBy: { startsAt: "asc" },
    take: MAX_EVENTS_PER_RUN + 1,
    select: {
      id: true,
      teamId: true,
      type: true,
      startsAt: true,
      location: true,
      opponent: true,
      notes: true,
      team: { select: { name: true } },
      rsvps: { select: { playerId: true, attending: true } },
    },
  });

  const truncated = found.length > MAX_EVENTS_PER_RUN;
  const events = truncated ? found.slice(0, MAX_EVENTS_PER_RUN) : found;

  if (truncated) {
    console.error(
      `Reminder run found more than ${MAX_EVENTS_PER_RUN} events today — the rest are not being reminded`,
    );
  }

  if (events.length === 0) {
    return { events: [], truncated };
  }

  // One roster read for the whole run rather than one per event: a
  // doubleheader is two events on the same team, and the roster is the same
  // both times.
  const teamIds = [...new Set(events.map((event) => event.teamId))];
  const [rosterByTeamId, unsubscribeByTeamId] = await Promise.all([
    loadGuardianRostersByTeamId(teamIds),
    loadUnsubscribeContactsByTeamId(teamIds),
  ]);

  return {
    events: events.map((event) => ({
      id: event.id,
      teamId: event.teamId,
      teamName: event.team.name,
      type: event.type,
      startsAt: event.startsAt,
      location: event.location,
      opponent: event.opponent,
      notes: event.notes,
      roster: rosterByTeamId.get(event.teamId) ?? [],
      rsvps: event.rsvps,
      unsubscribeEmail: unsubscribeByTeamId.get(event.teamId) ?? null,
    })),
    truncated,
  };
}

/**
 * One staff address per team, for the reminder's List-Unsubscribe header.
 *
 * Grouped across the run like `loadGuardianRostersByTeamId`, and for the same reason:
 * a doubleheader is two events on one team. `pickUnsubscribeContact` does the
 * choosing, so which coach gets named is a tested decision rather than a
 * side effect of query ordering.
 *
 * This reads `Membership` rather than the roster, which is the one place in
 * the reminder path that does — and it is not a recipient lookup. Nobody here
 * is mailed; the address only rides in a header so a parent's reply reaches a
 * human. Errors propagate, matching the rest of this loader.
 */
async function loadUnsubscribeContactsByTeamId(
  teamIds: readonly string[],
): Promise<Map<string, string | null>> {
  const staff = await db.membership.findMany({
    where: { teamId: { in: [...teamIds] }, role: { in: ["OWNER", "COACH"] } },
    select: {
      teamId: true,
      userId: true,
      role: true,
      user: { select: { email: true } },
    },
  });

  const byTeamId = new Map<string, typeof staff>();
  for (const row of staff) {
    byTeamId.set(row.teamId, [...(byTeamId.get(row.teamId) ?? []), row]);
  }

  return new Map(
    [...byTeamId].map(([teamId, rows]) => [
      teamId,
      pickUnsubscribeContact(
        rows.map((row) => ({
          userId: row.userId,
          role: row.role as "OWNER" | "COACH",
          email: row.user.email,
        })),
      ),
    ]),
  );
}

export type ClaimResult = "claimed" | "already-sent";

/**
 * Take the (event, guardian) slot, or report that someone already has it.
 *
 * Claim-first is the whole of the duplicate protection (AC 4). The insert
 * races at the unique index rather than in application logic, so two
 * overlapping cron invocations cannot both win — a read-then-write check
 * could, and on a fan-out that mails real families the duplicate is the
 * expensive outcome.
 *
 * The cost, accepted deliberately: a crash in the instant between claiming and
 * sending loses one reminder, because the claim outlives the failed process.
 * That is the right way round — a missed reminder is a phone call, a duplicate
 * one teaches parents to ignore the app.
 *
 * `P2002` is duck-typed rather than caught by class, exactly as
 * `rosterWriteFailure` does it and for the same reason: `src/generated/prisma`
 * is gitignored, so its internal export path is not a stable import. Both
 * `meta.target` shapes are tolerated for the same reason too — see the note in
 * `roster-rules.ts`; which shape a live write returns is still unverified.
 */
export async function claimReminder(
  eventId: string,
  userId: string,
): Promise<ClaimResult> {
  try {
    await db.reminderReceipt.create({
      data: { eventId, userId },
      select: { id: true },
    });
    return "claimed";
  } catch (error) {
    if (isUniqueViolation(error)) {
      return "already-sent";
    }
    throw error;
  }
}

/**
 * Give the slot back after a failed send, so the next run retries it.
 *
 * Best-effort on purpose: if this delete fails, the receipt stands and that
 * guardian simply misses one reminder. Throwing here would abort the rest of
 * the batch over a reminder that already failed to send — strictly worse.
 */
export async function releaseReminder(
  eventId: string,
  userId: string,
): Promise<void> {
  try {
    await db.reminderReceipt.deleteMany({ where: { eventId, userId } });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error(
      `Failed to release reminder receipt for event ${eventId}, user ${userId}:`,
      detail,
    );
  }
}

type PrismaLikeError = {
  code?: unknown;
  meta?: { target?: unknown };
};

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as PrismaLikeError;
  if (candidate.code !== "P2002") {
    return false;
  }

  const target = candidate.meta?.target;

  // Array shape: the column names. String shape: the constraint name. A P2002
  // on this table can only be the one unique index, so either shape mentioning
  // eventId is enough — and a P2002 with no usable target still counts, since
  // there is nothing else on ReminderReceipt for it to be.
  if (Array.isArray(target)) {
    return target.includes("eventId") || target.includes("userId");
  }
  if (typeof target === "string") {
    return target.includes("eventId") || target.includes("ReminderReceipt");
  }

  return true;
}
