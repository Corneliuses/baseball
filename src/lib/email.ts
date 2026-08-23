import type { ReactElement } from "react";
import { Resend } from "resend";

/// Thin Resend wrapper, reused by every outbound email in the app —
/// invitations here, coach broadcasts in #13.
///
/// `RESEND_API_KEY` and `EMAIL_FROM` are read inside `sendEmail`, not at
/// module scope, mirroring src/auth.ts's lazy config: the build must not
/// require secrets, and a missing key should fail when someone actually
/// tries to send, not at import time.
///
/// `List-Unsubscribe` is opt-in per send rather than applied to everything,
/// because it is a claim about the mail and not a courtesy: RFC 2369 says
/// the header describes a *list* the recipient belongs to. An invitation is
/// addressed to someone who is not on the team yet, and the two one-to-one
/// message shapes are ordinary correspondence — a coach mailing one parent,
/// or a parent mailing the staff. Only the all-parents broadcast is list
/// mail, and only it sets the header.
///
/// Deliberately mailto and not RFC 8058 one-click: one-click needs an
/// unauthenticated HTTPS POST endpoint and somewhere to record the
/// suppression, which would let a parent silently drop themselves off
/// "tonight is cancelled". Routing an unsubscribe to a human who can ask
/// why is the safer default for a team of twenty-five. Revisit only with a
/// deliberate decision about that failure mode.

export type SendEmailInput = {
  to: string;
  subject: string;
  react: ReactElement;
  /// The human whose message this is. Everything goes out from EMAIL_FROM
  /// (the verified domain), so without this a recipient's reply mails a
  /// void — set it and the reply becomes ordinary person-to-person email.
  replyTo?: string;
  /// An address a recipient can mail to stop receiving this kind of message,
  /// set only by senders that fan one body out to a whole audience. Pass the
  /// bare address; the RFC 2369 framing is this module's job, so callers do
  /// not hand-build a mail header. Omitting it is the right call for
  /// one-to-one and transactional mail — see the note above `sendEmail`.
  listUnsubscribe?: string;
};

export type SendEmailResult = { ok: true } | { ok: false; reason: string };

function requireEnv(name: string): string | null {
  const value = process.env[name];
  return value ? value : null;
}

/// RFC 2369: the value is a URL in angle brackets. The address comes from a
/// stored `User.email`, never from a form.
function listUnsubscribeHeader(address: string): Record<string, string> {
  return { "List-Unsubscribe": `<mailto:${address}?subject=Unsubscribe>` };
}

export async function sendEmail({
  to,
  subject,
  react,
  replyTo,
  listUnsubscribe,
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
      ...(listUnsubscribe
        ? { headers: listUnsubscribeHeader(listUnsubscribe) }
        : {}),
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
