"use client";

import * as React from "react";
import { useActionState } from "react";

import { SubmitButton } from "@/components/SubmitButton";
import { StatusBanner } from "@/components/StatusBanner";
import { messageFor } from "@/lib/error-messages";

import { addPlayerAction } from "./actions";
import { ADD_PLAYER_INITIAL_STATE } from "./add-player-state";
import { ROSTER_ERROR_MESSAGES } from "./roster-messages";

const fieldClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

/**
 * "Add a player", as a form that keeps what was typed.
 *
 * Before this, a rejected date wiped the name and the jersey number with it:
 * the action redirected, the page re-rendered, and every uncontrolled input
 * came back empty. Typing a kid's details is short work, but doing it twice
 * because of one mistyped digit is the exact shape of C5.
 *
 * Values are controlled so they survive a rejection without depending on when
 * React resets an uncontrolled form. The initial values still come from the
 * returned state, which is what repopulates the fields when JavaScript never
 * ran at all.
 *
 * The message is looked up from `ROSTER_ERROR_MESSAGES` rather than sent as
 * prose, so the page's `?error=` path and this form say the same sentence for
 * the same failure — and adding a code means editing one table.
 */
export function AddPlayerForm({ teamId }: { teamId: string }) {
  const [state, formAction] = useActionState(
    addPlayerAction,
    ADD_PLAYER_INITIAL_STATE,
  );

  const rejected = state.status === "invalid" ? state : null;

  const [name, setName] = React.useState(() => rejected?.values.name ?? "");
  const [dateOfBirth, setDateOfBirth] = React.useState(
    () => rejected?.values.dateOfBirth ?? "",
  );
  const [jerseyNumber, setJerseyNumber] = React.useState(
    () => rejected?.values.jerseyNumber ?? "",
  );

  const message = rejected ? messageFor(ROSTER_ERROR_MESSAGES, rejected.code) : null;
  const field = rejected?.field ?? null;
  const errorId = "add-player-error";

  /// Marks only the box that caused it. `already-rostered` blames no single
  /// field, so nothing gets outlined and the banner carries the whole message.
  const marks = (which: NonNullable<typeof field>) =>
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

      <div className="space-y-2">
        <label htmlFor="name" className="block text-sm font-medium text-foreground">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          {...marks("name")}
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="dateOfBirth"
          className="block text-sm font-medium text-foreground"
        >
          Date of birth (optional)
        </label>
        <input
          id="dateOfBirth"
          name="dateOfBirth"
          type="date"
          value={dateOfBirth}
          onChange={(event) => setDateOfBirth(event.target.value)}
          {...marks("dateOfBirth")}
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="jerseyNumber"
          className="block text-sm font-medium text-foreground"
        >
          Jersey number (optional)
        </label>
        <input
          id="jerseyNumber"
          name="jerseyNumber"
          type="number"
          min={0}
          max={99}
          value={jerseyNumber}
          onChange={(event) => setJerseyNumber(event.target.value)}
          {...marks("jerseyNumber")}
        />
      </div>

      {message ? (
        <StatusBanner tone="error" id={errorId}>
          {message}
        </StatusBanner>
      ) : null}

      <SubmitButton className="w-full" pendingLabel="Adding…">
        Add player
      </SubmitButton>
    </form>
  );
}
