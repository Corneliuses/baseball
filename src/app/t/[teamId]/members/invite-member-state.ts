/// The shape `inviteMemberAction` hands back to `InviteMemberForm`.
///
/// Its own module because `actions.ts` is `"use server"`, where the directive
/// marks every export as a server function — a runtime constant there fails at
/// `next build` rather than at `pnpm check`.

export interface InviteMemberValues {
  email: string;
  role: string;
}

export type InviteMemberState =
  | { status: "idle" }
  | {
      status: "invalid";
      /// A key into the members page's message table, not a sentence.
      code: string;
      values: InviteMemberValues;
    };

export const INVITE_MEMBER_INITIAL_STATE: InviteMemberState = { status: "idle" };
