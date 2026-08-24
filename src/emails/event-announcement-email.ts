import { absoluteUrl, type AbsoluteUrlEnv } from "@/lib/absolute-url";
import { formatEventDateTime } from "@/lib/calendar";
import { buildEventHeadline } from "./event-reminder-email";

/// Pure — the subject line, the event URL, and the human wording for the
/// "a new game is on the schedule" email (#45). No Resend, no React Email, no
/// database, mirroring buildEventReminderEmail next door.
///
/// **The full date, where the reminder carries only the time.** That is the one
/// substantive difference between the two messages and it is not a style
/// choice: the reminder has already said "Today", so the hour is all that is
/// left to say. An announcement can land three weeks out, and a parent reading
/// it on a phone needs the day before anything else — it is the thing they have
/// to check against the rest of their life.
///
/// The team name is prefixed for the same reason the reminder prefixes it: a
/// parent with kids on two teams has to tell at a glance which one is playing.
///
/// Times go through `formatEventDateTime`, never `toLocaleString` or bare
/// date-fns. An email is composed on a server running TZ=UTC, which is exactly
/// where this app's recurring wrong-by-five-hours bug lives — a 7:30 PM Central
/// game is already tomorrow in UTC, and a parent told the wrong day misses it.

export type BuildEventAnnouncementEmailInput = {
  teamName: string;
  teamId: string;
  eventId: string;
  type: "GAME" | "PRACTICE";
  startsAt: Date;
  opponent: string | null;
  env: AbsoluteUrlEnv;
};

export type EventAnnouncementEmailContent = {
  subject: string;
  /// "Game vs Hawks" / "Game" / "Practice" — the heading inside the email and
  /// the middle of the subject line, built once so the two cannot disagree.
  headline: string;
  /// "Sat, Aug 29, 2026 at 5:30 PM", in APP_TIMEZONE.
  dateTimeLabel: string;
  eventUrl: string;
};

export function buildEventAnnouncementEmail({
  teamName,
  teamId,
  eventId,
  type,
  startsAt,
  opponent,
  env,
}: BuildEventAnnouncementEmailInput): EventAnnouncementEmailContent {
  const headline = buildEventHeadline(type, opponent);
  const dateTimeLabel = formatEventDateTime(startsAt);

  return {
    // "New game" leads because that is what makes this worth opening — the
    // schedule changed. The reminder leads with "Today" for the same reason:
    // the first two words have to earn the tap in a crowded inbox.
    subject: `[${teamName}] New ${
      type === "GAME" ? "game" : "practice"
    }: ${dateTimeLabel}${opponentSuffix(type, opponent)}`,
    headline,
    dateTimeLabel,
    // The event page, not the schedule: the announcement's one action is
    // answering, and that is where the RSVP buttons are.
    eventUrl: absoluteUrl(`/t/${teamId}/schedule/${eventId}`, env),
  };
}

/// The opponent rides at the *end* of the subject, after the date, because a
/// phone truncates a subject line and the date is what a parent has to see.
/// Practices have no opponent even if the column somehow holds one.
function opponentSuffix(
  type: "GAME" | "PRACTICE",
  opponent: string | null,
): string {
  if (type === "PRACTICE") {
    return "";
  }

  const trimmed = opponent?.trim();
  return trimmed ? ` vs ${trimmed}` : "";
}
