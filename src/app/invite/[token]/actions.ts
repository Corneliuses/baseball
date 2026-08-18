"use server";

import { cookies, headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";

import {
  acceptInvitations,
  getInvitationByToken,
  resolveInvitedUser,
} from "@/lib/invitations";
import { isLiveInvitation } from "@/lib/invitation-token";
import {
  sessionCookieName,
  sessionCookieOptions,
  usesSecureCookies,
} from "@/lib/session-cookie";
import { createUserSession } from "@/lib/sessions";

/**
 * Accept an invitation: grant the memberships it carries and sign the parent
 * in on this device, right now.
 *
 * The token is the credential. It was mailed to the invited address and
 * nowhere else, which is the same proof of mailbox possession a magic link
 * gives — so sending a second email to establish the session bought no
 * security and cost the app every parent who did not go back to their inbox a
 * second time. This revises design-doc.md #4 Decision 1, which chose the
 * two-step flow on the grounds that `acceptInvitations` was the one place
 * memberships are granted. That still holds: this action calls the same
 * function Auth.js's `events.signIn` calls, so there is still one grant path.
 * What changes is only where the session comes from.
 *
 * The magic link is not gone — it is what `/signin` still sends, and a parent
 * whose session lapses next season signs in that way, admitted by the
 * Membership this action created.
 *
 * This is a POST for a reason. Accepting consumes the invitation, and
 * corporate mail scanners follow every link in a message before the recipient
 * sees it: on GET, the scanner would burn the invitation and the parent would
 * arrive to "Already accepted" with no way in.
 */
export async function acceptInvitationAction(formData: FormData) {
  const token = String(formData.get("token")).trim();
  if (!token || token === "null" || token === "undefined") {
    throw new Error("Invalid invitation token");
  }

  // Set only once everything below has succeeded, so any failure leaves the
  // parent on the invite page with an error rather than at a team URL they
  // have no session for.
  let destination = `/invite/${token}?error=1`;

  try {
    const invitation = await getInvitationByToken(token);

    // Re-checked rather than trusted from the page render: seconds pass
    // between the page loading and this submitting, and the invitation can
    // expire or be revoked in between.
    if (!invitation || !isLiveInvitation(invitation, new Date())) {
      redirect(`/invite/${token}`);
    }

    const user = await resolveInvitedUser(invitation.email);

    // Order matters. This is the same idempotent write Auth.js runs from
    // `events.signIn`, and it goes first: if the session insert below fails,
    // the parent is already a member and `/signin` will let them in, whereas
    // the reverse would sign them in with no team to land on.
    await acceptInvitations(user.id, user.email);

    const session = await createUserSession(user.id);
    const secure = usesSecureCookies({
      authUrl: process.env.AUTH_URL,
      forwardedProto: (await headers()).get("x-forwarded-proto"),
    });

    const cookieStore = await cookies();
    cookieStore.set(
      sessionCookieName(secure),
      session.sessionToken,
      sessionCookieOptions(secure, session.expires),
    );

    destination = `/t/${invitation.teamId}`;
  } catch (error) {
    // Next implements redirect() by throwing; never swallow that.
    unstable_rethrow(error);

    // Logged with the reason server-side; the parent sees only that it did not
    // work, and can try again or ask their coach for a fresh invite.
    console.error("Invitation acceptance failed:", error);
  }

  redirect(destination);
}
