"use client";

import * as React from "react";
import { useActionState } from "react";

import { SubmitButton } from "@/components/SubmitButton";
import { StatusBanner } from "@/components/StatusBanner";
import { messageFor } from "@/lib/error-messages";

import { updateTeamAction } from "./actions";
import { SETTINGS_ERROR_MESSAGES } from "./settings-messages";
import { TEAM_SETTINGS_INITIAL_STATE } from "./team-settings-state";

const fieldClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

export interface TeamDetailsFormProps {
  teamId: string;
  name: string;
  season: string;
  allPlay: boolean;
  groupMeUrl: string;
  /// From `?saved=1` — the action redirects on success, so the confirmation
  /// arrives as a search param rather than as form state.
  saved?: boolean;
  /// From `?error=` — currently only `access`, which the action redirects with
  /// because a save that can never succeed has no form worth keeping warm.
  redirectErrorCode?: string;
}

/**
 * Team name, season, all-play, and the GroupMe link — as a form that keeps
 * what was typed.
 *
 * Before this, a rejected GroupMe link wiped the name and season with it: the
 * action redirected, the page re-rendered, and every uncontrolled input came
 * back holding whatever is in the database. Re-typing a season because of one
 * mistyped link is the shape AGENTS.md's `useActionState` rule exists to
 * prevent, and the GroupMe field is what made rejection routine here — `name`
 * is `required`, so the browser never let the old path run.
 *
 * Values are controlled so they survive a rejection without depending on when
 * React resets an uncontrolled form. The initial values still come from the
 * team as stored, which is what fills the fields when JavaScript never ran.
 *
 * The message is looked up from `SETTINGS_ERROR_MESSAGES` rather than sent as
 * prose, so this form and the page's `?error=` path say the same sentence for
 * the same failure.
 */
export function TeamDetailsForm({
  teamId,
  name: storedName,
  season: storedSeason,
  allPlay: storedAllPlay,
  groupMeUrl: storedGroupMeUrl,
  saved = false,
  redirectErrorCode,
}: TeamDetailsFormProps) {
  const [state, formAction] = useActionState(
    updateTeamAction,
    TEAM_SETTINGS_INITIAL_STATE,
  );

  const rejected = state.status === "invalid" ? state : null;
  const echoed = rejected?.values ?? null;

  const [name, setName] = React.useState(() => echoed?.name ?? storedName);
  const [season, setSeason] = React.useState(
    () => echoed?.season ?? storedSeason,
  );
  const [allPlay, setAllPlay] = React.useState(
    () => echoed?.allPlay ?? storedAllPlay,
  );
  const [groupMeUrl, setGroupMeUrl] = React.useState(
    () => echoed?.groupMeUrl ?? storedGroupMeUrl,
  );

  // A rejection belongs to one field; a lost-access redirect belongs to the
  // form as a whole and marks nothing.
  const message = rejected
    ? messageFor(SETTINGS_ERROR_MESSAGES, rejected.code)
    : messageFor(SETTINGS_ERROR_MESSAGES, redirectErrorCode);
  const field = rejected?.field ?? null;
  const errorId = "settings-error";

  /// Marks and describes only the box that caused it. The banner used to be
  /// wired to the team-name input unconditionally, so a rejected GroupMe link
  /// was announced on the wrong field.
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
          Team name
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

      <div className="space-y-2">
        <label
          htmlFor="groupMeUrl"
          className="block text-sm font-medium text-foreground"
        >
          GroupMe link
        </label>
        <input
          id="groupMeUrl"
          name="groupMeUrl"
          type="url"
          placeholder="https://groupme.com/join_group/…"
          value={groupMeUrl}
          onChange={(event) => setGroupMeUrl(event.target.value)}
          {...marks("groupMeUrl")}
          // The hint always describes the box; the error joins it only when
          // this is the field that failed, so the two are read together rather
          // than one replacing the other.
          aria-describedby={
            field === "groupMeUrl" ? `${errorId} groupme-hint` : "groupme-hint"
          }
        />
        <p id="groupme-hint" className="text-xs text-muted-foreground">
          The group&rsquo;s share link, from GroupMe&rsquo;s own Share button.
          Everyone on the team sees it on the team page so parents can join the
          chat. Leave blank to hide it.
        </p>
      </div>

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

      {message ? (
        <StatusBanner tone="error" id={errorId}>
          {message}
        </StatusBanner>
      ) : null}

      {saved && !message ? (
        <StatusBanner tone="success">Saved.</StatusBanner>
      ) : null}

      <SubmitButton className="w-full" pendingLabel="Saving…">
        Save changes
      </SubmitButton>
    </form>
  );
}
