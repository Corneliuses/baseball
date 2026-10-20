"use client";

import * as React from "react";
import { useActionState } from "react";

import { SubmitButton } from "@/components/SubmitButton";
import { StatusBanner } from "@/components/StatusBanner";
import { messageFor } from "@/lib/error-messages";
import { hasLineupChart, SPORTS, SPORT_LABELS } from "@/lib/sport";

import { createTeamAction } from "./actions";
import { NEW_TEAM_ERROR_MESSAGES } from "./new-team-messages";
import { NEW_TEAM_INITIAL_STATE } from "./new-team-state";

const fieldClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

export interface NewTeamFormProps {
  /// From `?error=` — `access` and `create-failed`, which the action still
  /// redirects with because neither is something retyping would fix.
  redirectErrorCode?: string;
}

/**
 * "Create a team", as a form that keeps what was typed and asks for a sport.
 *
 * A client component because the all-play checkbox belongs to the lineup chart
 * and appears only while a sport that has one (Baseball) is chosen; the page stays a server
 * component and keeps the owner gate.
 *
 * The sport radios start with nothing selected on purpose — the owner
 * chooses, and a team is never silently made a baseball team. Values are
 * controlled so a rejection (no sport picked, no name) echoes them back
 * instead of clearing the form.
 */
export function NewTeamForm({ redirectErrorCode }: NewTeamFormProps) {
  const [state, formAction] = useActionState(
    createTeamAction,
    NEW_TEAM_INITIAL_STATE,
  );

  const rejected = state.status === "invalid" ? state : null;
  const echoed = rejected?.values ?? null;

  const [name, setName] = React.useState(() => echoed?.name ?? "");
  const [season, setSeason] = React.useState(() => echoed?.season ?? "");
  const [sport, setSport] = React.useState(() => echoed?.sport ?? "");
  // Checked by default, as it was before the sport picker existed: an
  // all-play baseball team is the common case.
  const [allPlay, setAllPlay] = React.useState(() => echoed?.allPlay ?? true);

  // Empty until a radio is picked, and an echoed value may be one the action
  // refused, so only a real sport is asked whether it has the chart.
  const chosenSport = SPORTS.find((value) => value === sport);
  const showAllPlay = chosenSport !== undefined && hasLineupChart(chosenSport);

  const message = rejected
    ? messageFor(NEW_TEAM_ERROR_MESSAGES, rejected.code)
    : messageFor(NEW_TEAM_ERROR_MESSAGES, redirectErrorCode);
  const field = rejected?.field ?? null;
  const errorId = "new-team-error";

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="name" className="block text-sm font-medium text-foreground">
          Team name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoFocus
          placeholder="Sharks"
          value={name}
          onChange={(event) => setName(event.target.value)}
          {...(field === "name"
            ? {
                "aria-invalid": true as const,
                "aria-describedby": errorId,
                className: `${fieldClass} border-2 border-destructive`,
              }
            : { className: fieldClass })}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="season" className="block text-sm font-medium text-foreground">
          Season
        </label>
        <input
          id="season"
          name="season"
          type="text"
          placeholder="2026"
          value={season}
          onChange={(event) => setSeason(event.target.value)}
          className={fieldClass}
        />
      </div>

      <fieldset
        className="space-y-2"
        {...(field === "sport"
          ? { "aria-invalid": true as const, "aria-describedby": errorId }
          : {})}
      >
        <legend className="block text-sm font-medium text-foreground">Sport</legend>
        <div className="flex flex-wrap gap-4">
          {SPORTS.map((value) => (
            <label
              key={value}
              className="flex items-center gap-2 text-sm text-foreground"
            >
              <input
                type="radio"
                name="sport"
                value={value}
                required
                checked={sport === value}
                onChange={() => setSport(value)}
                className="h-4 w-4 border-border"
              />
              {SPORT_LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>

      {showAllPlay ? (
        <div className="flex items-center gap-2">
          <input
            id="allPlay"
            name="allPlay"
            type="checkbox"
            checked={allPlay}
            onChange={(event) => setAllPlay(event.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          <label htmlFor="allPlay" className="text-sm text-foreground">
            Every kid bats and fields (all-play)
          </label>
        </div>
      ) : null}

      {message ? (
        <StatusBanner tone="error" id={errorId}>
          {message}
        </StatusBanner>
      ) : null}

      <SubmitButton className="w-full" pendingLabel="Creating…">
        Create team
      </SubmitButton>
    </form>
  );
}
