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
    }
  /// Somebody by this exact name already exists, and the coach has not yet
  /// said whether that is the same child. Nothing has been written.
  ///
  /// A question, not a rejection: two kids on one team really can share a
  /// name. The form offers "Add anyway", which resubmits with `force` set,
  /// and — when the match is a past player — a link to the returning-player
  /// picker, which reuses the existing Player and carries their guardians
  /// across instead of creating a second child by the same name.
  | {
      status: "duplicate-name";
      match: { kind: "rostered" | "returning"; name: string };
      values: AddPlayerValues;
    };

export const ADD_PLAYER_INITIAL_STATE: AddPlayerState = { status: "idle" };
