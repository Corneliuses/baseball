import { absoluteUrl, type AbsoluteUrlEnv } from "@/lib/absolute-url";

/// Pure — the wording of the receipt a coach gets back after an event
/// announcement has finished sending (#45). No Resend, no React Email, no
/// database, mirroring the other four builders in this directory.
///
/// **This email exists because the send stopped blocking.** The announcement
/// fan-out runs in `after()`, so the coach is redirected before a single
/// message has gone out and the redirect can no longer carry the outcome. A
/// fan-out nobody ever hears the result of is worse than a slow one: the coach
/// would have no way of knowing that three families were never told about
/// Saturday's game. This is the channel that replaces the banner.
///
/// It reports rather than reassures. A run where everything went says so in one
/// line and can be deleted unread; a run with failures leads with the number
/// that needs acting on, because the only remedy is human — the coach texting
/// the family, or fixing the address on the roster.

export type BuildAnnouncementReceiptEmailInput = {
  teamName: string;
  teamId: string;
  /// "Game vs Hawks" / "Practice" — the same headline the announcement itself
  /// used, so the coach can tell which event this is about.
  headline: string;
  dateTimeLabel: string;
  sent: number;
  failed: number;
  /// Families past `MAX_RECIPIENTS` that were never attempted. Zero for any
  /// real roster; when it is not, it must not read as a clean run.
  skipped: number;
  env: AbsoluteUrlEnv;
};

export type AnnouncementReceiptEmailContent = {
  subject: string;
  /// The one-line summary, used as both the preview text and the body's lead.
  summary: string;
  /// True when something needs the coach's attention — drives the wording on
  /// both sides so the subject and the body cannot disagree about whether this
  /// run was clean.
  needsAttention: boolean;
  scheduleUrl: string;
};

export function buildAnnouncementReceiptEmail({
  teamName,
  teamId,
  headline,
  dateTimeLabel,
  sent,
  failed,
  skipped,
  env,
}: BuildAnnouncementReceiptEmailInput): AnnouncementReceiptEmailContent {
  const unreached = failed + skipped;
  const needsAttention = unreached > 0;

  return {
    subject: needsAttention
      ? `[${teamName}] ${unreached} ${people(unreached)} not told about ${headline}`
      : `[${teamName}] ${headline} announced to ${sent} ${people(sent)}`,
    summary: needsAttention
      ? `${headline} on ${dateTimeLabel} went to ${sent} ${people(sent)}, but ${unreached} could not be reached.`
      : `${headline} on ${dateTimeLabel} went to ${sent} ${people(sent)}.`,
    needsAttention,
    // The schedule, not the event: a coach acting on this is chasing families,
    // and the schedule is where the event and its RSVPs both hang off.
    scheduleUrl: absoluteUrl(`/t/${teamId}/schedule`, env),
  };
}

/// "1 parent" / "3 parents". Trivial, and here rather than inline because it is
/// used four times above and a mismatch reads as a bug in the count.
function people(count: number): string {
  return count === 1 ? "parent" : "parents";
}
