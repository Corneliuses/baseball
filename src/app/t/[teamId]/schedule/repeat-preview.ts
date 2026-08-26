/// What "Repeat weekly: 8" is about to do, in words, before the coach commits
/// to it (#70).
///
/// **Deliberately not in `src/lib/calendar.ts`, and deliberately not importing
/// from it.** This runs in the browser, inside `AddEventForm`, and that module
/// reads `process.env.APP_TIMEZONE` at import time and imports a generated
/// Prisma enum — neither of which belongs in a client bundle just to name eight
/// Saturdays.
///
/// It can avoid the zone entirely because of what it is asked. Naming the dates
/// a weekly run lands on is pure calendar arithmetic on the `YYYY-MM-DD` half
/// of the value: 4 April plus seven days is 11 April in every timezone on
/// earth. What *does* need the zone is converting each of those to an instant,
/// and that stays on the server in `weeklyOccurrences`, which is the only thing
/// that writes anything.
///
/// So the two can disagree about nothing that matters. If they ever could — if
/// this grew a time, or a "through <date> at <time>" — it would have to move
/// server-side rather than grow a copy of the zone rules.

import { MAX_REPEAT_WEEKS } from "@/lib/repeat-weekly";

/// The date half of a `datetime-local` value. The time is ignored: this names
/// days, and the form's own field already shows the time.
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * "Creates 8 events, weekly through Sat, May 23" — or null when there is
 * nothing to promise yet.
 *
 * Null for a repeat of 1 or blank as well as for a missing date, because at one
 * event there is no run to describe and the banner would be restating the field
 * above it. The form renders nothing in that case, which is also what it did
 * before this feature existed.
 *
 * `repeat` arrives as the raw string the number input holds, so this does its
 * own digits-only check rather than trusting `Number()` — the same reasoning as
 * `parseRepeat` in actions.ts, which is the one that actually guards the write.
 * This is a label; it refuses to guess rather than showing a count the server
 * will reject.
 */
export function repeatPreview(startsAt: string, repeat: string): string | null {
  const total = parseCount(repeat);
  // Above the cap it stays silent rather than promising thirty-one events the
  // submit is about to refuse — the typed `invalid-repeat` message names the
  // limit, and a preview contradicting it would be worse than none.
  if (total === null || total < 2 || total > MAX_REPEAT_WEEKS) {
    return null;
  }

  const last = lastOccurrence(startsAt, total);
  if (!last) {
    return null;
  }

  return `Creates ${total} events, weekly through ${last}.`;
}

function parseCount(repeat: string): number | null {
  const raw = repeat.trim();
  if (!/^\d{1,4}$/.test(raw)) {
    return null;
  }
  return Number(raw);
}

/// The last date of the run, formatted "Sat, May 23".
///
/// Built with `Date.UTC` and read back with the UTC getters — not a timezone
/// claim, a way of doing calendar arithmetic in a fixed frame so the browser's
/// own zone cannot shift a date by a day. The values that go in and come out
/// are plain calendar components; no instant this produces is ever stored.
function lastOccurrence(startsAt: string, total: number): string | null {
  const match = DATE_PATTERN.exec(startsAt.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const anchor = new Date(Date.UTC(year, month - 1, day));
  // Rejects a date the constructor rolled forward (30 February), matching what
  // `wallClockToInstant` refuses server-side — so the preview does not name a
  // date the submit is about to reject.
  //
  // **The year is checked for a different reason than the month and day**, and
  // dropping it is not a tidy-up: `Date.UTC` remaps years 0-99 to 1900-1999, so
  // a coach who types "26" into the year segment — which browsers commit as
  // `0026-04-04` — gets an anchor in 1926. Month and day survive that remapping
  // intact, so those two checks pass and the preview confidently names a
  // weekday computed a century out. The server rejects the same value
  // (`TZDate` inherits the identical mapping, and `wallClockToInstant`'s guard
  // catches it), so without this the preview promises events the submit then
  // refuses with `invalid-datetime`.
  if (
    anchor.getUTCFullYear() !== year ||
    anchor.getUTCMonth() !== month - 1 ||
    anchor.getUTCDate() !== day
  ) {
    return null;
  }

  const last = new Date(Date.UTC(year, month - 1, day + (total - 1) * 7));

  return `${WEEKDAYS[last.getUTCDay()]}, ${MONTHS[last.getUTCMonth()]} ${last.getUTCDate()}`;
}
