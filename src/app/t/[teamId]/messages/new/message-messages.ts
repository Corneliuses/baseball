import { messageTable } from "@/lib/error-messages";

/// The compose form's failure vocabulary, in one place because both the page
/// (for `?error=access`) and `ComposeForm` (for everything the action now
/// returns as state) read it.
///
/// `messageTable`, never a bare object literal — see src/lib/error-messages.ts.
export const COMPOSE_ERROR_MESSAGES = messageTable({
  "invalid-audience": "Choose who this message goes to. Nothing was sent.",
  "invalid-subject": "Enter a subject — keep it under 200 characters.",
  "invalid-body": "Enter a message — keep it under 5,000 characters.",
  "forbidden-audience": "You can't message that group. Nothing was sent.",
  // Covers both "no parent chosen" and "chosen parent isn't on this team" —
  // resolveRecipients returns the same reason for both, so the copy commits
  // to neither.
  "invalid-target": "Choose a parent to message. Nothing was sent.",
  "no-recipients": "There's nobody in that group to email yet.",
  "too-many":
    "That's more than 30 recipients for one send. Nothing was sent — message a smaller group.",
  access: "You no longer have access to send this.",
});
