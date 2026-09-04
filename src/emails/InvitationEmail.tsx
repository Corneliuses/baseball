import {
  BananaButton,
  EmailHeading,
  EmailText,
  LinkFallback,
  NoteBlock,
} from "./EmailKit";
import { EmailLayout } from "./EmailLayout";

/// The coach's very first message to a parent who has never used the app, and
/// therefore the one email that is doing brand work as well as errand work:
/// whatever this looks like is what the parent expects the app to look like.
///
/// Still no images and still one action. The flare is in the stock and the
/// type — see `brand.ts` — not in anything that has to load.
///
/// **This email spends its banana on Accept.** There is exactly one thing to do
/// with an invitation, the whole message is scaffolding around it, and the URL
/// stays repeated as plain text underneath for clients that strip links.

export type InvitationEmailProps = {
  teamName: string;
  acceptUrl: string;
  expiresAt: Date;
  /// A note the coach typed for this batch of invitations. Lives only in the
  /// email — deliberately not stored on `Invitation`, so there is no message
  /// column and nothing to render on the accept page.
  message?: string;
};

function formatExpiry(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function InvitationEmail({
  teamName,
  acceptUrl,
  expiresAt,
  message,
}: InvitationEmailProps) {
  return (
    <EmailLayout
      preview={`You're invited to join ${teamName}`}
      teamName={teamName}
      footnote={`Someone coaching ${teamName} sent this invitation to your email address.`}
    >
      <EmailHeading
        eyebrow="You're invited"
        title={`Join ${teamName}`}
        subtitle="Schedule, RSVPs, and the batting order — in one place, on your phone."
      />

      {message ? <NoteBlock>{message}</NoteBlock> : null}

      <BananaButton href={acceptUrl}>Accept invitation</BananaButton>
      <LinkFallback href={acceptUrl} />

      <EmailText quiet>
        {`This invitation expires on ${formatExpiry(expiresAt)}.`}
      </EmailText>
    </EmailLayout>
  );
}
