"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/// Set once the coach or parent taps Not now. A phone that has been told no
/// should stay told: this app lives on someone's home screen or it doesn't, and
/// the difference is not worth nagging about on every visit to the team page.
const DISMISSED_KEY = "ybtm:install-prompt-dismissed";

/// The Chromium-only event that lets a page offer its own install button.
/// Not in the DOM lib, because it is not in any specification Safari or Firefox
/// implements — which is the entire reason this component has two branches.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
};

/// iPhone and iPad, including iPadOS's desktop-class Safari, which reports a
/// Macintosh user agent and is separated out by the touch-point count.
///
/// User-agent sniffing is the wrong tool almost everywhere and the only tool
/// here: iOS exposes no capability to detect. There is no `beforeinstallprompt`
/// to wait for and no API that answers "can this be installed", so the choice
/// is between reading the UA string and never telling an iPhone user how to
/// install at all. Exported for its own test, because a bad regex here is
/// invisible until it is someone's blank card.
export function isIos(
  userAgent: string,
  maxTouchPoints: number = 0,
): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) {
    return true;
  }
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/// Already running from the home screen. `display-mode: standalone` is the
/// standard answer; `navigator.standalone` is the non-standard one iOS shipped
/// years earlier and still sets, and older iOS versions answer only to that.
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
/// dismissed" — worst case the card appears again, which is the harmless side.
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

/// Offers to put the app on the phone's home screen, which is where a parent
/// standing at a field actually wants it — and, on iOS 16.4+, the only way Web
/// Push could ever reach them if Decision 8 is revisited.
///
/// It renders **nothing** unless it has something genuinely useful to say,
/// which is most of the logic:
///
/// - already installed, or previously dismissed → nothing, permanently
/// - iOS → the Share-sheet instructions, because Safari offers no install API
///   and the steps are genuinely undiscoverable
/// - Chromium, once it has fired `beforeinstallprompt` → a real Install button
/// - anything else (Firefox, a desktop that will not install, an iOS-less
///   browser that never fires the event) → nothing, rather than a dead button
///
/// That last case is why the Chromium branch waits for the event instead of
/// assuming: an Install button that does nothing when tapped is worse than no
/// button, especially for the audience here.
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  // Closed for this visit — by the person tapping Not now, or by the app being
  // installed out from under the card. Distinct from the stored dismissal so
  // the browser is never re-read to answer a question already answered here.
  const [closed, setClosed] = useState(false);

  // The effect only ever subscribes; every state change below happens inside a
  // callback, which is both what the React Compiler's lint asks for and an
  // honest description of what this is — two browser events and a button.
  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      // Chrome shows its own mini-infobar unless the event is cancelled; this
      // hands the choice of when to ask over to the card below.
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    // Fired after an install completes by any route, including Chrome's own
    // menu — without this the card would linger until the next navigation.
    const onInstalled = () => {
      setDeferredPrompt(null);
      setClosed(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    hydratedOnClient,
    hydratedOnServer,
  );

  const dismiss = useCallback(() => {
    rememberDismissal();
    setDeferredPrompt(null);
    setClosed(true);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) {
      return;
    }

    try {
      await deferredPrompt.prompt();
    } catch {
      // The browser declines to show the sheet twice for one event. Nothing to
      // report: either it is already installed or the moment has passed.
    }

    // The captured event is single-use whatever the person chose, so the card
    // goes either way. Declining is not remembered as a dismissal — `appinstalled`
    // handles the accepted case, and a fresh event will arrive on a later visit.
    setDeferredPrompt(null);
    setClosed(true);
  }, [deferredPrompt]);

  if (!hydrated || closed) {
    return null;
  }

  // Read at render rather than cached in state, for the reason above: state
  // written during an effect is the pattern being avoided. All three are
  // side-effect-free reads of values that do not change while the page is open.
  if (isInstalled() || wasDismissed()) {
    return null;
  }

  const mode: "ios" | "install" | "hidden" = isIos(
    navigator.userAgent,
    navigator.maxTouchPoints,
  )
    ? "ios"
    : deferredPrompt
      ? "install"
      : "hidden";

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
