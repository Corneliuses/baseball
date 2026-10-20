/// The shape `createTeamAction` hands back to `NewTeamForm`.
///
/// Its own module because `actions.ts` is `"use server"`, where the directive
/// marks *every* export as a server function — so a runtime constant like
/// `NEW_TEAM_INITIAL_STATE` cannot live there. That fails at `next build`
/// rather than at `pnpm check`, which is worth a file to avoid.

/// What the owner typed, echoed back so a rejection costs them nothing. Raw
/// strings rather than parsed values: these go straight back into the inputs.
/// `sport` is whatever radio was posted, which may be empty (nothing picked)
/// or a value the schema refused; the form only re-checks a radio that
/// matches. `allPlay` is the checkbox's own state.
export interface NewTeamValues {
  name: string;
  season: string;
  sport: string;
  allPlay: boolean;
}

/// Which input to mark and describe. Every failure this form can produce
/// belongs to exactly one field, so there is no null case.
export type NewTeamField = "name" | "sport";

export type NewTeamState =
  | { status: "idle" }
  | {
      status: "invalid";
      /// A key into NEW_TEAM_ERROR_MESSAGES, not a sentence: the wording lives
      /// in one table both the page and the form read, so the two cannot drift.
      code: string;
      field: NewTeamField;
      values: NewTeamValues;
    };

export const NEW_TEAM_INITIAL_STATE: NewTeamState = { status: "idle" };
