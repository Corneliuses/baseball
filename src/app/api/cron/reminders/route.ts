import { sendEmail } from "@/lib/email";
import { sendPushToUser } from "@/lib/push";
import {
  claimReminder,
  loadTodaysReminderWork,
  releaseReminder,
} from "@/lib/reminder-data";
import { buildReminderBatch } from "@/lib/reminders";
import { buildEventReminderEmail } from "@/emails/event-reminder-email";
import { EventReminderEmail } from "@/emails/EventReminderEmail";

/// Day-of reminders (#47). A Vercel Cron target, which is why this is a Route
/// Handler rather than a Server Action — cron issues a real HTTP GET with no
/// session and no form, the same "needs a real endpoint" case as the
/// magic-link callback and the ICS feed.
///
/// Schedule lives in `vercel.json`. It fires at a fixed UTC hour, so the local
/// hour drifts by one across DST — 7 AM Central in season, 6 AM in winter.
/// That is accepted, and nothing here depends on it: "today" is computed from
/// the clock at request time in APP_TIMEZONE by `loadTodaysReminderWork`, so
/// the job is correct whenever it runs and a manual re-invocation at noon
/// behaves sensibly.
///
/// ## The send loop
///
/// This is the third place in the app that sends in a loop, after the bulk
/// invite and the message fan-out, and it follows their shape: pace the sends,
/// isolate each recipient's failure, count outcomes, never let one bad mailbox
/// lose the rest of the batch.
///
/// What is different here is the claim. Each (event, guardian) pair is taken
/// in the receipts ledger *before* its email goes out and given back if the
/// send fails, which is what makes a cron re-run safe (AC 4) — see
/// `claimReminder` for why the race belongs at the database.
///
/// ## Push rides along, it does not gate
///
/// A guardian with a registered subscription also gets a push, sent *after*
/// the email and only when the email succeeded. Push failure never releases
/// the claim, never fails the run, and never affects the email — Decision 8's
/// mitigation is that email is the channel of record and push is an
/// enhancement, and this loop is where that has to be true in code. Most
/// guardians have no subscription at all, which `sendPushToUser` treats as the
/// ordinary case it is.

/// Vercel's own convention: the platform sends this as a bearer token on every
/// cron invocation. Compared in the handler, and an unset variable fails
/// closed — an unconfigured deploy has no reminder route, rather than an open
/// one that anyone can use to mail every family on demand.
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET is not set — refusing to run reminders");
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/// Resend's API is rate limited (2 requests/second by default). Same value and
/// same remainder-only wait as `bulkInviteGuardiansAction` and
/// `sendTeamMessageAction` — a slow send has already paid for itself.
const MIN_SEND_INTERVAL_MS = 600;

/// Ceiling on one run's sends. Coupled to `maxDuration` below exactly as
/// MAX_ROWS is coupled to the invite page's (see AGENTS.md): at 600ms of
/// pacing apiece this is 120s of waiting before per-send latency, against a
/// 300s ceiling. Raising either means revisiting both. A real day for one
/// operator is a handful of events and ~25 households; 200 is a runaway guard,
/// not a product limit, and anything it drops is logged rather than silently
/// skipped.
///
/// It bounds **send attempts, never candidates examined**, and the difference
/// is the whole reason the loop is written the way it is below.
const MAX_SENDS_PER_RUN = 200;

/// Long enough for a full day's fan-out at the pacing above. The route's own
/// export, since this is the level that governs a Route Handler's timeout.
export const maxDuration = 300;

/// The reminder is about *today*, so the answer must never come from a cache.
export const dynamic = "force-dynamic";

type RunSummary = {
  events: number;
  candidates: number;
  sent: number;
  skipped: number;
  failed: number;
  capped: number;
  /// Devices reached, not people — a guardian with a phone and a tablet counts
  /// twice, and most guardians count zero.
  pushed: number;
  /// The day held more events than the loader will read in one run, so
  /// `events` is not the whole day. Never true in normal operation; when it is,
  /// the summary must not read as a clean sweep.
  truncated: boolean;
};

/// The notification body. The subject already carries the team and the event,
/// so this is the detail a lock screen has room for.
function pushBody(timeLabel: string, location: string | null): string {
  return location ? `${timeLabel} at ${location}` : timeLabel;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const { events, truncated } = await loadTodaysReminderWork(now);
  const payloads = buildReminderBatch(events);

  const summary: RunSummary = {
    events: events.length,
    candidates: payloads.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    capped: 0,
    pushed: 0,
    truncated,
  };

  const env = {
    AUTH_URL: process.env.AUTH_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    VERCEL_URL: process.env.VERCEL_URL,
  };

  let lastSendAt = 0;

  // Every payload, not the first MAX_SENDS_PER_RUN of them — the budget is
  // spent by sending, and a pair that turns out to be already-sent costs one
  // insert and no email at all.
  //
  // Slicing the candidate list instead was a silent non-delivery bug. The
  // batch builder is deterministic (events by `startsAt`, guardians in roster
  // order), so every run of the day walks the same sequence: run one sends the
  // first window and writes its receipts, and run two would then find that
  // whole window already-sent, spend its entire cap skipping, and stop — never
  // reaching the tail. No run that day would ever get there, and the summary
  // would report a wall of `skipped` as though the work were done.
  //
  // Capping on work actually performed is what makes progress monotonic: each
  // run skips the settled prefix cheaply and picks up where the last one ran
  // out of budget.
  let processed = 0;

  for (const payload of payloads) {
    if (summary.sent + summary.failed >= MAX_SENDS_PER_RUN) {
      break;
    }
    processed += 1;

    // Whether *this* iteration is the one holding the receipt. The catch below
    // must never release a claim it did not take: if `claimReminder` itself
    // throws on a transient database error (a pool timeout, a dropped
    // connection) while a concurrent run holds the row and has already mailed
    // against it, an unconditional release would delete that run's receipt and
    // the next run would re-mail the family — the exact duplicate the ledger
    // exists to prevent.
    let claimed = false;

    try {
      const claim = await claimReminder(payload.eventId, payload.userId);
      if (claim === "already-sent") {
        summary.skipped += 1;
        continue;
      }
      claimed = true;

      // Wait out only the remainder of the interval.
      const waitMs = lastSendAt + MIN_SEND_INTERVAL_MS - Date.now();
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      lastSendAt = Date.now();

      const { subject, headline, timeLabel, eventUrl } =
        buildEventReminderEmail({
          teamName: payload.teamName,
          teamId: payload.teamId,
          eventId: payload.eventId,
          type: payload.type,
          startsAt: payload.startsAt,
          opponent: payload.opponent,
          env,
        });

      const outcome = await sendEmail({
        to: payload.email,
        subject,
        // Reminders are the app's only recurring, every-family mail, which is
        // exactly what List-Unsubscribe describes. There is no human sender to
        // point at — the cron runs as the system — so the address is the
        // team's staff contact, chosen by `pickUnsubscribeContact`. A team
        // with no staff address sends none rather than one mailing nowhere.
        ...(payload.unsubscribeEmail
          ? { listUnsubscribe: payload.unsubscribeEmail }
          : {}),
        react: EventReminderEmail({
          teamName: payload.teamName,
          headline,
          timeLabel,
          location: payload.location,
          notes: payload.notes,
          kids: payload.kids,
          eventUrl,
        }),
      });

      if (outcome.ok) {
        summary.sent += 1;

        // After the email, never instead of it, and never able to undo it.
        // sendPushToUser swallows its own failures; the catch is belt and
        // braces so a push bug cannot cost a claimed, delivered reminder.
        try {
          const push = await sendPushToUser(payload.userId, {
            title: subject,
            body: pushBody(timeLabel, payload.location),
            url: eventUrl,
          });
          summary.pushed += push.delivered;
        } catch (pushError) {
          const detail =
            pushError instanceof Error ? pushError.message : "Unknown error";
          console.error(`Push failed for user ${payload.userId}:`, detail);
        }
      } else {
        // Give the slot back so the next run retries this one rather than
        // treating a Resend failure as delivered.
        await releaseReminder(payload.eventId, payload.userId);
        summary.failed += 1;
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `Reminder failed for event ${payload.eventId}, user ${payload.userId}:`,
        detail,
      );
      if (claimed) {
        await releaseReminder(payload.eventId, payload.userId);
      }
      summary.failed += 1;
    }
  }

  summary.capped = payloads.length - processed;
  if (summary.capped > 0) {
    console.error(
      `Reminder run hit its ${MAX_SENDS_PER_RUN}-send cap — ${summary.capped} pairs not attempted, and the next run will resume at them`,
    );
  }

  return Response.json(summary);
}
