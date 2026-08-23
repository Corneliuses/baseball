"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
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
} from "@/lib/schedule";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";

import {
  stickyValues,
  type AddEventState,
  type EventFormValues,
} from "./event-form-state";
import {
  eventUrl,
  scheduleContextFromForm,
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
    return { status: "invalid", code: parsed.errorCode, values };
  }

  try {
    await requireTeamAccess(teamId, { intent: "write", minRole: "COACH" });
    await createEvent(teamId, parsed.input);
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
  };
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
): string {
  return origin === "home"
    ? `/t/${teamId}${query}`
    : `/t/${teamId}/schedule/${eventId}${query}`;
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
) {
  const { role, userId } = await requireTeamAccess(teamId, { intent: "write" });

  const event = await getEvent(teamId, eventId);
  if (!event) {
    // The event was deleted between render and tap. From the event page that
    // bounces to the schedule, where its absence is the explanation. From team
    // home there is no such page to land on, so say it instead of returning a
    // silently unchanged dashboard the parent will tap again.
    redirect(
      origin === "home" ? `/t/${teamId}?error=event-gone` : `/t/${teamId}/schedule`,
    );
  }

  let recordedById: string | null = null;
  const guardedPlayerIds = await guardedRosteredPlayerIds(teamId, userId);
  if (!guardedPlayerIds.has(playerId)) {
    if (role === "PARENT") {
      redirect(rsvpReturnUrl(origin, teamId, eventId, "?error=not-your-player"));
    }
    if (!(await isPlayerRostered(teamId, playerId))) {
      // Only reachable from a crafted form — the page renders rows from the
      // roster — so the copy is for the coach who somehow got here, not a flow.
      redirect(rsvpReturnUrl(origin, teamId, eventId, "?error=not-on-team"));
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

  const parsedResponse = rsvpResponseSchema.safeParse(formData.get("response"));
  if (!parsedResponse.success) {
    redirect(rsvpReturnUrl(origin, teamId, eventId, "?error=invalid-rsvp"));
  }

  try {
    // Write against the id `getEvent` resolved, not the raw form field — same
    // convention as the roster actions deriving playerId from getRosterEntry.
    const { event, recordedById } = await requireRsvpWriter(
      teamId,
      eventId,
      playerId,
      origin,
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
      redirect(rsvpReturnUrl(origin, teamId, eventId, "?error=access"));
    }
    throw error;
  }

  // Both pages regardless of origin: one RSVP changes the attendance list on
  // the event page *and* the state shown beside the kid's name on team home,
  // so revalidating only the page that was posted from leaves the other stale.
  revalidatePath("/t/[teamId]/schedule/[eventId]", "page");
  revalidatePath("/t/[teamId]", "page");
  redirect(rsvpReturnUrl(origin, teamId, eventId, "?saved=1"));
}
