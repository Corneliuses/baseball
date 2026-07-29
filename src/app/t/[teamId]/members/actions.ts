"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import type { Role } from "@/generated/prisma/enums";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { createInvitation } from "@/lib/invitations";
import { LastOwnerError, setMemberRole } from "@/lib/memberships";
import { getTeamById } from "@/lib/teams";
import { sendEmail } from "@/lib/email";
import { InvitationEmail } from "@/emails/InvitationEmail";
import { buildInvitationEmail } from "@/emails/invitation-email";

function extractTeamId(formData: FormData): string {
  const teamId = String(formData.get("teamId")).trim();
  if (!teamId || teamId === "null" || teamId === "undefined") {
    throw new Error("Invalid team ID");
  }
  return teamId;
}

const inviteSchema = z.object({
  email: z.email(),
  // Inviting an OWNER isn't offered here — the owner who creates a team
  // already holds OWNER on it (see teams.ts createTeam); this form is for
  // bringing on coaches and parents.
  role: z.enum(["COACH", "PARENT"]),
});

export async function inviteMemberAction(formData: FormData) {
  const teamId = extractTeamId(formData);

  const parsed = inviteSchema.safeParse({
    email: formData.get("email") ?? "",
    role: formData.get("role") ?? "",
  });

  if (!parsed.success) {
    redirect(`/t/${teamId}/members?error=invalid-invite`);
  }

  try {
    await requireTeamAccess(teamId, { intent: "write", minRole: "OWNER" });

    const invitation = await createInvitation({
      teamId,
      email: parsed.data.email,
      role: parsed.data.role,
    });

    const team = await getTeamById(teamId);
    const teamName = team?.name ?? "your team";
    const { subject, acceptUrl } = buildInvitationEmail({
      teamName,
      token: invitation.token,
      env: {
        AUTH_URL: process.env.AUTH_URL,
        VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
        VERCEL_URL: process.env.VERCEL_URL,
      },
    });

    const sent = await sendEmail({
      to: parsed.data.email,
      subject,
      react: InvitationEmail({
        teamName,
        acceptUrl,
        expiresAt: invitation.expiresAt,
      }),
    });

    if (!sent.ok) {
      redirect(`/t/${teamId}/members?error=email-failed`);
    }
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`/t/${teamId}/members?error=access`);
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/members", "page");
  redirect(`/t/${teamId}/members?invited=1`);
}

const roleSchema = z.object({
  role: z.enum(["OWNER", "COACH", "PARENT"]),
});

/// Changes exactly one (userId, teamId) row — roles never inherit across
/// teams, and nothing here reads or writes a membership on another team.
export async function setMemberRoleAction(formData: FormData) {
  const teamId = extractTeamId(formData);
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) {
    throw new Error("Invalid user ID");
  }

  const parsed = roleSchema.safeParse({ role: formData.get("role") ?? "" });
  if (!parsed.success) {
    redirect(`/t/${teamId}/members?error=invalid-role`);
  }

  try {
    await requireTeamAccess(teamId, { intent: "write", minRole: "OWNER" });
    await setMemberRole(teamId, userId, parsed.data.role as Role);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`/t/${teamId}/members?error=access`);
    }
    if (error instanceof LastOwnerError) {
      redirect(`/t/${teamId}/members?error=last-owner`);
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/members", "page");
  redirect(`/t/${teamId}/members`);
}
