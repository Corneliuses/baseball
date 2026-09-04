/// The shape `createEventAction` hands back to `AddEventForm`.
///
/// Its own module because `actions.ts` is `"use server"`, where the directive
/// marks every export as a server function — a runtime constant there fails at
/// `next build` rather than at `pnpm check`.

/// Exactly the seven fields of the add-event form, as typed. `repeat` is the
/// weekly count (#70) and is a string like the rest — it is what the number
/// input holds, blank included, and the action parses it. `announce` is the
/// one non-string: a checkbox holds a boolean, and pretending otherwise would
/// mean encoding "checked" as a string in three places that all have to agree.
export interface EventFormValues {
  type: string;
  startsAt: string;
  location: string;
  opponent: string;
  notes: string;
  repeat: string;
  /// Whether to email every family on the roster about what was added. On by
  /// default — step 2 of the brief's core loop — and turned off by the coach
  /// per submit, for the game already on everyone's calendar or the placeholder
  /// that is about to change.
  announce: boolean;
}

export const EMPTY_EVENT_VALUES: EventFormValues = {
  type: "GAME",
  startsAt: "",
  location: "",
  opponent: "",
  notes: "",
  /// Blank, not "1". The field is optional and a coach adding one game should
  /// see an empty box, not a number to reason about.
  repeat: "",
  announce: true,
};

/// Which input the error belongs to. Unlike the roster's `AddPlayerField`,
/// this is never null: every `EventErrorCode` maps to exactly one of the
/// form's typed fields — there is no error here that blames the submission as
/// a whole rather than one box. The announce checkbox is absent on purpose:
/// a checkbox cannot be invalid.
export type AddEventField =
  | "type"
  | "startsAt"
  | "location"
  | "opponent"
  | "notes"
  | "repeat";

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
  | {
      status: "added";
      keep: EventFormValues;
      summary: string;
      announcement: AddEventAnnouncement;
    };

/// What became of the parent announcement for the event just added (#45).
///
/// State rather than a search param, and that is the whole gain from landing
/// this on top of the `useActionState` rewrite: the previous shape smuggled the
/// count back through `?announcing=`, which meant parsing an attacker-chosen
/// string on every render and refusing to print anything that was not a
/// positive integer. A typed union cannot be forged from the URL bar, so that
/// entire defence disappears rather than being maintained.
///
/// Note what "sending" does **not** claim. The fan-out runs in `after()`, so at
/// the moment the coach reads this not one message has been sent — the count is
/// how many are about to be attempted, and the outcome arrives by email.
export type AddEventAnnouncement =
  /// Nobody to tell: the event starts in the past, or no guardian is linked to
  /// anyone on the roster yet.
  | { status: "none" }
  /// `recipients` households are being emailed now.
  | { status: "sending"; recipients: number }
  /// The coach unticked "Email parents", so nobody was told and nothing will
  /// be. Distinct from `none` because it is a choice the banner should echo
  /// back — a coach who unticked it by accident finds out here, not from the
  /// silence.
  | { status: "skipped" }
  /// The roster could not be read, so nothing was scheduled and nothing will
  /// retry. The event itself is fine — this is the one announcement failure
  /// still knowable while the coach is looking at the page.
  | { status: "failed" };

export const ADD_EVENT_INITIAL_STATE: AddEventState = { status: "idle" };

/// What survives an "Add" for the next event.
///
/// The date is always cleared: two events cannot share a start time, and a
/// stale one sitting in the box is the single most dangerous thing this form
/// could keep. Notes are cleared because they are about one occasion; type,
/// location and opponent are the fields the audit found barely change from
/// game to game (Dugout Report C1).
///
/// **The repeat count clears too, and for a sharper version of the date's
/// reason** (#70). A sticky "8" does not merely sit there looking stale — the
/// next add silently becomes eight more events, and a coach who just created a
/// season and then adds one make-up game would create eight of those. It is the
/// one field where keeping it turns a correct next submit into a wrong one.
///
/// **The announce checkbox resets to on for the same reason.** A coach who
/// added one quiet placeholder and then adds Saturday's game would otherwise
/// tell nobody about it, and the failure is silent until a family asks why
/// they never heard. Re-ticking costs one tap; an unannounced game costs the
/// thing the app exists for.
export function stickyValues(values: EventFormValues): EventFormValues {
  return {
    type: values.type,
    startsAt: "",
    location: values.location,
    opponent: values.opponent,
    notes: "",
    repeat: "",
    announce: true,
  };
}
