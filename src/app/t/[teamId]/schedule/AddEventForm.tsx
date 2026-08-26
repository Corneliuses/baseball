"use client";

import * as React from "react";
import { useActionState } from "react";

import { SubmitButton } from "@/components/SubmitButton";
import { StatusBanner } from "@/components/StatusBanner";
import { messageFor } from "@/lib/error-messages";
/// Never from `calendar.ts`: this is a client component, and that module reads
/// `process.env` at import time and carries date-fns plus the timezone data.
/// See repeat-weekly.ts.
import { MAX_REPEAT_WEEKS } from "@/lib/repeat-weekly";

import { createEventAction } from "./actions";
import { repeatPreview } from "./repeat-preview";
import {
  ADD_EVENT_INITIAL_STATE,
  EMPTY_EVENT_VALUES,
  type AddEventAnnouncement,
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
/**
 * What the success banner adds about the parent announcement.
 *
 * Present tense on purpose. The fan-out runs in `after()`, so at the moment
 * this renders not one message has been sent — "24 parents emailed" would be a
 * claim the form cannot know to be true, and the coach would have no reason to
 * read the receipt that actually says. Promising the summary is what makes the
 * receipt expected rather than a surprise.
 *
 * `failed` says nothing here; it gets its own banner below, because it is the
 * one case that needs a tone rather than a clause.
 */
function announcementNote(announcement: AddEventAnnouncement): string {
  switch (announcement.status) {
    case "sending":
      return announcement.recipients === 1
        ? " Emailing 1 parent now — we'll send you a summary."
        : ` Emailing ${announcement.recipients} parents now — we'll send you a summary.`;
    case "none":
    case "failed":
      return "";
  }
}

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
  // `pending` comes from the hook rather than from `useFormStatus`: this
  // component *renders* the form, and that hook only reports for a component
  // inside one. It matters here — see the fieldset below.
  const [state, formAction, pending] = useActionState(
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
  const errorField = state.status === "invalid" ? state.field : null;
  const errorId = "add-event-error";

  // Null unless the coach has asked for a run of two or more and given it a
  // date to start from — there is nothing to preview about a single event.
  const preview = repeatPreview(values.startsAt, values.repeat);
  // One id for the repeat field's help line whether it is currently showing the
  // preview or the fallback. A branch that renders two different <p>s, only one
  // of which carries an id, is a description a screen reader loses half the
  // time — and losing it silently, since the sighted layout is identical.
  const repeatHelpId = "add-event-repeat-help";

  /**
   * Marks only the field the error actually names — same pattern as
   * AddPlayerForm's `marks`. Every code maps to exactly one field, so an
   * over-long location no longer tells a screen reader the date and time
   * are the problem.
   *
   * `describedBy` is a description the field carries **permanently** — help
   * text that is true whether or not the last submit was rejected. It is
   * appended to the error id rather than replacing it, because
   * `aria-describedby` is a space-separated *list* and a field can legitimately
   * have both: "Repeat must be a whole number of weeks between 1 and 30" and
   * "Creates 8 events, weekly through Sat, May 23".
   *
   * That list is the whole reason this argument exists rather than the caller
   * writing `aria-describedby` itself. Spreading `marks` over a hand-written
   * one silently dropped it — last attribute wins in JSX — and it dropped the
   * preview at exactly the moment it was most worth reading, on the submit that
   * had just been rejected.
   */
  const marks = (which: keyof EventFormValues, describedBy?: string) => {
    const invalid = errorField === which;
    const ids = [invalid ? errorId : undefined, describedBy].filter(
      (id): id is string => typeof id === "string",
    );

    return {
      ...(invalid ? { "aria-invalid": true as const } : {}),
      ...(ids.length > 0 ? { "aria-describedby": ids.join(" ") } : {}),
    };
  };

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
          Copied from{" "}
          <span className="font-medium text-foreground">{duplicatedFrom}</span>.
          Pick the new date and time.
        </p>
      ) : null}

      {state.status === "added" ? (
        <StatusBanner tone="success">
          Added {state.summary}. The type, location and opponent are still here
          for the next one.
          {announcementNote(state.announcement)}
        </StatusBanner>
      ) : null}

      {/* Its own banner, and not folded into the success one above, because it
          is the only case where something the coach expected to happen did not.
          The event is still added — that line stays — but "no announcement was
          sent" needs the tone that says act on this. */}
      {state.status === "added" && state.announcement.status === "failed" ? (
        <StatusBanner tone="error">
          The roster couldn&apos;t be read, so no announcement was sent and
          nothing will retry. Tell parents from Messages.
        </StatusBanner>
      ) : null}

      {/* Disabled for the length of the round trip, and not only for tidiness:
          the moment a result lands, the block above overwrites every field
          with what the action says to keep. Without this, a coach who started
          typing the next event's date while the last one was still in flight
          would watch it vanish — the exact failure this whole change exists to
          remove. FormData is serialized at submit, before `pending` flips, so
          disabling costs the submission nothing. */}
      <fieldset disabled={pending} className="space-y-4 border-0 p-0">
        <div className="space-y-2">
          <label
            htmlFor="type"
            className="block text-sm font-medium text-foreground"
          >
            Type
          </label>
          <select
            id="type"
            name="type"
            required
            value={values.type}
            onChange={(event) => set("type", event.target.value)}
            className={inputClass}
            {...marks("type")}
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
            className={inputClass}
            {...marks("startsAt")}
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
            {...marks("location")}
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
            {...marks("opponent")}
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="notes"
            className="block text-sm font-medium text-foreground"
          >
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
            {...marks("notes")}
          />
        </div>

        {/* The whole season in one submit (#70). Last, because it is the one
            field that changes what "Add event" means — everything above
            describes the event, and this describes how many of them there
            are. */}
        <div className="space-y-2">
          <label
            htmlFor="repeat"
            className="block text-sm font-medium text-foreground"
          >
            Repeat weekly (optional)
          </label>
          <input
            id="repeat"
            name="repeat"
            type="number"
            min={1}
            max={MAX_REPEAT_WEEKS}
            step={1}
            inputMode="numeric"
            placeholder="1"
            value={values.repeat}
            onChange={(event) => set("repeat", event.target.value)}
            className={inputClass}
            {...marks("repeat", repeatHelpId)}
          />
          {/* One <p>, whose text swaps — never two, only one of which is
              described. When there is a run to describe it says what the submit
              is about to do while there is still time to change it: a coach who
              typed 30 meaning 3 reads a different last date, which is the only
              cheap check against a mistake that costs thirty deletes. Same
              weeks the server will step, computed the same way; see
              repeat-preview.ts on why it needs no timezone. */}
          <p id={repeatHelpId} className="text-sm text-muted-foreground">
            {preview ?? "Leave blank for a single event."}
          </p>
        </div>
      </fieldset>

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
