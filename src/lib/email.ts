import type { ReactElement } from "react";
import { Resend } from "resend";

/// Thin Resend wrapper, reused by every outbound email in the app —
/// invitations here, coach broadcasts in #13.
///
/// `RESEND_API_KEY` and `EMAIL_FROM` are read inside `sendEmail`, not at
/// module scope, mirroring src/auth.ts's lazy config: the build must not
/// require secrets, and a missing key should fail when someone actually
/// tries to send, not at import time.

export type SendEmailInput = {
  to: string;
  subject: string;
  react: ReactElement;
  /// The human whose message this is. Everything goes out from EMAIL_FROM
  /// (the verified domain), so without this a recipient's reply mails a
  /// void — set it and the reply becomes ordinary person-to-person email.
  replyTo?: string;
};

export type SendEmailResult = { ok: true } | { ok: false; reason: string };

function requireEnv(name: string): string | null {
  const value = process.env[name];
  return value ? value : null;
}

export async function sendEmail({
  to,
  subject,
  react,
  replyTo,
}: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = requireEnv("RESEND_API_KEY");
  const from = requireEnv("EMAIL_FROM");

  if (!apiKey || !from) {
    const reason = "RESEND_API_KEY or EMAIL_FROM is not set — see .env.example";
    console.error(reason);
    return { ok: false, reason };
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      react,
      ...(replyTo ? { replyTo } : {}),
    });

    if (error) {
      console.error("Failed to send email:", error.message);
      return { ok: false, reason: error.message };
    }

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to send email:", message);
    return { ok: false, reason: message };
  }
}
