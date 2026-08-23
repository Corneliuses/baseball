/// The shape `sendTeamMessageAction` hands back to `ComposeForm`.
///
/// Its own module because `actions.ts` is `"use server"`, where the directive
/// marks every export as a server function — a runtime constant there fails at
/// `next build`, not at `pnpm check`.

/// What the coach (or parent) had written when the send was refused. The body
/// can be five thousand characters; losing it to a mistyped subject was the
/// most expensive instance of C5 in the app.
export interface ComposeValues {
  audience: string;
  targetUserId: string;
  subject: string;
  body: string;
}

export type ComposeField = "audience" | "subject" | "body" | null;

export type ComposeState =
  | { status: "idle" }
  | {
      status: "invalid";
      /// A key into the compose page's message table, not a sentence, so the
      /// wording lives in one place for both this form and the `?error=` path.
      code: string;
      field: ComposeField;
      values: ComposeValues;
    };

export const COMPOSE_INITIAL_STATE: ComposeState = { status: "idle" };
