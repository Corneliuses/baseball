/*
 * The service worker, hand-written and deliberately almost empty.
 *
 * Its entire job today is to exist. A registered service worker is what makes
 * the app installable to a phone home screen alongside the manifest; on iOS it
 * is also the precondition for Web Push ever working at all, and iOS only
 * grants that to an app the user has actually added to their Home Screen.
 *
 * **It caches nothing, and there is no `fetch` handler on purpose.** That is
 * Decision 9 in `.agents/app-brainstorm/youth-baseball-team-manager/stack-decisions.md`:
 * offline read caching is a *Later* item, and the cost of adding it now is
 * debugging stale-cache behaviour during the weeks the app changes hourly.
 * Chrome dropped the fetch-handler requirement for installability and iOS never
 * had one, so a pass-through handler would buy nothing and put this file in the
 * path of every request the app makes.
 *
 * Two things follow from that, and both are load-bearing:
 *
 * - Adding a `fetch` handler here is not a small change. Every page in this app
 *   behind `/t/:teamId` is a different family's roster; a cache keyed by URL
 *   alone would hand the previous signed-in person's data to the next one on a
 *   shared phone. If offline support is ever wanted, adopt Serwist and think
 *   about scoping first — do not grow it a line at a time here.
 * - The `push` and `notificationclick` handlers below are the whole of
 *   Decision 8 in this file (#47). They read a payload and open a URL; they do
 *   not cache, and they must not grow a `fetch` handler by association.
 *
 * `skipWaiting` and `clients.claim` together mean an updated worker takes over
 * immediately rather than waiting for every tab to close. With nothing cached
 * there is no half-old, half-new state for that to expose, and it is what keeps
 * a future push handler from sitting idle behind a tab someone left open for a
 * season.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/*
 * Day-of reminders (#47).
 *
 * The payload is JSON written by `sendPushToUser` — `{ title, body, url }`.
 * It is parsed defensively: a push whose body is missing or malformed must
 * still show *something*, because on iOS a `push` event that resolves without
 * calling `showNotification` can cost the site its push permission entirely.
 * There is no silent push here by design.
 */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "Youth Baseball Team Manager";
  const options = {
    body: payload.body || "You have an update from your team.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // Collapses repeats on the lock screen: a re-delivered reminder for the
    // same event replaces the old one rather than stacking.
    tag: payload.url || "team-notification",
    data: { url: payload.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/*
 * Focus an already-open tab rather than piling up new ones — a parent who
 * taps two reminders should not end up with two copies of the app.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === target && "focus" in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});
