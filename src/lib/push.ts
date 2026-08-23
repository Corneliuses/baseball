import webpush from "web-push";

import { db } from "./db";

/// Web Push fan-out (#47, Decision 8) — the enhancement layered on top of the
/// reminder email, never a replacement for it.
///
/// Three rules hold everywhere this module is used, and all three come
/// straight from Decision 8:
///
/// 1. **Push never gates email.** Every function here fails soft. An
///    unconfigured VAPID key pair, a guardian with no subscription, a dead
///    endpoint, a push service outage — all of them return quietly and the
///    caller's email has already gone.
/// 2. **Subscriptions expire and must be pruned.** A `404` or `410` from the
///    push service means the endpoint is gone for good; the row is deleted in
///    the same pass rather than retried forever.
/// 3. **iOS only delivers push to a Home-Screen install.** Nothing here can
///    detect that, which is exactly why email is the channel of record — see
///    the opt-in card for the half of this the parent can see.
///
/// VAPID details are read inside the send, not at module scope, mirroring
/// `src/lib/email.ts`: the build must not require secrets, and a missing key
/// should surface when something actually tries to send.

export type PushPayload = {
  title: string;
  body: string;
  /// Where `notificationclick` takes the reader — the event page, for a
  /// reminder. Same URL as the email's link.
  url: string;
};

type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

/// `null` when push is not configured, which is a normal state rather than an
/// error: the app shipped its email half first and runs indefinitely without
/// these set.
export function readVapidConfig(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    return null;
  }

  return { publicKey, privateKey, subject };
}

export type PushFanoutResult = {
  delivered: number;
  pruned: number;
  failed: number;
};

const NOTHING_SENT: PushFanoutResult = { delivered: 0, pruned: 0, failed: 0 };

/**
 * Push one payload to every device a user has registered.
 *
 * Returns counts rather than throwing, because every caller is in the middle
 * of something more important than the push — the reminder cron has already
 * mailed this person, and losing the rest of the batch over a dead endpoint
 * would be absurd.
 *
 * Devices are sent to in parallel: unlike email there is no rate limit worth
 * pacing for here (a person has one or two devices, and push services are
 * built for fan-out), and each send is independent.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<PushFanoutResult> {
  const vapid = readVapidConfig();
  if (!vapid) {
    return NOTHING_SENT;
  }

  let subscriptions;
  try {
    subscriptions = await db.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
  } catch (error) {
    logPushError(`Failed to load push subscriptions for user ${userId}`, error);
    return NOTHING_SENT;
  }

  if (subscriptions.length === 0) {
    return NOTHING_SENT;
  }

  try {
    // Throws synchronously — and outside any other try/catch — on a subject
    // that is not a mailto:/https: URL or a key pair it cannot parse. Those
    // are configuration mistakes made once at deploy time, so the whole point
    // is that they surface in the log and cost nothing: an escaping throw here
    // would break this module's never-throws contract and, through it, put a
    // misconfigured VAPID subject in the path of a delivered reminder.
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  } catch (error) {
    logPushError("Invalid VAPID configuration — push disabled", error);
    return NOTHING_SENT;
  }

  const body = JSON.stringify(payload);

  const outcomes = await Promise.all(
    subscriptions.map((subscription) =>
      sendOne(subscription, body).catch(() => "failed" as const),
    ),
  );

  const stale = subscriptions
    .filter((_, index) => outcomes[index] === "gone")
    .map((subscription) => subscription.id);

  if (stale.length > 0) {
    await pruneSubscriptions(stale);
  }

  return {
    delivered: outcomes.filter((outcome) => outcome === "delivered").length,
    pruned: stale.length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
  };
}

type SendOutcome = "delivered" | "gone" | "failed";

type StoredSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

async function sendOne(
  subscription: StoredSubscription,
  body: string,
): Promise<SendOutcome> {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      body,
    );
    return "delivered";
  } catch (error) {
    // 404 Not Found and 410 Gone both mean this endpoint is permanently dead —
    // the browser was uninstalled, storage was cleared, or the subscription
    // was replaced. Anything else (429, 500, a network blip) is transient and
    // the row stays.
    if (isGone(error)) {
      return "gone";
    }
    logPushError(`Push failed for endpoint ${subscription.endpoint}`, error);
    return "failed";
  }
}

async function pruneSubscriptions(ids: readonly string[]): Promise<void> {
  try {
    await db.pushSubscription.deleteMany({ where: { id: { in: [...ids] } } });
  } catch (error) {
    // The next send will try to prune them again — harmless.
    logPushError("Failed to prune expired push subscriptions", error);
  }
}

function isGone(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const status = (error as { statusCode?: unknown }).statusCode;
  return status === 404 || status === 410;
}

function logPushError(message: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : "Unknown error";
  console.error(`${message}:`, detail);
}
