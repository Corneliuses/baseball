"use client";

/// Where the browser's install signals are caught and held.
///
/// This is a module-scope store rather than component state for one blunt
/// reason: **Chromium fires `beforeinstallprompt` once per document load**, and
/// it fires it at the window. A listener that only exists while some component
/// is mounted misses it. `InstallPrompt` renders on team home, but a parent
/// arrives at `/`, signs in, and taps through to their team with a client-side
/// navigation — no new document, so no second event, and the offer would be
/// gone before anything was listening. Catching it here, from a module the root
/// layout loads on every page, means the offer is already in hand by the time
/// the card mounts.
///
/// Listening at module scope rather than in an effect also narrows the race on
/// a hard load: the event can arrive before React has hydrated, and this module
/// is evaluated as the bundle executes rather than a tick later.
///
/// Nothing here reads or writes the DOM, and it holds exactly one event object.
/// If `push` ever lands (Decision 8), permission state belongs here too.

/// The Chromium-only event that lets a page offer its own install button. Not
/// in the DOM lib, because it is not in a specification Safari or Firefox
/// implements — which is why iOS needs a completely different affordance.
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
};

type Listener = () => void;

let offer: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

// Guarded because this module is imported by a client component, which Next
// still evaluates on the server while rendering it.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Chrome shows its own mini-infobar unless the event is cancelled. Holding
    // it here is what lets the card decide when to ask.
    event.preventDefault();
    offer = event as BeforeInstallPromptEvent;
    emit();
  });

  // Fires after an install completes by any route, including Chrome's own menu
  // — so the card can retire even when it was not the thing that was used.
  window.addEventListener("appinstalled", () => {
    offer = null;
    installed = true;
    emit();
  });
}

export function subscribeToInstallAvailability(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/// Snapshot getters, in the shape `useSyncExternalStore` wants. Each returns a
/// stable reference — the event object itself, or a boolean — so React can
/// compare snapshots without looping.
export function getInstallOffer(): BeforeInstallPromptEvent | null {
  return offer;
}

export function getInstallOfferOnServer(): null {
  return null;
}

export function getInstalled(): boolean {
  return installed;
}

export function getInstalledOnServer(): boolean {
  return false;
}

/// The captured event is single-use: once `prompt()` has been called the
/// browser will not show that sheet again, whatever the person chose.
export function clearInstallOffer(): void {
  offer = null;
  emit();
}
