"use client";

import { useEffect } from "react";

// Imported for its side effect, and this is the only place that guarantees it
// happens. The module attaches the window listeners that catch Chromium's
// `beforeinstallprompt`, which fires once per document load — leaving it to
// `InstallPrompt` to import would attach them only on team home, by which time
// a client-side navigation has already carried the page past the event.
// PwaRegistrar sits in the root layout, so importing it here means every page
// is listening from the moment its bundle runs.
import "@/components/install-availability";

/// Registers `public/sw.js`, and renders nothing.
///
/// A service worker can only be registered from the client, so this exists as a
/// component purely to give the root layout — which is a server component, and
/// should stay one — somewhere to do it. It is the same shape as `Reveal.tsx`
/// under `/t/[teamId]/view`: a leaf marked `"use client"` so nothing above it
/// has to be.
///
/// Everything here is best-effort by design. The app is fully usable with no
/// service worker at all, and installability is an enhancement rather than a
/// prerequisite — a parent who taps the link in their email and never installs
/// must get exactly the same app. So a browser without `serviceWorker` support
/// and a registration that outright fails both end the same way: nothing
/// rendered, nothing thrown, nothing shown to the user.
export function PwaRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker
      // `updateViaCache: "none"` keeps the browser from serving this script
      // from its HTTP cache when checking for an update, which it will
      // otherwise do for up to 24 hours. It pairs with the no-store header on
      // /sw.js in next.config.ts: the header covers browsers that ignore the
      // option, and the option covers a stale CDN. Neither matters while the
      // worker is empty — both matter a great deal the day it grows a push
      // handler, because until it updates, nobody receives anything.
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error: unknown) => {
        console.error("Service worker registration failed", error);
      });
  }, []);

  return null;
}
