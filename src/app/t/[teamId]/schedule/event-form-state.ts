/// The shape `createEventAction` hands back to `AddEventForm`.
///
/// Its own module because `actions.ts` is `"use server"`, where the directive
/// marks every export as a server function — a runtime constant there fails at
/// `next build` rather than at `pnpm check`.

/// Exactly the five fields of the add-event form, as typed.
export interface EventFormValues {
  type: string;
  startsAt: string;
  location: string;
  opponent: string;
  notes: string;
}

export const EMPTY_EVENT_VALUES: EventFormValues = {
  type: "GAME",
  startsAt: "",
  location: "",
  opponent: "",
  notes: "",
};

/// Which input the error belongs to. Unlike the roster's `AddPlayerField`,
/// this is never null: every `EventErrorCode` maps to exactly one of the
/// form's five fields — there is no error here that blames the submission as
/// a whole rather than one box.
export type AddEventField = "type" | "startsAt" | "location" | "opponent" | "notes";

export type AddEventState =
  | { status: "idle" }
  | {
      status: "invalid";
      /// A key into the schedule page's message table, not a sentence.
      code: string;
      /// Which field to mark `aria-invalid` and point at the message. Without
      /// this every rejection was attributed to `startsAt` regardless of which
      /// field actually failed — a location that was too long would tell a
      /// screen reader the date and time were the problem.
      field: AddEventField;
      values: EventFormValues;
    }
  /// The event was created. Carries what should stay in the form for the next
  /// one: a season is entered in runs — six home games at the same field, the
  /// same opponent twice in a fortnight — so type, location and opponent are
  /// worth keeping and the date never is.
  | { status: "added"; keep: EventFormValues; summary: string };

export const ADD_EVENT_INITIAL_STATE: AddEventState = { status: "idle" };

/// What survives an "Add" for the next event.
///
/// The date is always cleared: two events cannot share a start time, and a
/// stale one sitting in the box is the single most dangerous thing this form
/// could keep. Notes are cleared because they are about one occasion; type,
/// location and opponent are the fields the audit found barely change from
/// game to game (Dugout Report C1).
export function stickyValues(values: EventFormValues): EventFormValues {
  return {
    type: values.type,
    startsAt: "",
    location: values.location,
    opponent: values.opponent,
    notes: "",
  };
}
