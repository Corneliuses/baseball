/**
 * Keeps a coach's losing chart draft on screen after a conflict.
 *
 * Both chart writes replace the whole chart rather than merging into it, so
 * each editor posts the board *as it loaded it* and the action refuses on a
 * mismatch (`chart-changed`) — otherwise a second coach saving a board they
 * opened earlier would erase the first one's work outright, unrecoverably,
 * since chart edits have no history.
 *
 * The refusal was honest but expensive: it redirects, so the client component
 * unmounts and its `useState` draft is discarded, and the page re-keys the
 * editor on the other coach's fresh entries. The coach was told "make your
 * changes again on top of it" while the changes they had just made were gone
 * from the screen. This is what keeps them visible.
 *
 * **Lines, not ids.** The stash holds the draft already rendered as text —
 * "1. Ava C.", "Pitcher — Ben R." — rather than entry ids to be resolved later.
 * Ids would have to be looked up against a roster that has, by definition,
 * just changed underneath them; a removed player would resolve to nothing and
 * the recovered draft would quietly lose a row. Text cannot go stale.
 *
 * **sessionStorage**, not localStorage: a draft belongs to the tab that was
 * editing, should not outlive the browser session, and must not surface in
 * another tab where a different board is open. (`InstallPrompt` uses
 * localStorage, for a preference that genuinely is per-device.)
 *
 * Every access is wrapped: a private window, blocked site data, or a full
 * quota all throw, and none of them is a reason to break the editor. Failing
 * quietly degrades to exactly the behaviour that existed before this module.
 */

export type ChartKind = "order" | "positions";

function storageKey(teamId: string, kind: ChartKind): string {
  return `chart-draft:${teamId}:${kind}`;
}

/// sessionStorage is an external store, so `DraftStash` reads it through
/// `useSyncExternalStore` rather than an effect — React's own answer for
/// "render from something outside React", and the only one that is correct
/// during SSR (where `window` does not exist at all).
///
/// Nothing outside this module writes these keys, so the subscription exists
/// purely to re-render the panel when *we* change them: dismissing clears the
/// draft and the listeners are how the panel learns it is now empty.
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeDraft(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/// The raw stored string, or null.
///
/// Deliberately *not* parsed here: `useSyncExternalStore` compares snapshots by
/// identity, so returning a freshly-parsed array on every call would report a
/// change on every render and loop forever. A string is stable for the same
/// content; the caller parses it once behind a memo.
export function draftSnapshot(teamId: string, kind: ChartKind): string | null {
  try {
    return window.sessionStorage.getItem(storageKey(teamId, kind));
  } catch {
    return null;
  }
}

/// The server has no sessionStorage and must render nothing, or hydration
/// would mismatch against a client that does.
export function serverDraftSnapshot(): string | null {
  return null;
}

/// Parse a snapshot into lines, tolerating anything that is not the shape this
/// version writes — the store is the browser's, not necessarily this build's,
/// so an older payload must read as "nothing stashed" rather than crash a
/// component.
export function parseDraft(raw: string | null): string[] | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((line) => typeof line === "string")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function stashDraft(
  teamId: string,
  kind: ChartKind,
  lines: readonly string[],
): void {
  try {
    window.sessionStorage.setItem(
      storageKey(teamId, kind),
      JSON.stringify(lines),
    );
  } catch {
    // Storage unavailable or full. The save still goes through; only the
    // safety net is missing, and its absence is the old behaviour.
  }
  notify();
}

export function clearDraft(teamId: string, kind: ChartKind): void {
  try {
    window.sessionStorage.removeItem(storageKey(teamId, kind));
  } catch {
    // Nothing to do: an unreadable store is also an unwritable one.
  }
  notify();
}
