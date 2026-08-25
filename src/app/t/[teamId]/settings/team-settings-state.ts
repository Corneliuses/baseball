/// The shape `updateTeamAction` hands back to `TeamDetailsForm`.
///
/// Its own module because `actions.ts` is `"use server"`, where the directive
/// marks *every* export as a server function — so a runtime constant like
/// `TEAM_SETTINGS_INITIAL_STATE` cannot live there. That fails at
/// `next build` rather than at `pnpm check`, which is worth a file to avoid.

/// What the owner typed, echoed back so a rejection costs them nothing.
/// Raw strings rather than parsed values: these go straight back into the
/// inputs, and a link the checker rejected still has to be redisplayed as
/// pasted or the owner cannot see what was wrong with it. `allPlay` is the
/// checkbox's own state and is the one genuinely boolean field.
export interface TeamSettingsValues {
  name: string;
  season: string;
  allPlay: boolean;
  groupMeUrl: string;
}

/// Which input to mark and describe. Every failure this form can produce
/// belongs to exactly one box, so unlike AddPlayerForm there is no null case.
export type TeamSettingsField = "name" | "groupMeUrl";

export type TeamSettingsState =
  | { status: "idle" }
  | {
      status: "invalid";
      /// A key into SETTINGS_ERROR_MESSAGES, not a sentence: the wording lives
      /// in one table both the page and the form read, so the two cannot drift.
      code: string;
      field: TeamSettingsField;
      values: TeamSettingsValues;
    };

export const TEAM_SETTINGS_INITIAL_STATE: TeamSettingsState = { status: "idle" };
