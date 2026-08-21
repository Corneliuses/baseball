"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  clearInstallOffer,
  getInstallOffer,
  getInstallOfferOnServer,
  getInstalled,
  getInstalledOnServer,
  subscribeToInstallAvailability,
  type BeforeInstallPromptEvent,
} from "@/components/install-availability";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/// Set once the coach or parent taps Not now. A phone that has been told no
/// should stay told: this app lives on someone's home screen or it doesn't, and
/// the difference is not worth nagging about on every visit to the team page.
const DISMISSED_KEY = "ybtm:install-prompt-dismissed";

/// How many times the iOS tip has been put in front of this browser.
///
/// Chromium tells us when an install succeeds; iOS tells us nothing. Safari
/// fires no `appinstalled`, and a Home Screen app gets a separate storage
/// container, so a parent who follows the Share-sheet steps leaves no trace
/// that the Safari tab can ever read — `isInstalled()` there stays false
/// forever. Without a cap the tip would therefore reappear on every single
/// visit for exactly the people who already did what it asked.
const IOS_TIP_SHOWINGS_KEY = "ybtm:install-tip-showings";

/// Enough to catch someone who was in a hurry the first time, few enough that
/// it stops being a fixture of the page.
const IOS_TIP_MAX_SHOWINGS = 3;

type Mode = "hidden" | "ios" | "install";

/// iPhone and iPad, including iPadOS's desktop-class Safari, which reports a
/// Macintosh user agent and is separated out by the touch-point count.
///
/// User-agent sniffing is the wrong tool almost everywhere and the only tool
/// here: iOS exposes no capability to detect. There is no `beforeinstallprompt`
/// to wait for and no API that answers "can this be installed", so the choice
/// is between reading the UA string and never telling an iPhone user how to
/// install at all. Exported for its own test, because a bad regex here is
/// invisible until it is someone's blank card.
export function isIos(userAgent: string, maxTouchPoints: number = 0): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) {
    return true;
  }
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/// Already running from the home screen. `display-mode: standalone` is the
/// standard answer; `navigator.standalone` is the non-standard one iOS shipped
/// years earlier and still sets, and older iOS versions answer only to that.
///
/// Both only ever answer from *inside* an installed app. Neither can tell you
/// from a browser tab that an installed copy exists elsewhere — see
/// IOS_TIP_SHOWINGS_KEY.
function isInstalled(): boolean {
  const standaloneDisplay =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;

  const iosStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  return standaloneDisplay || iosStandalone;
}

/// Reading localStorage throws outright in a Safari private window, so every
/// access is guarded. A browser that will not answer is treated as "not
/// dismissed" and "never shown" — worst case the card appears again, which is
/// the harmless side of both questions.
function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissal(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // A phone that cannot remember the dismissal still gets it for this visit.
  }
}

function readIosTipShowings(): number {
  try {
    const raw = Number(window.localStorage.getItem(IOS_TIP_SHOWINGS_KEY));
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  } catch {
    return 0;
  }
}

function recordIosTipShowing(): void {
  try {
    window.localStorage.setItem(
      IOS_TIP_SHOWINGS_KEY,
      String(readIosTipShowings() + 1),
    );
  } catch {
    // Uncounted is the same as unshown here, which errs toward showing it.
  }
}

/// "Has this rendered on a real browser yet." Everything this component decides
/// from — the user agent, `matchMedia`, `localStorage` — exists only on the
/// client, so the server render and the first client render must both produce
/// nothing or hydration mismatches.
///
/// `useSyncExternalStore` rather than the obvious `useState(false)` plus an
/// effect that flips it: setting state synchronously inside an effect body is
/// the cascading-render pattern the React Compiler's lint rejects outright.
/// This is the sanctioned shape for the same question, and it costs one hook.
/// The store never changes, so the subscribe callback has nothing to do.
const subscribeToNothing = () => () => {};
const hydratedOnClient = () => true;
const hydratedOnServer = () => false;

/// Which of the three things this component can be, given everything known.
/// Pure and argument-driven so the precedence is legible in one place — and so
/// the browser reads below stay behind the `hydrated` short-circuit.
function resolveMode({
  hydrated,
  closed,
  installedByEvent,
  offer,
  iosShowings,
}: {
  hydrated: boolean;
  closed: boolean;
  installedByEvent: boolean;
  offer: BeforeInstallPromptEvent | null;
  iosShowings: number;
}): Mode {
  if (!hydrated || closed || installedByEvent) {
    return "hidden";
  }
  if (isInstalled() || wasDismissed()) {
    return "hidden";
  }
  if (isIos(navigator.userAgent, navigator.maxTouchPoints)) {
    return iosShowings < IOS_TIP_MAX_SHOWINGS ? "ios" : "hidden";
  }
  // No captured offer means this browser has not said it can install — a
  // button that does nothing when tapped is worse than no button.
  return offer ? "install" : "hidden";
}

/// Offers to put the app on the phone's home screen, which is where a parent
/// standing at a field actually wants it — and, on iOS 16.4+, the only way Web
/// Push could ever reach them if Decision 8 is revisited.
///
/// It renders **nothing** unless it has something genuinely useful to say:
///
/// - already installed, or previously dismissed → nothing, permanently
/// - iOS → the Share-sheet instructions, because Safari offers no install API,
///   at most IOS_TIP_MAX_SHOWINGS times since iOS never reports success
/// - Chromium, once `beforeinstallprompt` has been caught → a real Install
///   button. The event is caught in `install-availability.ts` at the root
///   layout, not here, because it fires once per document load and this
///   component mounts a client-side navigation too late to hear it.
/// - anything else (Firefox, a desktop that will not install) → nothing
export function InstallPrompt() {
  const [closed, setClosed] = useState(false);

  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    hydratedOnClient,
    hydratedOnServer,
  );
  const offer = useSyncExternalStore(
    subscribeToInstallAvailability,
    getInstallOffer,
    getInstallOfferOnServer,
  );
  const installedByEvent = useSyncExternalStore(
    subscribeToInstallAvailability,
    getInstalled,
    getInstalledOnServer,
  );

  // Read once, at first render, and never updated. The effect below increments
  // the stored count, so reading it live would hide the card out from under
  // someone who is still reading it. A `useState` initializer is the way React
  // allows a one-time read like this — a ref would have to be read during
  // render, which the compiler's lint rejects outright — and the window guard
  // is because this initializer also runs during the server render.
  const [iosShowingsAtMount] = useState(() =>
    typeof window === "undefined" ? 0 : readIosTipShowings(),
  );

  const mode = resolveMode({
    hydrated,
    closed,
    installedByEvent,
    offer,
    iosShowings: iosShowingsAtMount,
  });

  const counted = useRef(false);
  useEffect(() => {
    if (mode !== "ios" || counted.current) {
      return;
    }
    counted.current = true;
    recordIosTipShowing();
  }, [mode]);

  const dismiss = useCallback(() => {
    rememberDismissal();
    setClosed(true);
  }, []);

  const install = useCallback(async () => {
    if (!offer) {
      return;
    }

    try {
      await offer.prompt();
    } catch {
      // The browser declines to show the sheet twice for one event. Nothing to
      // report: either it is already installed or the moment has passed.
    }

    // Single-use whatever the person chose, so the card goes either way.
    // Declining is not remembered as a dismissal — `appinstalled` handles the
    // accepted case, and a fresh event arrives on a later page load.
    clearInstallOffer();
  }, [offer]);

  if (mode === "hidden") {
    return null;
  }

  return (
    // Quiet on purpose: card stock and a muted border, no banana. This is an
    // enhancement offered once, not the point of the screen — design-plan.md §2
    // rations the accent to one loud thing per screen, and this is not it.
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Add to your home screen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          {mode === "ios"
            ? "Open the Share menu, then choose Add to Home Screen. The app opens straight to your team, without hunting for the link."
            : "Install the app so it opens straight to your team from your home screen, without hunting for the link."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {mode === "install" && (
            <Button type="button" size="sm" onClick={install}>
              Install
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={dismiss}>
            Not now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
