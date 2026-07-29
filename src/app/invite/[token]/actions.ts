"use server";

import { redirect, unstable_rethrow } from "next/navigation";

import { signIn } from "@/auth";
import { getInvitationByToken } from "@/lib/invitations";
import { isLiveInvitation } from "@/lib/invitation-token";

/**
 * Send the magic link for a live invitation.
 *
 * The address comes from the invitation row, never from the form — this is
 * what keeps an unauthenticated page from being a way to mail a stranger.
 * Liveness is re-checked here rather than trusted from the page render:
 * seconds can pass between the page loading and this submitting, and the
 * token could expire or be revoked in between.
 *
 * Granting the Membership itself is NOT this action's job — that already
 * happens, idempotently, in acceptInvitations via Auth.js's events.signIn
 * once the emailed link is actually clicked. See design-doc.md #4
 * Decision 1.
 */
export async function requestInvitationLinkAction(formData: FormData) {
  const token = String(formData.get("token")).trim();
  if (!token || token === "null" || token === "undefined") {
    throw new Error("Invalid invitation token");
  }

  try {
    const invitation = await getInvitationByToken(token);

    if (!invitation || !isLiveInvitation(invitation, new Date())) {
      redirect(`/invite/${token}`);
    }

    await signIn("resend", {
      email: invitation.email,
      redirectTo: `/t/${invitation.teamId}`,
      redirect: false,
    });
  } catch (error) {
    // Next implements redirect() by throwing; never swallow that.
    unstable_rethrow(error);

    // A Resend outage or missing env var is logged server-side and hidden
    // from the visitor, matching src/app/signin/actions.ts.
    console.warn("Invitation sign-in link not sent:", error);
  }

  redirect(`/invite/${token}?sent=1`);
}
