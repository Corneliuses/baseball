"use client";

import * as React from "react";
import { useActionState } from "react";

import { SubmitButton } from "@/components/SubmitButton";
import { StatusBanner } from "@/components/StatusBanner";
import { messageFor } from "@/lib/error-messages";

import { createEventAction } from "./actions";
import {
  ADD_EVENT_INITIAL_STATE,
  EMPTY_EVENT_VALUES,
  type EventFormValues,
} from "./event-form-state";
import { SCHEDULE_ERROR_MESSAGES } from "./schedule-messages";
import type { ScheduleContext } from "./schedule-context";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

/**
 * "Add an event" — the form the Aug 2026 audit costed at ~60 interactions a
 * season (C1).
 *
 * Almost none of that cost was the typing. It was what a successful submit did
 * to the page: reload, clear all five fields, drop the `view`/`month` params,
 * and scroll back to the top — so a coach entering a twelve-game season paid
 * for the same field, the same opponent and the same event type twelve times,
 * from the top of the page each time.
 *
 * Three changes, all of which need the action to return rather than redirect:
 *
 * - **Nothing reloads.** `revalidatePath` refreshes the list under the form.
 * - **Type, location and opponent stay.** Adding six home games is one form,
 *   filled in once, with only the date changing. Date and notes always clear
 *   — a stale start time is the one field it would be dangerous to keep.
 * - **A rejection costs a correction, not the form.** Values come back with
 *   the error.
 *
 * The context fields ride along as hidden inputs so the access-failure
 * redirect — the one path that still navigates — lands on the schedule the
 * coach was actually reading. They are re-parsed server-side; see
 * schedule-context.ts on why they are three validated fields and never a URL.
 */
export function AddEventForm({
  teamId,
  context,
  initialValues = EMPTY_EVENT_VALUES,
  duplicatedFrom = null,
}: {
  teamId: string;
  context: ScheduleContext;
  /// Pre-filled from an existing event when the coach arrived via "Duplicate".
  initialValues?: EventFormValues;
  /// What was duplicated, named, so the form can say why it is already full.
  duplicatedFrom?: string | null;
}) {
  const [state, formAction] = useActionState(
    createEventAction,
    ADD_EVENT_INITIAL_STATE,
  );

  // Seeded once, then owned here. `initialValues` changes only by navigating
  // to a different ?duplicate=, and the page keys this component on that id so
  // such a navigation remounts rather than silently ignoring the new values.
  const seed =
    state.status === "invalid"
      ? state.values
      : state.status === "added"
        ? state.keep
        : initialValues;

  const [values, setValues] = React.useState<EventFormValues>(seed);

  // React's "adjust state when a prop changes" pattern, with the action's
  // result standing in for the prop: compare against the last state this
  // component acted on, and re-seed the fields when a new one arrives. Done
  // during render rather than in an effect so the boxes never flash their old
  // contents first.
  //
  // The previous value is held in state, not a ref, deliberately — reading or
  // writing a ref during render is what `react-hooks/refs` forbids, and the
  // rule is right: a ref does not schedule the re-render this depends on.
  const [handledState, setHandledState] = React.useState(state);
  if (handledState !== state) {
    setHandledState(state);
    // After an add the action says what to keep; after a rejection it hands
    // back what was typed. This is the only place the form overwrites what the
    // person is looking at, and both cases are a direct answer to the submit
    // they just made.
    if (state.status === "added") {
      setValues(state.keep);
    } else if (state.status === "invalid") {
      setValues(state.values);
    }
  }

  const set = <K extends keyof EventFormValues>(key: K, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const errorMessage =
    state.status === "invalid"
      ? messageFor(SCHEDULE_ERROR_MESSAGES, state.code)
      : null;
  const errorId = "add-event-error";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="teamId" value={teamId} />
      {/* Which schedule to return to if this submit ever navigates. Validated
          server-side — never a destination URL. */}
      <input type="hidden" name="view" value={context.view} />
      <input type="hidden" name="month" value={context.month} />
      <input type="hidden" name="past" value={context.past ? "1" : "0"} />

      {duplicatedFrom ? (
        <p className="rounded-md border-2 border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
          Copied from <span className="font-medium text-foreground">{duplicatedFrom}</span>
          . Pick the new date and time.
        </p>
      ) : null}

      {state.status === "added" ? (
        <StatusBanner tone="success">
          Added {state.summary}. The type, location and opponent are still here
          for the next one.
        </StatusBanner>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="type" className="block text-sm font-medium text-foreground">
          Type
        </label>
        <select
          id="type"
          name="type"
          required
          value={values.type}
          onChange={(event) => set("type", event.target.value)}
          className={inputClass}
        >
          <option value="GAME">Game</option>
          <option value="PRACTICE">Practice</option>
        </select>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="startsAt"
          className="block text-sm font-medium text-foreground"
        >
          Date and time
        </label>
        <input
          id="startsAt"
          name="startsAt"
          type="datetime-local"
          required
          value={values.startsAt}
          onChange={(event) => set("startsAt", event.target.value)}
          aria-invalid={errorMessage ? true : undefined}
          aria-describedby={errorMessage ? errorId : undefined}
          className={inputClass}
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="location"
          className="block text-sm font-medium text-foreground"
        >
          Location (optional)
        </label>
        <input
          id="location"
          name="location"
          type="text"
          maxLength={200}
          value={values.location}
          onChange={(event) => set("location", event.target.value)}
          className={inputClass}
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="opponent"
          className="block text-sm font-medium text-foreground"
        >
          Opponent (optional)
        </label>
        <input
          id="opponent"
          name="opponent"
          type="text"
          maxLength={200}
          value={values.opponent}
          onChange={(event) => set("opponent", event.target.value)}
          className={inputClass}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="notes" className="block text-sm font-medium text-foreground">
          Notes (optional)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          maxLength={2000}
          value={values.notes}
          onChange={(event) => set("notes", event.target.value)}
          className={inputClass}
        />
      </div>

      {errorMessage ? (
        <StatusBanner tone="error" id={errorId}>
          {errorMessage}
        </StatusBanner>
      ) : null}

      <SubmitButton className="w-full" pendingLabel="Adding…">
        Add event
      </SubmitButton>
    </form>
  );
}
