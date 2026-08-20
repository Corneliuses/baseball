import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Text,
} from "@react-email/components";

/// Plain on purpose, like InvitationEmail — no images, the message itself is
/// the point. The sender's name leads because the From address is the app's
/// domain, not the human's; their address rides in Reply-To instead, so
/// hitting reply just works.

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
    <Html>
      <Head />
      <Preview>{body.slice(0, 120)}</Preview>
      <Body style={{ fontFamily: "sans-serif", padding: "24px" }}>
        <Container>
          <Text>
            {senderName} — {teamName}
          </Text>
          <Text style={{ whiteSpace: "pre-wrap" }}>{body}</Text>
          <Hr />
          <Text>
            Schedule, lineup, and RSVP: <Link href={teamUrl}>{teamUrl}</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
