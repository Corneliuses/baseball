"use client";

import * as React from "react";
import { useActionState } from "react";

import { SubmitButton } from "@/components/SubmitButton";
import { StatusBanner } from "@/components/StatusBanner";
import { messageFor } from "@/lib/error-messages";

import { sendTeamMessageAction } from "./actions";
import { COMPOSE_INITIAL_STATE } from "./compose-state";
import { COMPOSE_ERROR_MESSAGES } from "./message-messages";

/// One pickable parent in the "One parent:" dropdown. Coaches only — the
/// page never loads this list for a parent, whose audience is fixed.
export type AudienceOption = {
  userId: string;
  name: string | null;
  email: string;
};

const fieldClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

/**
 * Compose a team message.
 *
 * This form had the app's most expensive version of C5: a five-thousand
 * character body, and a subject that was one character too long threw the whole
 * thing away on a redirect. `useActionState` lets the action refuse without
 * navigating, so nothing written is ever lost to a validation failure.
 *
 * It absorbs what `AudienceFields` used to own, for a reason beyond tidiness.
 * That component held the radio group in state to close a real gap — label
 * activation skips interactive descendants, so a bare
 * `<label><input type="radio">…<select>…</select></label>` let a coach pick one
 * parent from the dropdown while "All parents" stayed the radio that actually
 * submitted, silently broadcasting a note meant for one family. That state now
 * has to survive a rejection alongside the subject and body, and splitting one
 * form's memory across two components is how the halves drift.
 */
export function ComposeForm({
  teamId,
  isCoach,
  parents,
}: {
  teamId: string;
  isCoach: boolean;
  parents: readonly AudienceOption[];
}) {
  const [state, formAction] = useActionState(
    sendTeamMessageAction,
    COMPOSE_INITIAL_STATE,
  );

  const rejected = state.status === "invalid" ? state : null;

  // A parent's audience is fixed; only a coach chooses. Seeded from the
  // returned state so a refusal keeps the choice too, not just the words.
  const [audience, setAudience] = React.useState<
    "ALL_PARENTS" | "INDIVIDUAL_PARENT"
  >(() =>
    rejected?.values.audience === "INDIVIDUAL_PARENT"
      ? "INDIVIDUAL_PARENT"
      : "ALL_PARENTS",
  );
  const [targetUserId, setTargetUserId] = React.useState(
    () => rejected?.values.targetUserId ?? "",
  );
  const [subject, setSubject] = React.useState(() => rejected?.values.subject ?? "");
  const [body, setBody] = React.useState(() => rejected?.values.body ?? "");

  const message = rejected
    ? messageFor(COMPOSE_ERROR_MESSAGES, rejected.code)
    : null;
  const field = rejected?.field ?? null;
  const errorId = "compose-error";

  const marks = (which: "subject" | "body") =>
    field === which
      ? {
          "aria-invalid": true as const,
          "aria-describedby": errorId,
          className: `${fieldClass} border-2 border-destructive`,
        }
      : { className: fieldClass };

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="teamId" value={teamId} />

      {isCoach ? (
        <fieldset
          className="space-y-2"
          aria-invalid={field === "audience" ? true : undefined}
          aria-describedby={field === "audience" ? errorId : undefined}
        >
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
              value={targetUserId}
              // Touching the select at all — focusing it with a keyboard,
              // opening it, or picking an option — means the sender is
              // choosing one parent, whether or not the radio was ever
              // clicked. Without this, the label-activation gap above sends a
              // note meant for one family to every family.
              onFocus={() => setAudience("INDIVIDUAL_PARENT")}
              onChange={(event) => {
                setTargetUserId(event.target.value);
                setAudience("INDIVIDUAL_PARENT");
              }}
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
      ) : (
        <input type="hidden" name="audience" value="ALL_COACHES" />
      )}

      <div className="space-y-2">
        <label
          htmlFor="subject"
          className="block text-sm font-medium text-foreground"
        >
          Subject
        </label>
        <input
          id="subject"
          name="subject"
          type="text"
          required
          maxLength={200}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          {...marks("subject")}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="body" className="block text-sm font-medium text-foreground">
          Message
        </label>
        <textarea
          id="body"
          name="body"
          rows={6}
          required
          maxLength={5000}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          {...marks("body")}
        />
      </div>

      {message ? (
        <StatusBanner tone="error" id={errorId}>
          {message}
        </StatusBanner>
      ) : null}

      {/* The send loop paces 600ms a recipient to stay under Resend's rate
          limit, so a full-team broadcast is well over ten seconds. Naming the
          count is what keeps that wait from reading as a dead button. */}
      <SubmitButton className="w-full" pendingLabel="Sending…">
        Send
      </SubmitButton>
    </form>
  );
}
