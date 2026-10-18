"use server";

import { cookies, headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";

import {
  acceptInvitations,
  getInvitationByToken,
  resolveInvitedUser,
} from "@/lib/invitations";
import { isLiveInvitation } from "@/lib/invitation-token";
import { beginLogin } from "@/lib/login-start";
import { usesSecureCookies } from "@/lib/session-cookie";

/**
 * Accept an invitation: grant the memberships it carries, then send the
 * parent to the auth service to sign in as the invited address.
 *
 * The token proves the person holds the invited mailbox, so the grant happens
 * here, through `acceptInvitations` — the same idempotent write the sign-in
 * callback runs, so there is still one grant path. The session does not: the
 * callback is the only writer of the session cookie. Accepting starts a login
 * with `login_hint` set to the invited address, which pre-fills the service's
 * form and makes the callback refuse a login as anyone else
 * (`account-mismatch`), so a shared phone still holding another family's
 * sign-in cannot quietly land the wrong person on this team. On the way back,
 * the gate admits them through the Membership granted here.
 *
 * The redirect goes to another origin, which Next answers with a full browser
 * navigation, so the pending-login cookie set here travels on the action's own
 * response. A same-origin redirect would not work: Next fetches that target
 * server-side, and a cookie set by it never reaches the browser.
 *
 * This is a POST for a reason. Accepting consumes the invitation, and
 * corporate mail scanners follow every link in a message before the recipient
 * sees it: on GET, the scanner would burn the invitation and the parent would
 * arrive to "Already accepted" with nothing to do but sign in.
 */
export async function acceptInvitationAction(formData: FormData) {
  const token = String(formData.get("token")).trim();
  if (!token || token === "null" || token === "undefined") {
    throw new Error("Invalid invitation token");
  }

  // Set only once everything below has succeeded, so any failure leaves the
  // parent on the invite page with an error rather than mid-login.
  let destination = `/invite/${token}?error=1`;

  // One instant for the decision and for every write it authorizes. Each
  // function below takes `now` precisely so its caller can pin it; reading the
  // clock separately in each would let the invitation be live when it is
  // checked and expired by the time `acceptInvitations` filters on
  // `expiresAt`, which grants no Membership and sends an invited coach into a
  // login the gate then refuses.
  const now = new Date();

  try {
    const invitation = await getInvitationByToken(token);

    // Re-checked rather than trusted from the page render: seconds pass
    // between the page loading and this submitting, and the invitation can
    // expire or be revoked in between.
    if (!invitation || !isLiveInvitation(invitation, now)) {
      redirect(`/invite/${token}`);
    }

    const user = await resolveInvitedUser(invitation.email, now);

    // Order matters. The grant goes first, because the invitation it consumes
    // stops counting for the gate once accepted: the Membership written here
    // is what admits the login below.
    //
    // A shared `now` cannot close the read-then-write gap itself: a coach
    // revoking the invitation between the read above and this write still
    // consumes nothing. That is knowingly left open rather than half-guarded.
    // Bailing when the count is zero would be wrong — a parent's Membership is
    // created by `linkGuardian` when they are first linked, so revoking their
    // invitation leaves them genuinely entitled to the team, and a count check
    // would lock out the common case to catch a millisecond of the rare one.
    await acceptInvitations(user.id, user.email, now);

    // The invitation is spent from here on, so a failure below must not send
    // the parent back to "try again" on a page that will now say "Already
    // accepted". Their Membership admits them from `/signin`, and the
    // destination rides along so they still land on the team.
    destination = `/signin?${new URLSearchParams({
      error: "signin-failed",
      callbackUrl: `/t/${invitation.teamId}`,
    })}`;

    const secure = usesSecureCookies({
      authUrl: process.env.AUTH_URL,
      forwardedProto: (await headers()).get("x-forwarded-proto"),
    });
    // `prompt=login` because the service only pre-fills `login_hint`; over a
    // live single-sign-on session it would sign in whoever that session
    // belongs to, and on a shared family tablet that is the other parent,
    // which the callback then refuses as `account-mismatch`. Accepting is a
    // one-time step, so asking once more on a device already signed in is the
    // cheaper failure.
    const { authorizeUrl, cookie } = await beginLogin({
      returnTo: `/t/${invitation.teamId}`,
      loginHint: user.email,
      prompt: "login",
      secure,
      now,
    });

    const cookieStore = await cookies();
    cookieStore.set(cookie.name, cookie.value, cookie.options);

    destination = authorizeUrl;
  } catch (error) {
    // Next implements redirect() by throwing; never swallow that.
    unstable_rethrow(error);

    // Logged with the reason server-side; the parent sees only that it did not
    // work. Before the grant they can try again or ask their coach for a fresh
    // invite; after it, they are on `/signin` with the team as the destination.
    console.error("Invitation acceptance failed:", error);
  }

  redirect(destination);
}
