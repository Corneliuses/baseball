import { EmailHeading, EmailText, QuietLink } from "./EmailKit";
import { EmailLayout } from "./EmailLayout";

/// A person's own words, forwarded by the app. The sender's name leads because
/// the From address is the app's domain, not the human's; their address rides
/// in Reply-To instead, so hitting reply just works.
///
/// **This email has no banana**, and that is the rule rather than an omission.
/// design-plan.md §2 rations the yellow to one element per screen and §7 gives
/// the calm surfaces none at all — a shouting button over somebody's message
/// would be the app talking over the coach. The link at the bottom is a quiet
/// green one.

export type TeamMessageEmailProps = {
  teamName: string;
  /// The sender's display name, falling back to their email upstream — never
  /// blank, or the message reads as from nobody.
  senderName: string;
  body: string;
  teamUrl: string;
};

export function TeamMessageEmail({
  teamName,
  senderName,
  body,
  teamUrl,
}: TeamMessageEmailProps) {
  return (
    <EmailLayout
      preview={body.slice(0, 120)}
      teamName={teamName}
      footnote={`Reply to this email to answer ${senderName} directly.`}
    >
      <EmailHeading
        eyebrow="Team message"
        title={senderName}
        subtitle={teamName}
      />

      <EmailText preserveBreaks>{body}</EmailText>

      {/* No section rule above this link: the shell already draws the seam
          between the card and the footer, and on a two-line message the two
          would land an inch apart. */}
      <QuietLink href={teamUrl}>Schedule, lineup, and RSVP</QuietLink>
    </EmailLayout>
  );
}
