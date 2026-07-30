import { absoluteUrl, type AbsoluteUrlEnv } from "@/lib/absolute-url";

/// Pure — builds the subject line and team URL for the returning-player
/// cascade's notice email, without touching Resend or React Email.
///
/// Unlike buildInvitationEmail, this carries no token: the recipient already
/// has an account (Decision 15 step 4), so the link only needs to get them to
/// the team, not grant access. See design-doc.md #5 Decision 3 — a
/// never-signed-in guardian still gets in via /signin, because decideSignIn
/// admits any address holding a Membership, which this cascade just created.

export type BuildAddedToTeamEmailInput = {
  teamName: string;
  teamId: string;
  env: AbsoluteUrlEnv;
};

export type AddedToTeamEmailContent = {
  subject: string;
  teamUrl: string;
};

export function buildAddedToTeamEmail({
  teamName,
  teamId,
  env,
}: BuildAddedToTeamEmailInput): AddedToTeamEmailContent {
  return {
    subject: `You've been added to ${teamName}`,
    teamUrl: absoluteUrl(`/t/${teamId}`, env),
  };
}
