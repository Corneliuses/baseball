"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { wallClockToInstant } from "@/lib/calendar";
import { guardedRosteredPlayerIds, upsertRsvp } from "@/lib/rsvps";
import {
  createEvent,
  deleteEvent,
  getEvent,
  updateEvent,
  type EventInput,
} from "@/lib/schedule";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";

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
async function requireEvent(teamId: string, eventId: string) {
  await requireTeamAccess(teamId, { intent: "write", minRole: "COACH" });

  const event = await getEvent(teamId, eventId);
  if (!event) {
    redirect(`/t/${teamId}/schedule`);
  }

  return event;
}

export async function createEventAction(formData: FormData) {
  const teamId = extractTeamId(formData);

  const parsed = parseEventForm(formData);
  if ("errorCode" in parsed) {
    redirect(`/t/${teamId}/schedule?error=${parsed.errorCode}`);
  }

  try {
    await requireTeamAccess(teamId, { intent: "write", minRole: "COACH" });
    await createEvent(teamId, parsed.input);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`/t/${teamId}/schedule?error=access`);
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/schedule", "page");
  redirect(`/t/${teamId}/schedule?added=1`);
}

export async function updateEventAction(formData: FormData) {
  const teamId = extractTeamId(formData);
  const eventId = extractEventId(formData);

  const parsed = parseEventForm(formData);
  if ("errorCode" in parsed) {
    redirect(`/t/${teamId}/schedule/${eventId}?error=${parsed.errorCode}`);
  }

  try {
    await requireEvent(teamId, eventId);
    await updateEvent(teamId, eventId, parsed.input);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`/t/${teamId}/schedule/${eventId}?error=access`);
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/schedule", "page");
  revalidatePath("/t/[teamId]/schedule/[eventId]", "page");
  redirect(`/t/${teamId}/schedule/${eventId}?saved=1`);
}

/// Irreversible: `Rsvp.event` cascades, so the event's RSVPs go with it. The
/// detail page confirms before rendering the form that posts here.
export async function deleteEventAction(formData: FormData) {
  const teamId = extractTeamId(formData);
  const eventId = extractEventId(formData);

  try {
    await requireEvent(teamId, eventId);
    await deleteEvent(teamId, eventId);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`/t/${teamId}/schedule/${eventId}?error=access`);
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/schedule", "page");
  redirect(`/t/${teamId}/schedule`);
}

const rsvpResponseSchema = z.enum(["attending", "declined"]);

/**
 * Prove the caller may write to this team, that the event they named is on
 * it, AND that they guard the player they are RSVPing for.
 *
 * `requireTeamAccess` alone only proves team membership — any PARENT can
 * write. It cannot prove which family the named player belongs to, because a
 * server action POSTs to the current page URL; only this check, run after
 * resolving the caller's identity, can. `guardedRosteredPlayerIds` also
 * folds in roster membership on this team, not just `GuardianPlayer` alone,
 * because that link is global (Decision 15) — guardianship by itself would
 * let a parent RSVP a kid who only plays on another team onto this one's
 * event.
 */
async function requireGuardedEvent(teamId: string, eventId: string, playerId: string) {
  const { userId } = await requireTeamAccess(teamId, { intent: "write" });

  const event = await getEvent(teamId, eventId);
  if (!event) {
    redirect(`/t/${teamId}/schedule`);
  }

  const guardedPlayerIds = await guardedRosteredPlayerIds(teamId, userId);
  if (!guardedPlayerIds.has(playerId)) {
    redirect(`/t/${teamId}/schedule/${eventId}?error=not-your-player`);
  }

  return event;
}

/// RSVP is reporting, never a gate — open to every role (PARENT+), unlike
/// the COACH+ mutations above. Archived teams still reject the write, same
/// as every other mutation on this team.
export async function rsvpAction(formData: FormData) {
  const teamId = extractTeamId(formData);
  const eventId = extractEventId(formData);
  const playerId = extractPlayerId(formData);

  const parsedResponse = rsvpResponseSchema.safeParse(formData.get("response"));
  if (!parsedResponse.success) {
    redirect(`/t/${teamId}/schedule/${eventId}?error=invalid-rsvp`);
  }

  try {
    await requireGuardedEvent(teamId, eventId, playerId);
    await upsertRsvp(eventId, playerId, parsedResponse.data === "attending");
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`/t/${teamId}/schedule/${eventId}?error=access`);
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/schedule/[eventId]", "page");
  redirect(`/t/${teamId}/schedule/${eventId}?saved=1`);
}
