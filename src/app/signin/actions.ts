"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { signIn } from "@/auth";
import { safeCallbackUrl } from "@/lib/callback-url";

const emailSchema = z.email();

/**
 * Request a magic link.
 *
 * Every path that gets as far as a well-formed address ends on the same page,
 * whether or not a link was actually sent. This form is the app's only
 * unauthenticated POST surface, and an explicit "that address isn't invited"
 * would turn it into a way to test which families are on a team. The gate in
 * src/auth.ts declines silently, and no mail leaves for an uninvited address.
 */
export async function requestSignInLink(formData: FormData) {
  const parsed = emailSchema.safeParse(formData.get("email"));

  // A malformed address is a typo, not a probe: saying so reveals nothing and
  // saves a parent from staring at an inbox that will stay empty.
  if (!parsed.success) {
    redirect("/signin?error=invalid-email");
  }

  const callbackUrl = safeCallbackUrl(formData.get("callbackUrl"));

  try {
    await signIn("resend", {
      email: parsed.data,
      redirectTo: callbackUrl,
      redirect: false,
    });
  } catch (error) {
    // Next implements redirect() by throwing; never swallow that.
    unstable_rethrow(error);

    // Everything else — a denied gate (AccessDenied), a Resend outage, a
    // missing env var — is logged server-side and hidden from the visitor.
    console.warn("Sign-in link not sent:", error);
  }

  redirect("/signin/check-email");
}
