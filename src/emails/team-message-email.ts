import { absoluteUrl, type AbsoluteUrlEnv } from "@/lib/absolute-url";

/// Pure — builds the subject line and team URL for a team message email
/// (#13), without touching Resend or React Email. Mirrors
/// buildAddedToTeamEmail: no token, because every recipient is already a
/// member — the link only needs to get them to the team.
///
/// The team name is prefixed so a parent with kids on two teams can tell at
/// a glance which coach is talking.

export type BuildTeamMessageEmailInput = {
  teamName: string;
  teamId: string;
  /// The coach's (or parent's) own subject line, already validated by
  /// messageSubjectSchema.
  subject: string;
  env: AbsoluteUrlEnv;
};

export type TeamMessageEmailContent = {
  subject: string;
  teamUrl: string;
};

export function buildTeamMessageEmail({
  teamName,
  teamId,
  subject,
  env,
}: BuildTeamMessageEmailInput): TeamMessageEmailContent {
  return {
    subject: `[${teamName}] ${subject}`,
    teamUrl: absoluteUrl(`/t/${teamId}`, env),
  };
}
