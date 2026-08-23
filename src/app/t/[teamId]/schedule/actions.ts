"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";

import { formatEventDateTime, wallClockToInstant } from "@/lib/calendar";
import {
  clearRsvp,
  guardedRosteredPlayerIds,
  isPlayerRostered,
  upsertRsvp,
} from "@/lib/rsvps";
import {
  createEvent,
  deleteEvent,
  getEvent,
  updateEvent,
  type EventInput,
  type ScheduleEvent,
} from "@/lib/schedule";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getTeamById } from "@/lib/teams";
import { listTeamMembers } from "@/lib/memberships";
import { listTeamGuardians } from "@/lib/guardians";
import { sendEmail } from "@/lib/email";
import { sendPushToUser } from "@/lib/push";
import {
  buildAnnouncementRecipients,
  shouldAnnounceEvent,
  type AnnouncementRecipient,
} from "@/lib/announcements";
import { AnnouncementReceiptEmail } from "@/emails/AnnouncementReceiptEmail";
import { EventAnnouncementEmail } from "@/emails/EventAnnouncementEmail";
import { buildAnnouncementReceiptEmail } from "@/emails/announcement-receipt-email";
import { buildEventAnnouncementEmail } from "@/emails/event-announcement-email";

import {
  stickyValues,
  type AddEventAnnouncement,
  type AddEventField,
  type AddEventState,
  type EventFormValues,
} from "./event-form-state";
import {
  eventUrl,
  optionalScheduleContextFromForm,
  scheduleContextFromForm,
  scheduleQuery,
  scheduleUrl,
  type ScheduleContext,
} from "./schedule-context";

/// Event mutations. All three are COACH+; reads are open to any member and
/// live in the page loaders.
///
/// Structure mirrors src/app/t/[teamId]/roster/actions.ts deliberately —
/// `unstable_rethrow` first in every catch so Next's own redirect and
/// notFound signals are not swallowed, then TeamAccessError to an `?error=`
/// redirect, then rethrow.

function extractTeamId(formData: FormData): string {
  const teamId = String(formData.get("teamId")).trim();
  if (!teamId || teamId === "null" || teamId === "undefined") {
    throw new Error("Invalid team ID");
  }
  return teamId;
}

function extractEventId(formData: FormData): string {
  const eventId = String(formData.get("eventId")).trim();
  if (!eventId || eventId === "null" || eventId === "undefined") {
    throw new Error("Invalid event ID");
  }
  return eventId;
}

function extractPlayerId(formData: FormData): string {
  const playerId = String(formData.get("playerId")).trim();
  if (!playerId || playerId === "null" || playerId === "undefined") {
    throw new Error("Invalid player ID");
  }
  return playerId;
}

const MAX_SHORT_TEXT = 200;
const MAX_NOTES = 2000;

/// Blank optional fields become null rather than empty strings — the columns
/// are nullable and "" is not a location.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value));

const eventSchema = z.object({
  type: z.enum(["GAME", "PRACTICE"]),
  startsAt: z.string().trim().min(1),
  location: optionalText(MAX_SHORT_TEXT),
  opponent: optionalText(MAX_SHORT_TEXT),
  notes: optionalText(MAX_NOTES),
});

type EventErrorCode =
  | "invalid-type"
  | "invalid-datetime"
  | "invalid-location"
  | "invalid-opponent"
  | "invalid-notes";

function eventValidationErrorCode(error: z.ZodError): EventErrorCode {
  const field = error.issues[0]?.path[0];
  switch (field) {
    case "type":
      return "invalid-type";
    case "location":
      return "invalid-location";
    case "opponent":
      return "invalid-opponent";
    case "notes":
      return "invalid-notes";
    default:
      return "invalid-datetime";
  }
}

/// The one form field each error code is actually about. `invalid-datetime`
/// reaches here two ways — a blank/malformed string caught by the schema, or
/// a syntactically valid one `wallClockToInstant` still rejects — and both
/// belong to `startsAt`.
function eventErrorField(code: EventErrorCode): AddEventField {
  switch (code) {
    case "invalid-type":
      return "type";
    case "invalid-location":
      return "location";
    case "invalid-opponent":
      return "opponent";
    case "invalid-notes":
      return "notes";
    case "invalid-datetime":
      return "startsAt";
  }
}

type ParsedEventForm = { input: EventInput } | { errorCode: EventErrorCode };

/**
 * Validate the shared event form and convert the coach's wall clock into a
 * true UTC instant.
 *
 * The `datetime-local` input submits a local time with no offset, so
 * `wallClockToInstant` is what anchors it to APP_TIMEZONE. Skipping that step
 * and handing the raw string to `new Date()` would parse it in the *server's*
 * zone — UTC on Vercel — and store a game five hours off.
 */
function parseEventForm(formData: FormData): ParsedEventForm {
  const parsed = eventSchema.safeParse({
    type: formData.get("type") ?? "",
    startsAt: formData.get("startsAt") ?? "",
    location: formData.get("location") ?? "",
    opponent: formData.get("opponent") ?? "",
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    return { errorCode: eventValidationErrorCode(parsed.error) };
  }

  let startsAt: Date;
  try {
    startsAt = wallClockToInstant(parsed.data.startsAt);
  } catch {
    return { errorCode: "invalid-datetime" };
  }

  return {
    input: {
      type: parsed.data.type,
      startsAt,
      location: parsed.data.location,
      opponent: parsed.data.opponent,
      notes: parsed.data.notes,
    },
  };
}

/**
 * Prove the caller may write to this team AND that the event they named is
 * actually on it.
 *
 * `requireTeamAccess` alone is not enough: a server action POSTs to the
 * current page URL, so it can prove the caller is a coach on team A while the
 * form body names an event on team B. Deleting that event would cascade team
 * B's RSVPs. Same argument as `requireRosterEntry` in the roster actions.
 */
async function requireEvent(
  teamId: string,
  eventId: string,
  context?: ScheduleContext,
) {
  await requireTeamAccess(teamId, { intent: "write", minRole: "COACH" });

  const event = await getEvent(teamId, eventId);
  if (!event) {
    redirect(
      context
        ? scheduleUrl(teamId, context)
        : `/t/${teamId}/schedule`,
    );
  }

  return event;
}

// ---------------------------------------------------------------------------
// Announcing a new event (#45)
// ---------------------------------------------------------------------------

/// Ceiling on one announcement fan-out. Recipients resolve from the roster
/// rather than the POST, so this bounds a runaway roster, not a forged form.
///
/// **Deliberately not 30**, unlike the bulk invite's MAX_ROWS and the message
/// fan-out's own MAX_RECIPIENTS, and the difference is the point. Those two are
/// blocking: a coach is watching a spinner, so a cap that rejects cleanly beats
/// one that times out half-finished. This loop runs in `after()` with nobody
/// waiting, so the same number would buy nothing and cost everything — 30
/// rejects a real team. Recipients dedupe per guardian **User**, not per
/// household, so the brief's ~15 players is ~25 guardians and a 16-player roster
/// with both parents linked is 32. At 30 that team's every announcement would
/// fail, permanently, with no retry path.
///
/// 200 is a runaway guard rather than a product limit — the same number and the
/// same reasoning as the reminder cron's MAX_SENDS_PER_RUN, against the same
/// 300s ceiling: 200 × 600ms is 120s of pacing before per-send latency. It
/// stays coupled to the schedule page's `maxDuration` (AGENTS.md), and anything
/// it drops is reported in the coach's receipt rather than silently skipped.
const MAX_RECIPIENTS = 200;

/// Resend's API is rate limited (2 requests/second by default). Same value and
/// same remainder-only wait as the bulk invite, the message fan-out and the
/// reminder cron.
const MIN_SEND_INTERVAL_MS = 600;

function emailEnv() {
  return {
    AUTH_URL: process.env.AUTH_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    VERCEL_URL: process.env.VERCEL_URL,
  };
}

type AnnouncementWork = {
  teamId: string;
  teamName: string;
  event: ScheduleEvent;
  coachEmail: string | null;
  recipients: AnnouncementRecipient[];
  /// Families past MAX_RECIPIENTS, never attempted. Zero for any real roster.
  skipped: number;
};

/**
 * Everything the deferred fan-out needs, resolved while the coach is still
 * waiting on the action.
 *
 * Deliberately synchronous even though the *sending* is not: it costs one
 * indexed query and it buys an honest "Emailing 24 parents now" instead of a
 * vague reassurance. It also keeps one announcement failure — a roster that
 * cannot be read — knowable while there is still a response to report it in.
 * Everything after this point reports by email, because there is nothing left
 * to return to.
 *
 * Throws only what the caller catches; a null return means "nobody to tell",
 * which is a real state (a roster with no guardians linked yet) and not a
 * failure.
 */
async function resolveAnnouncementWork(
  teamId: string,
  event: ScheduleEvent,
  coachEmail: string | null,
): Promise<AnnouncementWork | null> {
  const [team, roster] = await Promise.all([
    getTeamById(teamId),
    listTeamGuardians(teamId),
  ]);

  const all = buildAnnouncementRecipients(roster);
  if (all.length === 0) {
    return null;
  }

  return {
    teamId,
    teamName: team?.name ?? "your team",
    event,
    coachEmail,
    recipients: all.slice(0, MAX_RECIPIENTS),
    skipped: Math.max(0, all.length - MAX_RECIPIENTS),
  };
}

/**
 * Tell every family on the roster that a new game or practice exists.
 *
 * Step 2 of the product brief's core loop — the coach adds a game, parents get
 * an email, parents RSVP — which until #45 simply did not happen.
 *
 * **Runs in `after()`, so nothing here is on the coach's clock.** That is what
 * lets the cap be generous enough for a real roster, and why this returns
 * nothing and reports through `sendReceipt` instead: by the time the first
 * message goes out the action has long since returned its state.
 *
 * Three rules hold it in place:
 *
 *   1. **It cannot fail the event.** The caller schedules this only after
 *      `createEvent` has returned, and nothing here throws — a deferred
 *      rejection would be an unhandled error in a background task nobody is
 *      watching, which is strictly worse than a swallowed one that reports
 *      itself by email.
 *   2. **Recipients come from the roster, never `Membership`.** A coach with no
 *      kid on the team does not need mailing about an event they just created,
 *      and the roster is what says which families are on this team this season
 *      (Decision 15).
 *   3. **Push rides along; it never gates.** Sent after a successful email,
 *      inside its own catch. Decision 8: email is the channel of record.
 *
 * `List-Unsubscribe` is set, unlike the invitation and the one-to-one messages:
 * one body fanned out to every family on the team is list mail by RFC 2369's
 * test, the same test the all-parents broadcast passes. Unlike the reminder
 * cron there is a real human sender to name — the coach who just created the
 * event — so no `pickUnsubscribeContact` equivalent is needed, and `Reply-To`
 * points at the same person so "we're away that weekend" reaches someone.
 */
async function announceEvent(work: AnnouncementWork): Promise<void> {
  const { teamId, teamName, event, coachEmail, recipients, skipped } = work;

  const { subject, headline, dateTimeLabel, eventUrl: link } =
    buildEventAnnouncementEmail({
      teamName,
      teamId,
      eventId: event.id,
      type: event.type,
      startsAt: event.startsAt,
      opponent: event.opponent,
      env: emailEnv(),
    });

  let sent = 0;
  let failed = 0;
  let lastSendAt = 0;

  for (const recipient of recipients) {
    // Wait out only the remainder of the interval — a slow send has already
    // paid for itself.
    const waitMs = lastSendAt + MIN_SEND_INTERVAL_MS - Date.now();
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    lastSendAt = Date.now();

    let outcome;
    try {
      outcome = await sendEmail({
        to: recipient.email,
        subject,
        ...(coachEmail
          ? { replyTo: coachEmail, listUnsubscribe: coachEmail }
          : {}),
        react: EventAnnouncementEmail({
          teamName,
          headline,
          dateTimeLabel,
          location: event.location,
          notes: event.notes,
          eventUrl: link,
        }),
      });
    } catch (error) {
      // sendEmail returns rather than throws, but this loop has no caller left
      // to catch for it — one unexpected throw would abandon every family after
      // this one with no receipt to say so.
      const detail = error instanceof Error ? error.message : "Unknown error";
      console.error(`Announcement send threw for event ${event.id}:`, detail);
      failed += 1;
      continue;
    }

    // One bad mailbox must not lose the rest of the announcement — count and
    // continue, like every other send loop in the app.
    if (!outcome.ok) {
      failed += 1;
      continue;
    }
    sent += 1;

    // After the email, never instead of it, and never able to undo it.
    // sendPushToUser swallows its own failures; this catch is belt and braces
    // so a push bug cannot turn a delivered announcement into a reported
    // failure.
    try {
      await sendPushToUser(recipient.userId, {
        title: subject,
        body: event.location
          ? `${dateTimeLabel} at ${event.location}`
          : dateTimeLabel,
        url: link,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      console.error(`Push failed for user ${recipient.userId}:`, detail);
    }
  }

  await sendReceipt({
    teamId,
    teamName,
    coachEmail,
    headline,
    dateTimeLabel,
    sent,
    failed,
    skipped,
  });
}

/**
 * Tell the coach how their announcement went.
 *
 * The whole reason this exists: the fan-out no longer blocks, so the returned
 * state cannot carry the result. A send nobody hears the outcome of is worse
 * than a slow one — three families silently not told about Saturday's game is
 * exactly the failure this feature was built to prevent, and it would be
 * invisible.
 *
 * Sent on success as well as failure. A clean run is one line the coach deletes
 * unread; the alternative — silence meaning success — makes every quiet evening
 * ambiguous, since a coach cannot tell "it worked" from "the receipt itself
 * bounced".
 *
 * Best-effort and last: if this send fails there is nobody left to tell, so it
 * is logged and dropped. A team with no resolvable coach address gets no
 * receipt rather than a send to nowhere.
 */
async function sendReceipt(input: {
  teamId: string;
  teamName: string;
  coachEmail: string | null;
  headline: string;
  dateTimeLabel: string;
  sent: number;
  failed: number;
  skipped: number;
}): Promise<void> {
  if (!input.coachEmail) {
    return;
  }

  const { subject, summary, needsAttention, scheduleUrl: link } =
    buildAnnouncementReceiptEmail({
      teamName: input.teamName,
      teamId: input.teamId,
      headline: input.headline,
      dateTimeLabel: input.dateTimeLabel,
      sent: input.sent,
      failed: input.failed,
      skipped: input.skipped,
      env: emailEnv(),
    });

  try {
    // No List-Unsubscribe: this is one person being answered about their own
    // action, not a list they belong to.
    const outcome = await sendEmail({
      to: input.coachEmail,
      subject,
      react: AnnouncementReceiptEmail({ summary, needsAttention, scheduleUrl: link }),
    });
    if (!outcome.ok) {
      console.error(`Announcement receipt failed to send: ${outcome.reason}`);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Announcement receipt threw:", detail);
  }
}

/**
 * Add one event to the schedule.
 *
 * This is the action the Aug 2026 audit costed at ~60 interactions a season
 * (C1), and every part of that cost was in what happened *after* a successful
 * submit rather than in the submit itself: the redirect reloaded the page,
 * reset all five fields — including type and location, which barely change
 * from game to game — dropped the `view`/`month` params, and scrolled the
 * coach back to the top, away from the form they were about to use again.
 *
 * So it no longer redirects on success. `revalidatePath` refreshes the list in
 * place and the action returns, which leaves the page where it was, the view
 * where it was, and the form filled in with everything worth keeping for the
 * next event. Only the date and the notes clear (see `stickyValues` — a stale
 * start time is the one field it would be dangerous to keep).
 *
 * A validation failure returns too, with what was typed, so a mistyped time
 * costs a correction rather than the whole form.
 *
 * Losing access still redirects, and now lands on the schedule the coach was
 * actually looking at.
 */
export async function createEventAction(
  _prevState: AddEventState,
  formData: FormData,
): Promise<AddEventState> {
  const teamId = extractTeamId(formData);
  const context = scheduleContextFromForm(formData, new Date());

  const values: EventFormValues = {
    type: String(formData.get("type") ?? ""),
    startsAt: String(formData.get("startsAt") ?? ""),
    location: String(formData.get("location") ?? ""),
    opponent: String(formData.get("opponent") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };

  const parsed = parseEventForm(formData);
  if ("errorCode" in parsed) {
    return {
      status: "invalid",
      code: parsed.errorCode,
      field: eventErrorField(parsed.errorCode),
      values,
    };
  }

  let event: ScheduleEvent;
  let coachEmail: string | null = null;

  try {
    const { userId } = await requireTeamAccess(teamId, {
      intent: "write",
      minRole: "COACH",
    });
    event = await createEvent(teamId, parsed.input);

    // Read after the write, so a membership lookup failing costs the
    // announcement its Reply-To and the coach their receipt, never the event.
    const members = await listTeamMembers(teamId);
    coachEmail = members.find((member) => member.userId === userId)?.email ?? null;
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(scheduleUrl(teamId, context, { error: "access" }));
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/schedule", "page");

  return {
    status: "added",
    keep: stickyValues(values),
    // Named, not counted: after three quick adds the coach needs to know
    // *which* one just landed, and the date is the only thing distinguishing
    // them. Formatted through calendar.ts so it reads in the team's zone.
    summary: `${parsed.input.type === "GAME" ? "Game" : "Practice"} on ${formatEventDateTime(parsed.input.startsAt)}`,
    announcement: await scheduleAnnouncement(teamId, event, coachEmail),
  };
}

/**
 * Line up the parent announcement and hand it to `after()`.
 *
 * Called once the event exists and never before, so nothing here can undo it:
 * every failure below becomes a value in the returned state, and the event
 * stands either way.
 *
 * The one thing worth reading twice is where the boundary sits. Resolving the
 * audience is synchronous — the coach waits for a single indexed query — while
 * the twenty-five paced sends are not. That split is what lets the form say
 * "Emailing 24 parents now" truthfully and still return immediately, and it is
 * why an unreadable roster is reportable on screen while a bounced mailbox is
 * only reportable by email.
 */
async function scheduleAnnouncement(
  teamId: string,
  event: ScheduleEvent,
  coachEmail: string | null,
): Promise<AddEventAnnouncement> {
  // A coach back-filling last Saturday's game should not mail the team.
  if (!shouldAnnounceEvent(event.startsAt, new Date())) {
    return { status: "none" };
  }

  let work: AnnouncementWork | null;
  try {
    work = await resolveAnnouncementWork(teamId, event, coachEmail);
  } catch (error) {
    unstable_rethrow(error);
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Could not resolve announcement recipients:", detail);
    return { status: "failed" };
  }

  if (!work) {
    return { status: "none" };
  }

  // `after` runs this once the response is finished — including, per Next's
  // docs, when the response was a redirect. Scheduling it cannot throw; the
  // callback is written so that running it cannot either.
  after(() => announceEvent(work));

  return { status: "sending", recipients: work.recipients.length };
}

export async function updateEventAction(formData: FormData) {
  const teamId = extractTeamId(formData);
  const eventId = extractEventId(formData);
  // Which schedule the coach came from, so saving an event doesn't quietly
  // move them from their list back to this month's grid.
  const context = scheduleContextFromForm(formData, new Date());

  const parsed = parseEventForm(formData);
  if ("errorCode" in parsed) {
    redirect(eventUrl(teamId, eventId, context, { error: parsed.errorCode }));
  }

  try {
    await requireEvent(teamId, eventId, context);
    await updateEvent(teamId, eventId, parsed.input);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(eventUrl(teamId, eventId, context, { error: "access" }));
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/schedule", "page");
  revalidatePath("/t/[teamId]/schedule/[eventId]", "page");
  redirect(eventUrl(teamId, eventId, context, { saved: "1" }));
}

/// Irreversible: `Rsvp.event` cascades, so the event's RSVPs go with it. The
/// detail page confirms before rendering the form that posts here.
export async function deleteEventAction(formData: FormData) {
  const teamId = extractTeamId(formData);
  const eventId = extractEventId(formData);
  const context = scheduleContextFromForm(formData, new Date());

  try {
    await requireEvent(teamId, eventId, context);
    await deleteEvent(teamId, eventId);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(eventUrl(teamId, eventId, context, { error: "access" }));
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/schedule", "page");
  // The event is gone, so there is no event page to return to — but there is
  // still the schedule the coach was reading, and that is where they were.
  redirect(scheduleUrl(teamId, context));
}

/// `clear` (#54) deletes the row, returning the player to "no response" —
/// surfaced only in the staff controls, but accepted from either write path:
/// a guardian clearing their own kid is harmless, and refusing it would be
/// exactly the special casing AC3 forbids.
const rsvpResponseSchema = z.enum(["attending", "declined", "clear"]);

/**
 * Where to send the parent back to once the RSVP is in.
 *
 * An **enum, never a URL**. Both surfaces that RSVP — the event page and team
 * home (#48) — post to this one action, and the only thing they disagree about
 * is where the parent was standing. A `returnTo` URL field would say the same
 * thing while handing anyone who can craft a form an open redirect out of a
 * signed-in POST; an enum cannot express a destination this file did not
 * already write down.
 *
 * Absent or unrecognised means the event page, which is what every form posted
 * before team home existed.
 */
const rsvpOriginSchema = z.enum(["home"]);
type RsvpOrigin = "home" | "event";

function parseRsvpOrigin(formData: FormData): RsvpOrigin {
  return rsvpOriginSchema.safeParse(formData.get("from")).success ? "home" : "event";
}

/// The page the parent is standing on, with `query` appended. Only the
/// redirect target varies by origin — every authorization check below is
/// identical either way.
function rsvpReturnUrl(
  origin: RsvpOrigin,
  teamId: string,
  eventId: string,
  query: string,
  context: ScheduleContext | null,
): string {
  if (origin === "home") {
    return `/t/${teamId}${query}`;
  }
  // Back to the event page — and, when the coach opened it from a particular
  // schedule, back to an event page that still remembers which. Without this
  // the very next RSVP silently drops the context every other action on this
  // page now carries, and the "← Schedule" link reverts to the month grid.
  if (!context) {
    return `/t/${teamId}/schedule/${eventId}${query}`;
  }
  const params = new URLSearchParams(scheduleQuery(context));
  for (const [key, value] of new URLSearchParams(query.replace(/^\?/, ""))) {
    params.set(key, value);
  }
  return `/t/${teamId}/schedule/${eventId}?${params.toString()}`;
}

/**
 * Prove the caller may write to this team, that the event they named is on
 * it, AND that they may answer for the player they are RSVPing for — either
 * as the player's family or, since #54, as team staff recording a texted
 * "Mason's out" on the family's behalf.
 *
 * `requireTeamAccess` alone only proves team membership — any PARENT can
 * write. It cannot prove which family the named player belongs to, because a
 * server action POSTs to the current page URL; only this check, run after
 * resolving the caller's identity, can. `guardedRosteredPlayerIds` also
 * folds in roster membership on this team, not just `GuardianPlayer` alone,
 * because that link is global (Decision 15) — guardianship by itself would
 * let a parent RSVP a kid who only plays on another team onto this one's
 * event.
 *
 * Two write paths, tried in order; the returned `recordedById` is what
 * `upsertRsvp` stamps on the row:
 *
 *   1. Guardian — the caller guards this player. Records as the family
 *      (`recordedById: null`), and is checked FIRST so a coach RSVPing their
 *      own kid records as a parent, not as staff.
 *   2. Staff — COACH+ answering for any player rostered on this team
 *      (`recordedById: userId`). Skips guardianship but never the scoping:
 *      `isPlayerRostered` mirrors the guardian path's roster intersection,
 *      because role alone must not let a crafted form RSVP another team's
 *      kid onto this event.
 *
 * Neither path bypasses anything above it — archived teams die in
 * `requireTeamAccess`, and a cross-team event dies in `getEvent`, before any
 * per-player question is asked.
 */
async function requireRsvpWriter(
  teamId: string,
  eventId: string,
  playerId: string,
  origin: RsvpOrigin,
  context: ScheduleContext | null,
) {
  const { role, userId } = await requireTeamAccess(teamId, { intent: "write" });

  const event = await getEvent(teamId, eventId);
  if (!event) {
    // The event was deleted between render and tap. From the event page that
    // bounces to the schedule, where its absence is the explanation. From team
    // home there is no such page to land on, so say it instead of returning a
    // silently unchanged dashboard the parent will tap again.
    redirect(
      origin === "home"
        ? `/t/${teamId}?error=event-gone`
        : context
          ? scheduleUrl(teamId, context)
          : `/t/${teamId}/schedule`,
    );
  }

  let recordedById: string | null = null;
  const guardedPlayerIds = await guardedRosteredPlayerIds(teamId, userId);
  if (!guardedPlayerIds.has(playerId)) {
    if (role === "PARENT") {
      redirect(rsvpReturnUrl(origin, teamId, eventId, "?error=not-your-player", context));
    }
    if (!(await isPlayerRostered(teamId, playerId))) {
      // Only reachable from a crafted form — the page renders rows from the
      // roster — so the copy is for the coach who somehow got here, not a flow.
      redirect(rsvpReturnUrl(origin, teamId, eventId, "?error=not-on-team", context));
    }
    recordedById = userId;
  }

  // Team home hides its buttons once an event has started, and that gate has to
  // hold here too: a parent who left the dashboard open through first pitch can
  // still post the form it rendered. Render-time gating is a convention, not a
  // rule — the same argument AGENTS.md makes about Proxy, that only the action
  // knows what is being written.
  //
  // Deliberately scoped to `from=home`, and this is a disambiguation rule
  // rather than an authorization one. The event page has always allowed a late
  // answer on purpose: a parent realising at 9:15 that they cannot make the
  // 9:00 game is telling the coach something useful, and readiness still shows
  // that game. What makes it wrong from home is that the event there is
  // *page-selected* — on a doubleheader morning the parent tapping "Not going"
  // may well mean the noon game. Nothing is protected by refusing an
  // origin-less POST, because that is exactly what the event page sends.
  if (origin === "home" && event.startsAt.getTime() <= Date.now()) {
    redirect(`/t/${teamId}?error=event-started`);
  }

  return { event, recordedById };
}

/// RSVP is reporting, never a gate — open to every role (PARENT+), unlike
/// the COACH+ mutations above. Archived teams still reject the write, same
/// as every other mutation on this team.
///
/// Posted from two places: the event page's attendance list (families and,
/// since #54, staff answering for any rostered player) and team home's
/// one-tap buttons (#48). `from` decides only where the parent lands — the
/// checks in `requireRsvpWriter` run identically for both.
export async function rsvpAction(formData: FormData) {
  const teamId = extractTeamId(formData);
  const eventId = extractEventId(formData);
  const playerId = extractPlayerId(formData);
  const origin = parseRsvpOrigin(formData);
  // Only meaningful for the event-page origin; team home has its own
  // destination. Optional, so a post that carried no context keeps the bare
  // URL it had rather than being handed a month grid it never asked for.
  // Re-parsed like every other context read — see schedule-context.ts on why
  // these are validated fields and never a URL.
  const context = optionalScheduleContextFromForm(formData, new Date());

  const parsedResponse = rsvpResponseSchema.safeParse(formData.get("response"));
  if (!parsedResponse.success) {
    redirect(rsvpReturnUrl(origin, teamId, eventId, "?error=invalid-rsvp", context));
  }

  try {
    // Write against the id `getEvent` resolved, not the raw form field — same
    // convention as the roster actions deriving playerId from getRosterEntry.
    const { event, recordedById } = await requireRsvpWriter(
      teamId,
      eventId,
      playerId,
      origin,
      context,
    );
    if (parsedResponse.data === "clear") {
      await clearRsvp(event.id, playerId);
    } else {
      await upsertRsvp(
        event.id,
        playerId,
        parsedResponse.data === "attending",
        recordedById,
      );
    }
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(rsvpReturnUrl(origin, teamId, eventId, "?error=access", context));
    }
    throw error;
  }

  // Both pages regardless of origin: one RSVP changes the attendance list on
  // the event page *and* the state shown beside the kid's name on team home,
  // so revalidating only the page that was posted from leaves the other stale.
  revalidatePath("/t/[teamId]/schedule/[eventId]", "page");
  revalidatePath("/t/[teamId]", "page");
  redirect(rsvpReturnUrl(origin, teamId, eventId, "?saved=1", context));
}
