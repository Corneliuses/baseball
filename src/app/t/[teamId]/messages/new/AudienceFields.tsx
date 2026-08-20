"use client";

import { useState } from "react";

/// The "To" fieldset of the compose form, split out as a client component
/// for one reason: label activation skips interactive descendants per the
/// HTML spec, so a bare `<label><input type="radio">…<select>…</select></label>`
/// lets a coach pick a parent from the dropdown while "All parents" stays the
/// radio that actually submits — silently broadcasting a note meant for one
/// family. Making the radio group controlled state lets the select's own
/// focus/change explicitly claim INDIVIDUAL_PARENT, closing that gap.

export type AudienceOption = {
  userId: string;
  name: string | null;
  email: string;
};

export function AudienceFields({ parents }: { parents: AudienceOption[] }) {
  const [audience, setAudience] = useState<"ALL_PARENTS" | "INDIVIDUAL_PARENT">(
    "ALL_PARENTS",
  );

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-foreground">To</legend>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="radio"
          name="audience"
          value="ALL_PARENTS"
          checked={audience === "ALL_PARENTS"}
          onChange={() => setAudience("ALL_PARENTS")}
        />
        All parents
      </label>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="radio"
          name="audience"
          value="INDIVIDUAL_PARENT"
          checked={audience === "INDIVIDUAL_PARENT"}
          onChange={() => setAudience("INDIVIDUAL_PARENT")}
        />
        One parent:
        <select
          name="targetUserId"
          aria-label="Which parent"
          defaultValue=""
          // Touching the select at all — focusing it with a keyboard,
          // opening it, or picking an option — means the coach is choosing
          // one parent, whether or not the radio itself was ever clicked.
          onFocus={() => setAudience("INDIVIDUAL_PARENT")}
          onChange={() => setAudience("INDIVIDUAL_PARENT")}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Choose a parent…</option>
          {parents.map((parent) => (
            <option key={parent.userId} value={parent.userId}>
              {parent.name ?? parent.email}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}
