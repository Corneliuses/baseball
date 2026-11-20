"use client";

import * as React from "react";

import { SubmitButton } from "@/components/SubmitButton";
import { sameSelection, validateSelection } from "@/lib/library-selection";

export type PickerItem = { id: string; name: string; summary: string };

/// The coach's checklist of a code-defined library — the playbook's plays or
/// the at-home skills. Ticking an item chooses it; once `max` are ticked the
/// rest disable, and the counter says why. The disable is a convenience — the
/// action's own validation is what holds the cap.
///
/// Each item can be previewed in place before it is chosen, with the same
/// animation families will see (`renderPreview`).
export function LibraryPicker<T extends PickerItem>({
  teamId,
  library,
  chosen,
  baseline,
  max,
  noun,
  fieldName,
  action,
  saveLabel,
  renderPreview,
}: {
  teamId: string;
  library: readonly T[];
  /// The ids the stored list names that the library still has — the initial
  /// ticks.
  chosen: readonly string[];
  /// The stored column exactly as loaded, for the action's lost-update check.
  baseline: readonly string[];
  max: number;
  /// Plural, lower case: "plays", "skills".
  noun: string;
  /// The form field each ticked id is posted under.
  fieldName: string;
  action: (formData: FormData) => void | Promise<void>;
  saveLabel: string;
  renderPreview: (item: T) => React.ReactNode;
}) {
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(
    () => new Set(chosen),
  );
  const full = selected.size >= max;
  // "Would writing change the database", not "has the coach ticked anything":
  // a stored id the library has since dropped makes those differ, and the
  // coach must be able to save the cleaned-up list (AGENTS.md, Save vs Cancel).
  const draft = validateSelection(library, [...selected], max);
  const unchanged = draft.ok && sameSelection(draft.ids, baseline);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < max) {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="baseline" value={JSON.stringify(baseline)} />

      <p
        className="font-mono text-sm font-bold text-muted-foreground"
        aria-live="polite"
      >
        {selected.size} of {max} {noun} chosen
      </p>

      <ul className="space-y-3">
        {library.map((item) => {
          const checked = selected.has(item.id);
          const inputId = `${fieldName}-${item.id}`;
          return (
            <li
              key={item.id}
              className={`rounded-md border-2 bg-card p-3 ${
                checked ? "border-primary" : "border-border"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  id={inputId}
                  type="checkbox"
                  name={fieldName}
                  value={item.id}
                  checked={checked}
                  disabled={!checked && full}
                  onChange={() => toggle(item.id)}
                  className="mt-1 size-5 shrink-0 accent-primary"
                />
                <label htmlFor={inputId} className="min-w-0 flex-1">
                  <span className="block font-semibold text-foreground">
                    {item.name}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {item.summary}
                  </span>
                </label>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-semibold text-primary">
                  Watch it
                </summary>
                <div className="pt-3">{renderPreview(item)}</div>
              </details>
            </li>
          );
        })}
      </ul>

      <SubmitButton pendingLabel="Saving…" disabled={unchanged}>
        {saveLabel}
      </SubmitButton>
    </form>
  );
}
