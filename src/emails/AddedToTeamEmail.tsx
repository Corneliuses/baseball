import { rosterFootnote } from "./copy";
import { BananaButton, EmailHeading, EmailText } from "./EmailKit";
import { EmailLayout } from "./EmailLayout";

/// Short, like InvitationEmail — but no expiry line and no "accept" language,
/// because there is nothing to accept. The recipient already has an account
/// (Decision 15 step 4): they're being told where a kid they guard now plays,
/// not invited to sign up.
///
/// Its banana goes on the one link, for the same reason the invitation's does:
/// the message is one sentence long and the tap is the whole of it.

export type AddedToTeamEmailProps = {
  teamName: string;
  teamUrl: string;
};

export function AddedToTeamEmail({ teamName, teamUrl }: AddedToTeamEmailProps) {
  return (
    <EmailLayout
      preview={`You've been added to ${teamName}`}
      teamName={teamName}
      footnote={rosterFootnote(teamName)}
    >
      <EmailHeading
        eyebrow="New team"
        title={`You're on ${teamName}`}
        subtitle="Your player was added to the roster, so the schedule is yours now too."
      />

      <BananaButton href={teamUrl}>View team</BananaButton>

      <EmailText quiet>
        You already have an account — sign in with the email address this was
        sent to.
      </EmailText>
    </EmailLayout>
  );
}
