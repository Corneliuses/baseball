/// The shape `submitSignInCode` hands back to `CodeEntryForm`.
///
/// Its own module because `actions.ts` is `"use server"`, where the directive
/// marks *every* export as a server function — so a runtime constant like
/// `CHECK_EMAIL_INITIAL_STATE` cannot live there. That fails at `next build`
/// rather than at `pnpm check`, which is worth a file to avoid.

export type CheckEmailState =
  | { status: "idle" }
  | {
      status: "invalid";
      /// A key into `CODE_ENTRY_MESSAGES`, not a sentence: the wording lives
      /// in one table the page and the form both read, so a redirect-borne
      /// failure and an in-form one cannot drift apart.
      code: string;
      /// Exactly what was typed, echoed back. Eight characters is short, but
      /// retyping all of them because one was wrong is the failure this
      /// state exists to prevent — and on a phone, mid-code, it is the point
      /// where people give up.
      value: string;
    };

export const CHECK_EMAIL_INITIAL_STATE: CheckEmailState = { status: "idle" };
