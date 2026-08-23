/// The shape `addPlayerAction` hands back to `AddPlayerForm`.
///
/// Its own module because `actions.ts` is `"use server"`, where the directive
/// marks *every* export as a server function — so a runtime constant like
/// `ADD_PLAYER_INITIAL_STATE` cannot live there. That fails at `next build`
/// rather than at `pnpm check`, which is worth a file to avoid.

/// What the coach typed, echoed back so a rejection costs them nothing. Raw
/// strings rather than parsed values: these go straight back into the inputs,
/// and a date the parser rejected still has to be redisplayed as written or the
/// coach cannot see what was wrong with it.
export interface AddPlayerValues {
  name: string;
  dateOfBirth: string;
  jerseyNumber: string;
}

/// Which input to mark and focus. Null when the failure belongs to the whole
/// form rather than one field — `already-rostered` is about the player, not
/// about any box on screen.
export type AddPlayerField = "name" | "dateOfBirth" | "jerseyNumber" | null;

export type AddPlayerState =
  | { status: "idle" }
  | {
      status: "invalid";
      /// A key into ROSTER_ERROR_MESSAGES, not a sentence: the wording lives
      /// in one table both the page and the form read, so the two cannot drift.
      code: string;
      field: AddPlayerField;
      values: AddPlayerValues;
    };

export const ADD_PLAYER_INITIAL_STATE: AddPlayerState = { status: "idle" };
