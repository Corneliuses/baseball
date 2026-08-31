import { messageTable } from "@/lib/error-messages";

/// What the code-entry screen says when a code does not go through.
///
/// Shared by the form (which gets a typed state back from the action) and by
/// the page (which gets `?error=wrong-code` after Auth.js rejects a redeem),
/// so the same failure reads the same way whichever route it arrives by.
/// Same reasoning as `roster-messages.ts`.
export const CODE_ENTRY_MESSAGES = messageTable({
  "invalid-code":
    "That doesn't look like a code — it's 8 letters and numbers, like K3M7-QP2X.",
  // Deliberately says the mailed code still works: Auth.js's `Verification`
  // covers "wrong" and "expired" alike, and this message is only ever shown
  // while the pending cookie — which expires with the code — is still alive.
  // Sending someone back to request a second email is the waste this avoids.
  "wrong-code":
    "That code didn't match. Check it and type it again — the code we emailed you still works.",
});
