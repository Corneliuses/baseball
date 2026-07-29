import { absoluteUrl, type AbsoluteUrlEnv } from "@/lib/absolute-url";

/// Pure — builds the subject line and accept URL for an invitation email
/// without touching Resend or React Email, so it tests without rendering.

export type BuildInvitationEmailInput = {
  teamName: string;
  token: string;
  env: AbsoluteUrlEnv;
};

export type InvitationEmailContent = {
  subject: string;
  acceptUrl: string;
};

export function buildInvitationEmail({
  teamName,
  token,
  env,
}: BuildInvitationEmailInput): InvitationEmailContent {
  return {
    subject: `You're invited to join ${teamName}`,
    acceptUrl: absoluteUrl(`/invite/${token}`, env),
  };
}
