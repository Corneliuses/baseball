"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { AlertIcon } from "@/components/icons";

import {
  clearDraft,
  draftSnapshot,
  parseDraft,
  serverDraftSnapshot,
  subscribeDraft,
  type ChartKind,
} from "./draft-stash";

/**
 * The draft a conflict rejected, kept on screen to re-apply by hand.
 *
 * When two coaches edit at once the loser's board was simply gone: the action
 * redirects, the editor unmounts, and the page re-keys on the winner's data.
 * The banner said "make your changes again on top of it" — with no record of
 * what those changes were.
 *
 * Read-only on purpose, and this is the whole design decision. Making the
 * losing draft *interactive* again would mean re-applying it to a board that
 * has changed underneath it, which is precisely the lost-update the baseline
 * guard exists to prevent — and with no chart history, getting that wrong is
 * unrecoverable. A reference panel beside the live board lets the coach put
 * back what still makes sense and drop what no longer does, deciding each row
 * themselves.
 *
 * Rendered only on the conflict, and cleared the moment it stops being useful:
 * a successful save, or the coach dismissing it.
 *
 * Well clear of dnd-kit: this is a static panel below the editor, not anything
 * draggable — the collision rule in AGENTS.md is about elements dnd-kit
 * positions, and nothing here is one.
 */
export function DraftStash({
  teamId,
  kind,
  title,
}: {
  teamId: string;
  kind: ChartKind;
  title: string;
}) {
  // sessionStorage is an external store, and this is React's own way to read
  // one: correct during SSR (the server snapshot is always null, since there
  // is no storage there), and re-rendered when Dismiss clears the draft.
  //
  // The snapshot is the raw string rather than a parsed array on purpose —
  // useSyncExternalStore compares by identity, so a fresh array per call would
  // look like a change on every render and never settle.
  const raw = React.useSyncExternalStore(
    subscribeDraft,
    () => draftSnapshot(teamId, kind),
    serverDraftSnapshot,
  );
  const lines = React.useMemo(() => parseDraft(raw), [raw]);

  if (!lines || lines.length === 0) {
    // Nothing stashed — a fresh tab, a storage-blocked browser, or a draft
    // already dismissed. The page's own banner still explains the conflict.
    return null;
  }

  return (
    <section
      aria-labelledby="draft-stash-heading"
      // The chalk box of design-plan.md §5: a dashed warm border, the style
      // this app already uses for empty states and drop zones. Deliberately
      // not a banana — the editor spends its one on the drop-target glow.
      className="space-y-3 rounded-md border-2 border-dashed border-border bg-muted/30 p-4"
    >
      <div className="flex items-start gap-2">
        <AlertIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h4
            id="draft-stash-heading"
            className="text-sm font-semibold text-foreground"
          >
            {title}
          </h4>
          <p className="text-sm text-muted-foreground">
            Nothing here was saved. The board above is the other coach&apos;s —
            put back whatever still applies.
          </p>
        </div>
      </div>

      <ol className="space-y-1 font-mono text-sm text-foreground">
        {lines.map((line, index) => (
          <li key={`${index}-${line}`}>{line}</li>
        ))}
      </ol>

      <Button
        type="button"
        variant="outline"
        size="sm"
        // Clearing notifies the store, which re-renders this panel out of
        // existence — no local copy of the state to fall out of step.
        onClick={() => clearDraft(teamId, kind)}
      >
        Dismiss
      </Button>
    </section>
  );
}
