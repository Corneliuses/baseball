import { messageTable } from "@/lib/error-messages";

/// The create-team page's failure vocabulary, in one place because two things
/// read it: the page, for the codes that still arrive as `?error=` (`access`
/// and `create-failed`, which redirect), and `NewTeamForm`, whose action
/// returns a code as form state instead of redirecting so the owner keeps what
/// they typed.
///
/// `messageTable`, never a bare object literal — see src/lib/error-messages.ts.
export const NEW_TEAM_ERROR_MESSAGES = messageTable({
  "invalid-name": "Team name is required.",
  "invalid-sport": "Choose a sport.",
  "create-failed": "Something went wrong creating the team. Try again.",
  access: "You don't have access to create a team.",
});
