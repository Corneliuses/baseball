import Resend from "next-auth/providers/resend";

import { SignInCodeEmail } from "@/emails/SignInCodeEmail";
import { buildSignInCodeEmail } from "@/emails/signin-code-email";
import { sendEmail } from "@/lib/email";
import {
  SIGNIN_CODE_MAX_AGE_SECONDS,
  generateSignInCode,
} from "@/lib/signin-code";

/// Wraps Auth.js's Resend provider so RESEND_API_KEY/EMAIL_FROM are demanded
/// only when a sign-in email is actually about to be sent, not on every
/// page view. Building the provider object is inert — Resend() just
/// assembles config, it makes no network call — so passing possibly-empty
/// strings is safe; sendVerificationRequest is the one place those values
/// are read to make a request, which is why the checks live in this
/// wrapper's send path.
///
/// Since #60 the email carries a **typed code, not a link**. A link is
/// redeemed by whichever browser the OS hands it to, and an installed PWA
/// and that browser can hold separate cookie jars (hit for real on Android;
/// the designed-for case on iOS) — the session then lands where the app
/// cannot read it, every time. So `generateVerificationToken` supplies the
/// code as the verification token, `maxAge` shortens its life to match, and
/// `sendVerificationRequest` is replaced outright: the provider's default
/// mails a link built from the callback URL, and there must be nothing in
/// the email to follow — code *and* link would be the same token, so a mail
/// scanner following the link would burn the code too.
///
/// Lives outside src/auth.ts, which is otherwise deliberately thin: this
/// file avoids the top-level `next-auth` package import (only the
/// `next-auth/providers/resend` submodule), because next-auth's main entry
/// pulls in `next/server`, which fails to resolve outside Next's own
/// bundler — see the module resolution error importing `./auth` directly
/// used to hit under Vitest. That constraint is what makes this function
/// testable at all.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set — see .env.example`);
  }
  return value;
}

export function resendProvider() {
  const provider = Resend({
    apiKey: process.env.RESEND_API_KEY ?? "",
    // Must be explicit. The provider's default `from` is an authjs.dev address
    // that this project does not control, and mail from an unverified domain
    // is the difference between parents seeing sign-in codes and never finding
    // them.
    from: process.env.EMAIL_FROM ?? "",
  });

  return {
    ...provider,
    // The raw token Auth.js hashes, stores, and later matches against
    // `?token=` — which `submitSignInCode` builds from what the person typed.
    // Canonical form (no dash); the email formats it for reading.
    generateVerificationToken: generateSignInCode,
    maxAge: SIGNIN_CODE_MAX_AGE_SECONDS,
    async sendVerificationRequest(
      params: Parameters<typeof provider.sendVerificationRequest>[0],
    ) {
      requireEnv("RESEND_API_KEY");
      requireEnv("EMAIL_FROM");

      const content = buildSignInCodeEmail({ code: params.token });
      const result = await sendEmail({
        to: params.identifier,
        subject: content.subject,
        react: SignInCodeEmail({
          formattedCode: content.formattedCode,
          expiresMinutes: content.expiresMinutes,
        }),
      });

      // Throw rather than return: Auth.js treats a resolved
      // sendVerificationRequest as "sent", and the person is about to stare
      // at a code-entry form. The signin action catches this, logs it, and
      // still lands on the same page — the failure posture is unchanged.
      if (!result.ok) {
        throw new Error(`Sign-in code email failed to send: ${result.reason}`);
      }
    },
  };
}
