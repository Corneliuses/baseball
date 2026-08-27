"use server";

import { cookies, headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { signIn } from "@/auth";
import { safeCallbackUrl } from "@/lib/callback-url";
import {
  PENDING_SIGNIN_COOKIE_NAMES,
  normalizeSignInEmail,
  parsePendingSignIn,
  pendingSignInCookieName,
  pendingSignInCookieOptions,
  serializePendingSignIn,
} from "@/lib/pending-signin-cookie";
import { usesSecureCookies } from "@/lib/session-cookie";
import { normalizeSignInCode } from "@/lib/signin-code";

const emailSchema = z.email();

/**
 * Request a sign-in code (#60 — a typed code, not a tapped link, because the
 * link is redeemed by whichever browser the OS picks and that is not always
 * the container the person is standing in).
 *
 * Every path that gets as far as a well-formed address ends on the same page,
 * whether or not a code was actually sent. This form is the app's only
 * unauthenticated POST surface, and an explicit "that address isn't invited"
 * would turn it into a way to test which families are on a team. The gate in
 * src/auth.ts declines silently, and no mail leaves for an uninvited address.
 * The pending cookie is set on every path for the same reason — its absence
 * must not say anything either.
 */
export async function requestSignInCode(formData: FormData) {
  const parsed = emailSchema.safeParse(formData.get("email"));

  // A malformed address is a typo, not a probe: saying so reveals nothing and
  // saves a parent from staring at an inbox that will stay empty.
  if (!parsed.success) {
    redirect("/signin?error=invalid-email");
  }

  const callbackUrl = safeCallbackUrl(formData.get("callbackUrl"));

  // The spelling Auth.js stores the verification token under — the cookie
  // must hold the same one, or the typed code looks up the wrong row.
  const email = normalizeSignInEmail(parsed.data);

  try {
    await signIn("resend", {
      email,
      redirectTo: callbackUrl,
      redirect: false,
    });
  } catch (error) {
    // Next implements redirect() by throwing; never swallow that.
    unstable_rethrow(error);

    // Everything else — a denied gate (AccessDenied), a Resend outage, a
    // missing env var — is logged server-side and hidden from the visitor.
    console.warn("Sign-in code not sent:", error);
  }

  const secure = usesSecureCookies({
    authUrl: process.env.AUTH_URL,
    forwardedProto: (await headers()).get("x-forwarded-proto"),
  });

  (await cookies()).set(
    pendingSignInCookieName(secure),
    serializePendingSignIn({ email, callbackUrl }),
    pendingSignInCookieOptions(secure),
  );

  redirect("/signin/check-email");
}

/**
 * Redeem a typed code.
 *
 * This action's whole job is to rebuild the URL a magic link used to carry
 * and send the browser there: Auth.js's email callback verifies
 * `?token=&email=` without caring whether they arrived from a clicked link or
 * a form — the hash, the gate in src/auth.ts, the `signIn` event and the
 * session cookie all run exactly as before. Owning more of the flow than this
 * (a bespoke code table, a direct session write) would duplicate the gate and
 * the invitation wiring into a second sign-in path — see #60.
 *
 * A wrong-but-well-formed code fails inside Auth.js and lands on
 * /signin?error=Verification; a mistyped one is caught here and returns to
 * the entry form. Neither reveals whether the address is invited, and neither
 * burns the real code — `useVerificationToken` deletes the row only on a
 * successful match.
 */
export async function submitSignInCode(formData: FormData) {
  const cookieStore = await cookies();
  const raw = PENDING_SIGNIN_COOKIE_NAMES.map(
    (name) => cookieStore.get(name)?.value,
  ).find((value) => value !== undefined);

  const pending = parsePendingSignIn(raw);
  if (!pending) {
    // The cookie and the code expire together, so no address here means no
    // live code to redeem — start over rather than invite a doomed submit.
    redirect("/signin?error=code-expired");
  }

  const code = normalizeSignInCode(formData.get("code"));
  if (!code) {
    redirect("/signin/check-email?error=invalid-code");
  }

  redirect(
    `/api/auth/callback/resend?${new URLSearchParams({
      token: code,
      email: pending.email,
      callbackUrl: pending.callbackUrl,
    })}`,
  );
}
