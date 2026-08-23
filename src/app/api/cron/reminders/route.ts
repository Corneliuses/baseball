import { sendEmail } from "@/lib/email";
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
};

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const events = await loadTodaysReminderWork(now);
  const payloads = buildReminderBatch(events);

  const summary: RunSummary = {
    events: events.length,
    candidates: payloads.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    capped: Math.max(0, payloads.length - MAX_SENDS_PER_RUN),
  };

  if (summary.capped > 0) {
    console.error(
      `Reminder run capped at ${MAX_SENDS_PER_RUN} sends — ${summary.capped} not attempted`,
    );
  }

  const env = {
    AUTH_URL: process.env.AUTH_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    VERCEL_URL: process.env.VERCEL_URL,
  };

  let lastSendAt = 0;

  for (const payload of payloads.slice(0, MAX_SENDS_PER_RUN)) {
    try {
      const claim = await claimReminder(payload.eventId, payload.userId);
      if (claim === "already-sent") {
        summary.skipped += 1;
        continue;
      }

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
      await releaseReminder(payload.eventId, payload.userId);
      summary.failed += 1;
    }
  }

  return Response.json(summary);
}
