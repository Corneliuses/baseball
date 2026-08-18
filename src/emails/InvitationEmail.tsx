import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Text,
} from "@react-email/components";

/// Plain and short on purpose — no images, a single button, and the URL
/// repeated as visible text for mail clients that strip links. This is the
/// coach's very first message to a parent who has never used the app.

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
    <Html>
      <Head />
      <Preview>You&apos;re invited to join {teamName}</Preview>
      <Body style={{ fontFamily: "sans-serif", padding: "24px" }}>
        <Container>
          <Text>You&apos;ve been invited to join {teamName}.</Text>
          {message ? (
            <Text style={{ whiteSpace: "pre-wrap" }}>{message}</Text>
          ) : null}
          <Button
            href={acceptUrl}
            style={{
              background: "#111827",
              color: "#ffffff",
              padding: "12px 20px",
              borderRadius: "6px",
              textDecoration: "none",
            }}
          >
            Accept invitation
          </Button>
          <Text>
            Or paste this link into your browser: <br />
            {acceptUrl}
          </Text>
          <Text>This invitation expires on {formatExpiry(expiresAt)}.</Text>
        </Container>
      </Body>
    </Html>
  );
}
