import { messageTable } from "@/lib/error-messages";

/// The roster page's failure vocabulary, in one place because two things now
/// read it: the page itself, for the codes that still arrive as `?error=`
/// (lost access, and the returning-player flow, which redirects here), and
/// `AddPlayerForm`, whose action returns a code as form state instead of
/// redirecting so the coach keeps what they typed.
///
/// One table rather than two copies of the same sentences: the alternative was
/// the action returning prose, which puts the wording of a failure in a
/// `"use server"` module and the wording of the same failure in a page, free to
/// drift apart.
///
/// `messageTable`, never a bare object literal — see src/lib/error-messages.ts.
/// A `?error=` key is attacker-chosen, and on a plain literal
/// `?error=constructor` resolves an Object.prototype member and crashes the
/// page on the way out.
export const ROSTER_ERROR_MESSAGES = messageTable({
  "invalid-name": "Player name is required.",
  "invalid-dob": "Enter a valid date, or leave it blank.",
  "invalid-jersey": "Jersey number must be a whole number between 0 and 99.",
  "jersey-taken": "That jersey number is already in use on this team.",
  "already-rostered": "That player is already on this team's roster.",
  "email-failed": "The player was added, but a notice email could not be sent.",
  access: "You no longer have access to make this change.",
});
