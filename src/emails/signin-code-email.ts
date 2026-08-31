import {
  SIGNIN_CODE_MAX_AGE_SECONDS,
  formatSignInCode,
} from "@/lib/signin-code";

/// Pure — builds the subject and display form of a sign-in code email without
/// touching Resend or React Email, matching every other builder in this
/// directory.
///
/// The code goes in the subject on purpose: it shows in the notification
/// shade, so a parent can read it there and type it into the app without ever
/// leaving it — the exact screen-to-screen trip this email exists for. The
/// exposure is a ten-minute, single-purpose credential on a surface that
/// already implies possession of the inbox.

export type BuildSignInCodeEmailInput = {
  /// Canonical form, exactly as generated — formatting is this builder's job.
  code: string;
};

export type SignInCodeEmailContent = {
  subject: string;
  formattedCode: string;
  expiresMinutes: number;
};

export function buildSignInCodeEmail({
  code,
}: BuildSignInCodeEmailInput): SignInCodeEmailContent {
  const formattedCode = formatSignInCode(code);
  return {
    subject: `${formattedCode} is your sign-in code`,
    formattedCode,
    expiresMinutes: Math.round(SIGNIN_CODE_MAX_AGE_SECONDS / 60),
  };
}
