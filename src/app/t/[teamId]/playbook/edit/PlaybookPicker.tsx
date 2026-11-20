"use client";

import * as React from "react";

import { PlayAnimation } from "@/components/PlayAnimation";
import { SubmitButton } from "@/components/SubmitButton";
import { MAX_PLAYBOOK_PLAYS, type Play } from "@/lib/plays";

import { savePlaybookAction } from "./actions";

/// The coach's checklist of the play library. Ticking a play puts it in the
/// playbook; once five are ticked the rest disable, and the counter says why.
/// The disable is a convenience — `validatePlaybook` in the action is what
/// actually holds the cap.
///
/// Each play can be previewed in place before it is chosen, with the same
/// animation parents will see.
export function PlaybookPicker({
  teamId,
  library,
  chosen,
  baseline,
}: {
  teamId: string;
  library: readonly Play[];
  /// The plays the stored playbook names that the library still has — the
  /// initial ticks.
  chosen: readonly string[];
  /// The stored column exactly as loaded, for the action's lost-update check.
  baseline: readonly string[];
}) {
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(
    () => new Set(chosen),
  );
  const full = selected.size >= MAX_PLAYBOOK_PLAYS;
  const unchanged =
    selected.size === chosen.length && chosen.every((id) => selected.has(id));

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_PLAYBOOK_PLAYS) {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <form action={savePlaybookAction} className="space-y-4">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="baseline" value={JSON.stringify(baseline)} />

      <p
        className="font-mono text-sm font-bold text-muted-foreground"
        aria-live="polite"
      >
        {selected.size} of {MAX_PLAYBOOK_PLAYS} plays chosen
      </p>

      <ul className="space-y-3">
        {library.map((play) => {
          const checked = selected.has(play.id);
          const inputId = `play-${play.id}`;
          return (
            <li
              key={play.id}
              className={`rounded-md border-2 bg-card p-3 ${
                checked ? "border-primary" : "border-border"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  id={inputId}
                  type="checkbox"
                  name="play"
                  value={play.id}
                  checked={checked}
                  disabled={!checked && full}
                  onChange={() => toggle(play.id)}
                  className="mt-1 size-5 shrink-0 accent-primary"
                />
                <label htmlFor={inputId} className="min-w-0 flex-1">
                  <span className="block font-semibold text-foreground">
                    {play.name}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {play.summary}
                  </span>
                </label>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-semibold text-primary">
                  Watch it
                </summary>
                <div className="pt-3">
                  <PlayAnimation play={play} />
                </div>
              </details>
            </li>
          );
        })}
      </ul>

      <SubmitButton pendingLabel="Saving…" disabled={unchanged}>
        Save playbook
      </SubmitButton>
    </form>
  );
}
