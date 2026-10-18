import { messageTable } from "@/lib/error-messages";

/// Every way a login with the auth service can end without a session. The
/// callback writes all of them; the login route writes `signin-failed` when it
/// cannot start a login at all.
export type SigninError =
  | "login-state"
  | "access-denied"
  | "login-required"
  | "signin-failed"
  | "account-mismatch"
  | "not-invited";

/// What `/signin` says for each `SigninError`. Typed against the union, so a
/// key the routes can write and this table lacks fails to compile rather than
/// falling back to the generic sentence.
export const SIGNIN_MESSAGES = messageTable({
  // No pending-login cookie, an expired one, or a `state` that does not match
  // it. Also the signature of an installed app whose callback runs in a
  // different cookie container from the one that started the login.
  "login-state":
    "That sign-in took too long or was started somewhere else. Please sign in again.",
  // The service's `access_denied`: the person backed out, or the service
  // itself refused the account. Worded to fit both.
  "access-denied":
    "The sign-in didn't go through. If you backed out, sign in again; if it keeps happening, ask your coach.",
  // The service needs the person to sign in there first.
  "login-required": "Please sign in again to continue.",
  // A failed code exchange, a bad id token, a database error here, or an
  // account the service has not verified or that is linked to someone else.
  "signin-failed":
    "Something went wrong signing you in, and it has been logged. Please try again.",
  // An invitation's address differs from the account the service signed in
  // (a shared phone still holding another family's sign-in).
  "account-mismatch":
    "You're signed in as someone other than the person this invitation was sent to. Use a different account to continue.",
  // The gate refused a verified address. Naming the reason is fine here: the
  // person has just proven they own the mailbox, so there is nothing to probe.
  "not-invited":
    "That account isn't on a team here. This app is invite-only — ask your coach to invite the address you signed in with.",
} satisfies Record<SigninError, string>);
