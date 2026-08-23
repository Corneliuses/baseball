"use client";

import * as React from "react";
import { useActionState } from "react";

import { SubmitButton } from "@/components/SubmitButton";
import { StatusBanner } from "@/components/StatusBanner";
import { CheckCircleIcon } from "@/components/icons";
import { bulkInviteGuardiansAction } from "./actions";
import {
  BULK_INVITE_INITIAL_STATE,
  type BulkInviteOutcome,
} from "./bulk-invite-state";

export interface InviteRow {
  entryId: string;
  playerName: string;
  jerseyNumber: number | null;
}

const fieldClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

/**
 * The bulk parent invite, as a form that answers back.
 *
 * Three things were wrong with the server-rendered version, and they compound:
 * it blocked for ~9 seconds with no feedback at all, one malformed address
 * rejected the whole batch without saying which, and the redirect that carried
 * the rejection blanked all fifteen addresses the coach had just typed. The
 * third is what made the second expensive.
 *
 * `useActionState` fixes all three at once, because the action can now *return*
 * instead of redirecting: nothing reloads, nothing scrolls to the top, and
 * what was typed never leaves the browser.
 *
 * Inputs are controlled rather than left to `defaultValue`, deliberately. React
 * resets an uncontrolled form once its action resolves, which is right for a
 * form that succeeded and wrong for one that came back with a bad row — and
 * relying on that timing would make "did the coach keep their typing" a
 * question about framework internals. Holding the values in state makes it a
 * question about this component. The initial value still comes from the state
 * the server returned, which is what repopulates the form on the
 * no-JavaScript path, where there is no client state to survive the round trip.
 */
export function InviteForm({
  teamId,
  rows,
}: {
  teamId: string;
  rows: readonly InviteRow[];
}) {
  const [state, formAction] = useActionState(
    bulkInviteGuardiansAction,
    BULK_INVITE_INITIAL_STATE,
  );

  const echoed = state.status === "invalid" ? state.values : null;
  // Seeded once. After hydration this state *is* the form; the server only
  // repopulates it when the browser never ran the client half at all.
  const [emails, setEmails] = React.useState<Record<string, string>>(
    () => echoed?.emails ?? {},
  );
  const [message, setMessage] = React.useState(() => echoed?.message ?? "");

  const rowErrors = state.status === "invalid" ? state.rowErrors : {};
  const batchMessage = state.status === "invalid" ? state.message : "";
  const outcomes = state.status === "done" ? state.outcomes : null;

  const filledCount = rows.filter((row) => (emails[row.entryId] ?? "").trim()).length;

  return (
    <div className="space-y-4">
      {outcomes ? <InviteResults outcomes={outcomes} teamId={teamId} /> : null}

      {batchMessage ? (
        <StatusBanner tone="error" id="bulk-invite-error">
          {batchMessage}
        </StatusBanner>
      ) : null}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="teamId" value={teamId} />

        <ul className="space-y-3">
          {rows.map((row) => {
            const rowError = rowErrors[row.entryId];
            const errorId = `email-${row.entryId}-error`;

            return (
              <li key={row.entryId} className="space-y-1">
                <label
                  htmlFor={`email-${row.entryId}`}
                  className="block text-sm font-medium text-foreground"
                >
                  {row.playerName}
                  {row.jerseyNumber !== null ? ` (#${row.jerseyNumber})` : ""}
                </label>
                <input
                  id={`email-${row.entryId}`}
                  name={`email-${row.entryId}`}
                  type="email"
                  placeholder="parent@example.com"
                  value={emails[row.entryId] ?? ""}
                  onChange={(event) =>
                    setEmails((current) => ({
                      ...current,
                      [row.entryId]: event.target.value,
                    }))
                  }
                  aria-invalid={rowError ? true : undefined}
                  aria-describedby={rowError ? errorId : undefined}
                  className={`${fieldClass} ${
                    rowError ? "border-2 border-destructive" : ""
                  }`}
                />
                {rowError ? (
                  <p id={errorId} className="text-sm text-destructive">
                    {rowError}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="space-y-2">
          <label
            htmlFor="message"
            className="block text-sm font-medium text-foreground"
          >
            Message (optional)
          </label>
          <textarea
            id="message"
            name="message"
            rows={4}
            maxLength={1000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="A note included in every invitation email."
            className={fieldClass}
          />
        </div>

        {/* The pending label is doing real work here, not decoration: the send
            loop is paced 600ms a row to stay under Resend's rate limit, so a
            full team is the better part of ten seconds. Saying so is what
            keeps a coach from reading the wait as a dead button. */}
        <SubmitButton
          className="w-full"
          pendingLabel={
            filledCount > 1
              ? `Sending ${filledCount} invitations…`
              : "Sending the invitation…"
          }
        >
          {filledCount > 0
            ? `Send ${filledCount} invitation${filledCount === 1 ? "" : "s"}`
            : "Send invitations"}
        </SubmitButton>
      </form>
    </div>
  );
}

/// What actually happened, row by row.
///
/// Grouped by outcome rather than listed flat, because the three groups are
/// three different next actions for the coach: nothing, nothing, and "go open
/// that player". Failures come first for the same reason.
function InviteResults({
  outcomes,
  teamId,
}: {
  outcomes: readonly BulkInviteOutcome[];
  teamId: string;
}) {
  const sent = outcomes.filter((row) => row.outcome === "sent");
  const linked = outcomes.filter((row) => row.outcome === "linked");
  const failed = outcomes.filter((row) => row.outcome === "failed");

  const name = (row: BulkInviteOutcome) => row.playerName ?? row.email;

  return (
    <div className="space-y-3">
      {failed.length > 0 ? (
        <StatusBanner tone="error">
          <p className="font-medium">
            {failed.length === 1
              ? "One invitation didn't go out."
              : `${failed.length} invitations didn't go out.`}
          </p>
          <ul className="mt-1 space-y-1">
            {failed.map((row) => (
              <li key={row.entryId}>
                <span className="font-medium">{name(row)}</span>
                {row.reason ? ` — ${row.reason}` : null}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-muted-foreground">
            Open the player from the{" "}
            <a href={`/t/${teamId}/roster`} className="underline">
              roster
            </a>{" "}
            to try again.
          </p>
        </StatusBanner>
      ) : null}

      {sent.length > 0 || linked.length > 0 ? (
        <StatusBanner tone="success">
          {sent.length > 0 ? (
            <>
              <p className="font-medium">
                {sent.length === 1
                  ? "Invitation sent."
                  : `${sent.length} invitations sent.`}
              </p>
              <ul className="mt-1 space-y-1">
                {sent.map((row) => (
                  <li key={row.entryId} className="flex items-center gap-1.5">
                    <CheckCircleIcon className="size-3.5 shrink-0 text-primary" />
                    <span className="font-medium">{name(row)}</span>
                    <span className="text-muted-foreground">— {row.email}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {linked.length > 0 ? (
            <div className={sent.length > 0 ? "mt-2" : ""}>
              <p className="font-medium">
                {linked.length === 1
                  ? "One parent was already a member and is now linked."
                  : `${linked.length} parents were already members and are now linked.`}
              </p>
              <ul className="mt-1 space-y-1">
                {linked.map((row) => (
                  <li key={row.entryId} className="flex items-center gap-1.5">
                    <CheckCircleIcon className="size-3.5 shrink-0 text-primary" />
                    <span className="font-medium">{name(row)}</span>
                    <span className="text-muted-foreground">— {row.email}</span>
                  </li>
                ))}
              </ul>
              {/* No email is owed to someone who can already open the team, so
                  none was sent — worth saying, or the absence reads as a bug. */}
              <p className="mt-1 text-muted-foreground">
                They can already open the team, so no invitation was needed.
              </p>
            </div>
          ) : null}
        </StatusBanner>
      ) : null}
    </div>
  );
}
