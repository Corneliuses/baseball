import { absoluteUrl, type AbsoluteUrlEnv } from "@/lib/absolute-url";
import { formatEventTime } from "@/lib/calendar";
import type { RsvpState } from "@/lib/rsvp";

/// Pure — the subject line, the event URL, and the human wording for a day-of
/// reminder (#47). No Resend, no React Email, no database, mirroring
/// buildTeamMessageEmail.
///
/// The team name is prefixed for the same reason it is there: a parent with
/// kids on two teams needs to tell at a glance which team is playing. The word
/// "Today" leads the rest of the subject because that is the entire point of
/// the message — it competes in a phone's notification shade against every
/// other email that morning.
///
/// Times are formatted through `formatEventTime`, never `toLocaleTimeString`
/// or bare date-fns: an email is composed on a server running TZ=UTC, which is
/// where the wrong-by-five-hours bug this app keeps guarding against lives.

export type BuildEventReminderEmailInput = {
  teamName: string;
  teamId: string;
  eventId: string;
  type: "GAME" | "PRACTICE";
  startsAt: Date;
  opponent: string | null;
  env: AbsoluteUrlEnv;
};

export type EventReminderEmailContent = {
  subject: string;
  /// "Game vs Hawks" / "Game" / "Practice" — the heading inside the email and
  /// the middle of the subject line, built once so the two cannot disagree.
  headline: string;
  timeLabel: string;
  eventUrl: string;
};

export function buildEventReminderEmail({
  teamName,
  teamId,
  eventId,
  type,
  startsAt,
  opponent,
  env,
}: BuildEventReminderEmailInput): EventReminderEmailContent {
  const headline = buildHeadline(type, opponent);
  const timeLabel = formatEventTime(startsAt);

  return {
    subject: `[${teamName}] Today: ${headline}, ${timeLabel}`,
    headline,
    timeLabel,
    // The event page, not the team page: the reminder's one action is
    // answering, and that is where the RSVP buttons are.
    eventUrl: absoluteUrl(`/t/${teamId}/schedule/${eventId}`, env),
  };
}

function buildHeadline(
  type: "GAME" | "PRACTICE",
  opponent: string | null,
): string {
  if (type === "PRACTICE") {
    return "Practice";
  }

  const trimmed = opponent?.trim();
  return trimmed ? `Game vs ${trimmed}` : "Game";
}

/// How each kid's current answer reads in the email. Deliberately phrased as
/// the family's own words rather than a status word — "You said Jimmy is
/// coming" is a fact they can correct, where "ATTENDING" is a label they have
/// to decode. No-response is the one that has to invite an answer, since
/// chasing it is what the whole feature is for.
export function rsvpReminderLabel(name: string, state: RsvpState): string {
  switch (state) {
    case "attending":
      return `${name} — you said yes`;
    case "declined":
      return `${name} — you said no`;
    case "no-response":
      return `${name} — no answer yet`;
  }
}
