import type { EventType } from "@/generated/prisma/enums";

/// Pure RFC 5545 (iCalendar) rendering for the team feed — no database, no
/// request context, tested exhaustively next door. The thin data layer is
/// calendar-feed.ts; the endpoint is /api/calendar/[token].
///
/// Times: `Event.startsAt` is already a true UTC instant (wallClockToInstant
/// converted the coach's wall clock on write), so DTSTART/DTEND render it
/// directly in UTC form (`...Z`) and the subscriber's calendar app converts
/// to the viewer's zone. Deliberately no APP_TIMEZONE, no calendar.ts, no
/// VTIMEZONE block — a late-evening Central event correctly carries the next
/// day's UTC date, and the app puts it back on the right local evening.
///
/// Minors'-data posture (#57): the input types below are the whole payload.
/// Event data only — no roster, no names, no RSVP states.

export type IcsTeam = {
  name: string;
  season: string | null;
};

export type IcsEvent = {
  id: string;
  type: EventType;
  startsAt: Date;
  location: string | null;
  opponent: string | null;
  notes: string | null;
};

/// Events store a start and no end. These are display hints for the calendar
/// entry's extent, nothing more — nothing else in the app derives from them.
export const EVENT_DURATION_MS: Record<EventType, number> = {
  GAME: 2 * 60 * 60 * 1000,
  PRACTICE: 90 * 60 * 1000,
};

/// UID domain is a fixed string, never the deploy host: a UID that changed
/// when AUTH_URL moved would duplicate every event in subscribers' calendars.
const UID_DOMAIN = "youth-baseball-team-manager";

/// Both hints say the same thing in the two spellings calendar apps read:
/// re-fetch about twice a day. Apps poll on their own schedule regardless;
/// this only keeps an eager one from hammering the endpoint.
const REFRESH_HINT = "PT12H";

/**
 * Render one team's schedule as a VCALENDAR document.
 *
 * `now` feeds DTSTAMP — the Event model has no updatedAt, so the serve time
 * stands in, and calendar apps reconcile edits by UID and take the changed
 * properties. A team with no events renders a valid, empty calendar: a real
 * product state, distinct from the database being down (which the caller
 * lets throw — see calendar-feed.ts).
 */
export function buildTeamCalendar(
  team: IcsTeam,
  events: IcsEvent[],
  now: Date,
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Youth Baseball Team Manager//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName(team))}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${REFRESH_HINT}`,
    `X-PUBLISHED-TTL:${REFRESH_HINT}`,
  ];

  for (const event of events) {
    lines.push(...eventLines(event, now));
  }

  lines.push("END:VCALENDAR");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function calendarName(team: IcsTeam): string {
  return team.season ? `${team.name} ${team.season}` : team.name;
}

export function eventSummary(event: {
  type: EventType;
  opponent: string | null;
}): string {
  if (event.type === "GAME") {
    return event.opponent ? `Game vs ${event.opponent}` : "Game";
  }
  return "Practice";
}

function eventLines(event: IcsEvent, now: Date): string[] {
  const end = new Date(event.startsAt.getTime() + EVENT_DURATION_MS[event.type]);

  const lines = [
    "BEGIN:VEVENT",
    `UID:${event.id}@${UID_DOMAIN}`,
    `DTSTAMP:${formatUtc(now)}`,
    `DTSTART:${formatUtc(event.startsAt)}`,
    `DTEND:${formatUtc(end)}`,
    `SUMMARY:${escapeText(eventSummary(event))}`,
  ];

  if (event.location !== null && event.location !== "") {
    lines.push(`LOCATION:${escapeText(event.location)}`);
  }

  if (event.notes !== null && event.notes !== "") {
    lines.push(`DESCRIPTION:${escapeText(event.notes)}`);
  }

  lines.push("END:VEVENT");

  return lines;
}

/// UTC date-time form: `19980119T070000Z`. Truncates milliseconds — event
/// times are minute-granular anyway.
export function formatUtc(instant: Date): string {
  return instant.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * RFC 5545 §3.3.11 TEXT escaping. Backslash first, or it would re-escape the
 * escapes it just wrote. Coach-entered notes/location/opponent are untrusted
 * text inside a structured format — this is what keeps a comma in "Field 3,
 * Riverside Park" from being read as a property-value separator, and a
 * crafted note from injecting whole properties.
 */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * RFC 5545 §3.1 line folding: content lines longer than 75 octets are split
 * with CRLF + one space, and continuation lines fit in 75 octets including
 * that space. Octets, not characters — the limit must never split a
 * multi-byte UTF-8 character, so this walks characters and counts bytes.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();

  if (encoder.encode(line).length <= 75) {
    return line;
  }

  const folded: string[] = [];
  let current = "";
  let currentBytes = 0;
  // First line holds 75 octets; continuations hold 74 plus their leading space.
  let limit = 75;

  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    if (currentBytes + charBytes > limit) {
      folded.push(current);
      current = " ";
      currentBytes = 1;
      limit = 75;
    }
    current += char;
    currentBytes += charBytes;
  }
  folded.push(current);

  return folded.join("\r\n");
}
