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
 * - This is where the `push` and `notificationclick` handlers land when
 *   Decision 8 is revisited post-MVP. The VAPID variables in `.env.example` are
 *   commented out until then, and the `PushSubscription` table is unused.
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
