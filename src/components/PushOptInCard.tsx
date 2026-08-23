"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/// The opt-in for day-of push reminders (#47), on `/profile` because that is
/// already the one page about the person rather than a team — push
/// subscriptions are per-person-per-browser and carry no `teamId`.
///
/// Push is asked for **from a button press, never on load**. Decision 8: the
/// permission prompt must come from a user gesture, and a declined prompt is
/// effectively permanent, so the ask needs a deliberate moment where the
/// person already knows what they are agreeing to.
///
/// Every state here degrades to "you will still get the email", because that
/// is true — the reminder cron mails everyone regardless, and this card is an
/// enhancement on top of it. Nothing about this card can stop an email.

/// The VAPID application server key travels as base64url and `subscribe()`
/// wants raw bytes. Exported for its own test, like `isIos` in InstallPrompt:
/// a wrong conversion here fails inside the browser's push machinery with a
/// famously unhelpful error.
/// Returns `Uint8Array<ArrayBuffer>`, not a bare `Uint8Array`: since TypeScript
/// 5.7 typed arrays are generic over their buffer, and the default
/// `ArrayBufferLike` includes `SharedArrayBuffer`, which `applicationServerKey`
/// does not accept. Allocating the buffer explicitly pins the narrower type.
export function urlBase64ToUint8Array(
  base64String: string,
): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);

  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

/// `unknown` until the effect has run — the server render and the first client
/// render must agree, and none of these globals exist on the server.
type PushState =
  | "unknown"
  | "unsupported"
  | "denied"
  | "subscribed"
  | "available"
  | "working";

export type PushOptInCardProps = {
  /// From the server component, which reads `VAPID_PUBLIC_KEY` at request
  /// time. Null means push is not configured on this deployment.
  vapidPublicKey: string | null;
};

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

export function PushOptInCard({ vapidPublicKey }: PushOptInCardProps) {
  const [state, setState] = useState<PushState>("unknown");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolveInitialState() {
      if (!isSupported() || !vapidPublicKey) {
        if (!cancelled) setState("unsupported");
        return;
      }

      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setState(existing ? "subscribed" : "available");
      } catch {
        // A service worker that never becomes ready is indistinguishable here
        // from an unsupported browser, and the honest answer to the reader is
        // the same: this device cannot do push right now.
        if (!cancelled) setState("unsupported");
      }
    }

    void resolveInitialState();
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  const enable = useCallback(async () => {
    if (!vapidPublicKey) return;

    setError(null);
    setState("working");

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "available");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        // Required by Chromium, and the honest setting anyway: every push this
        // app sends shows a notification.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const response = await fetch("/api/push/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!response.ok) {
        // Do not leave the browser subscribed to a server that has no record
        // of it — that is a device the fan-out can never reach and never prune.
        await subscription.unsubscribe().catch(() => {});
        throw new Error("registration failed");
      }

      setState("subscribed");
    } catch {
      setError("Turning on notifications didn't work. You'll still get emails.");
      setState("available");
    }
  }, [vapidPublicKey]);

  const disable = useCallback(async () => {
    setError(null);
    setState("working");

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await fetch("/api/push/subscription", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }

      setState("available");
    } catch {
      setError("Turning notifications off didn't work. Try again.");
      setState("subscribed");
    }
  }, []);

  if (state === "unknown") {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Game day notifications</CardTitle>
        <CardDescription>
          A reminder on your phone the morning of a game or practice. You always
          get the reminder email either way — this just makes it harder to miss.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {state === "unsupported" ? (
          <p className="text-sm text-muted-foreground">
            This browser can&apos;t show notifications. On an iPhone, add the app
            to your Home Screen first (Share, then Add to Home Screen) and open
            it from there. Your reminder emails arrive either way.
          </p>
        ) : null}

        {state === "denied" ? (
          <p className="text-sm text-muted-foreground">
            Notifications are blocked for this site in your browser settings.
            You&apos;ll still get every reminder by email.
          </p>
        ) : null}

        {state === "subscribed" ? (
          <>
            <p role="status" className="text-sm text-muted-foreground">
              Notifications are on for this device.
            </p>
            <Button type="button" variant="outline" onClick={disable}>
              Turn off on this device
            </Button>
          </>
        ) : null}

        {state === "available" ? (
          <Button type="button" onClick={enable}>
            Turn on notifications
          </Button>
        ) : null}

        {state === "working" ? (
          <Button type="button" disabled>
            Working…
          </Button>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
