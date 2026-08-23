import { messageTable } from "@/lib/error-messages";

/// The members page's failure vocabulary, in one place because both the page
/// (for the codes that still arrive as `?error=`) and `InviteMemberForm` (for
/// the ones its action now returns as state) read it.
///
/// `messageTable`, never a bare object literal — see src/lib/error-messages.ts.
export const MEMBER_ERROR_MESSAGES = messageTable({
  "invalid-invite": "Enter a valid email and choose a role.",
  "invalid-role": "Choose a valid role.",
  "email-failed": "The invitation could not be sent. Try again.",
  "last-owner": "This team must always have at least one owner.",
  access: "You no longer have access to make this change.",
});
