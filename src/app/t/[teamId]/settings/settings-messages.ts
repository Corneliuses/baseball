import { messageTable } from "@/lib/error-messages";

/// The settings page's failure vocabulary, in one place because two things
/// read it: the page, for the `access` code that still arrives as `?error=`
/// (archiving and unarchiving redirect), and `TeamDetailsForm`, whose action
/// returns a code as form state instead of redirecting so the owner keeps
/// what they typed.
///
/// `messageTable`, never a bare object literal — see src/lib/error-messages.ts.
/// A `?error=` key is attacker-chosen, and on a plain literal
/// `?error=constructor` resolves an Object.prototype member and crashes the
/// page on the way out.
export const SETTINGS_ERROR_MESSAGES = messageTable({
  "invalid-name": "Team name is required.",
  "invalid-groupme":
    "That doesn't look like a GroupMe invite link. Open the group in GroupMe, tap Share, and paste that link — it looks like https://groupme.com/join_group/…",
  access: "You no longer have access to make this change.",
});
