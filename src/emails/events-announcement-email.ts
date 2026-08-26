import { absoluteUrl, type AbsoluteUrlEnv } from "@/lib/absolute-url";
import { formatEventDateShort, formatEventDateTime } from "@/lib/calendar";
import { opponentSuffix } from "./event-announcement-email";

/// Pure — the subject line, the schedule URL, and the human wording for the
/// "several new events are on the schedule" email that repeat-weekly creation
/// sends (#70). No Resend, no React Email, no database, mirroring the five
/// builders beside it.
///
/// **One email about N events, never N emails.** That is the whole reason this
/// module exists rather than the action looping over
/// `buildEventAnnouncementEmail`: a coach entering a twelve-game season in one
/// submit would otherwise put twelve messages in every family's inbox, which is
/// precisely how `buildAnnouncementRecipients`' own docstring says a family
/// learns that this app's email is noise.
///
/// Three shape decisions follow from that:
///
///   - **The link is the schedule, not an event.** The single-event
///     announcement points at the event page because "the announcement's one
///     action is answering" and that is where the RSVP buttons live. A batch
///     has no single event to answer, and the schedule is the page that shows
///     the whole run.
///   - **The subject carries a compact range; the body carries every date in
///     full.** A phone truncates a subject line, so it gets the count and the
///     span. The body is where a parent actually checks Saturdays against the
///     rest of their life, so nothing there is abbreviated.
///   - **The time is stated once.** Every occurrence in a batch shares a wall
///     clock by construction (`weeklyOccurrences` holds it fixed), so repeating
///     "at 5:30 PM" on twelve lines is noise — but the full per-date labels
///     still carry it, because a forwarded or half-read email must not depend
///     on a sentence further up.
///
/// Times go through `formatEventDateTime` / `formatEventDateShort`, never
/// `toLocaleString` or bare date-fns. An email is composed on a server running
/// TZ=UTC, which is exactly where this app's recurring wrong-by-five-hours bug
/// lives — a 7:30 PM Central game is already tomorrow in UTC, and a parent told
/// the wrong day misses it.

export type BuildEventsAnnouncementEmailInput = {
  teamName: string;
  teamId: string;
  type: "GAME" | "PRACTICE";
  /// Every occurrence being announced, soonest first. Already filtered by
  /// `announceableOccurrences`, so a back-filled season's played games are not
  /// in here. Must not be empty — the caller has nothing to send if it is.
  startsAts: readonly Date[];
  opponent: string | null;
  env: AbsoluteUrlEnv;
};

export type EventsAnnouncementEmailContent = {
  subject: string;
  /// "8 games vs Hawks" / "8 practices" — the heading inside the email, the
  /// middle of the subject line, and what the coach's receipt calls this batch.
  /// Built once so all three cannot disagree.
  headline: string;
  /// "Sat, Apr 4 – Sat, May 23", in APP_TIMEZONE. The span for the subject and
  /// for the receipt, which has room for one label and not twelve.
  dateRangeLabel: string;
  /// Each occurrence as "Sat, Apr 4, 2026 at 5:30 PM", in order.
  dateTimeLabels: string[];
  scheduleUrl: string;
};

export function buildEventsAnnouncementEmail({
  teamName,
  teamId,
  type,
  startsAts,
  opponent,
  env,
}: BuildEventsAnnouncementEmailInput): EventsAnnouncementEmailContent {
  const headline = buildBatchHeadline(type, opponent, startsAts.length);
  const dateRangeLabel = buildDateRangeLabel(startsAts);

  return {
    // The count leads, because that is what makes this worth opening — the
    // schedule did not gain an event, it gained a season. The single-event
    // version leads with "New game" for the same reason: the first two words
    // have to earn the tap in a crowded inbox.
    subject: `[${teamName}] ${headline}: ${dateRangeLabel}`,
    headline,
    dateRangeLabel,
    dateTimeLabels: startsAts.map(formatEventDateTime),
    scheduleUrl: absoluteUrl(`/t/${teamId}/schedule`, env),
  };
}

/**
 * "8 games vs Hawks" / "8 practices" / "1 game".
 *
 * Deliberately **not** `buildEventHeadline` with an `s` bolted on. That
 * function answers a different grammatical question — it names one event — and
 * reshaping its output ("Game vs Hawks" → "8 games vs Hawks") would mean string
 * surgery on another module's sentence, which breaks silently the moment it
 * learns to say "Scrimmage". The part actually worth sharing is the opponent
 * rule, and that is imported rather than copied.
 *
 * Singular is handled even though the batch path only runs at two or more: a
 * count-dependent noun that is wrong at 1 is the kind of thing that surfaces
 * later, from a caller this module never anticipated.
 */
function buildBatchHeadline(
  type: "GAME" | "PRACTICE",
  opponent: string | null,
  count: number,
): string {
  const noun = type === "GAME" ? "game" : "practice";

  return `${count} ${count === 1 ? noun : `${noun}s`}${opponentSuffix(type, opponent)}`;
}

/// "Sat, Apr 4 – Sat, May 23", or a single date when the run is one long. An
/// en dash, not a hyphen: this is a range, and every mail client renders it.
function buildDateRangeLabel(startsAts: readonly Date[]): string {
  const first = startsAts[0];
  const last = startsAts[startsAts.length - 1];

  if (!first || !last) {
    // Unreachable from the action, which never announces an empty batch, but a
    // builder that returns "undefined – undefined" into a subject line is a
    // worse failure than one that returns nothing.
    return "";
  }

  const firstLabel = formatEventDateShort(first);
  const lastLabel = formatEventDateShort(last);

  return firstLabel === lastLabel ? firstLabel : `${firstLabel} – ${lastLabel}`;
}
