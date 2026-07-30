import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Text,
} from "@react-email/components";

/// Plain and short, like InvitationEmail — but no expiry line and no "accept"
/// language, because there is nothing to accept. The recipient already has an
/// account (Decision 15 step 4): they're being told where a kid they guard
/// now plays, not invited to sign up.

export type AddedToTeamEmailProps = {
  teamName: string;
  teamUrl: string;
};

export function AddedToTeamEmail({ teamName, teamUrl }: AddedToTeamEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>You&apos;ve been added to {teamName}</Preview>
      <Body style={{ fontFamily: "sans-serif", padding: "24px" }}>
        <Container>
          <Text>You&apos;ve been added to {teamName}.</Text>
          <Button
            href={teamUrl}
            style={{
              background: "#111827",
              color: "#ffffff",
              padding: "12px 20px",
              borderRadius: "6px",
              textDecoration: "none",
            }}
          >
            View team
          </Button>
          <Text>
            Or paste this link into your browser: <br />
            {teamUrl}
          </Text>
          <Text>
            You already have an account — sign in with the email address this
            was sent to.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
