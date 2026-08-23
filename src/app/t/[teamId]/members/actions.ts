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

import type {
  InviteMemberState,
  InviteMemberValues,
} from "./invite-member-state";

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

/**
 * Invite one person onto this team as a coach or a parent.
 *
 * Shaped for `useActionState`, so a bad address comes back as form state with
 * the address still in the box (Dugout Report C5) rather than as a redirect
 * that blanks it. A failed *send* comes back the same way: the invitation row
 * exists either way, so the useful next step is "check the address and try
 * again", which needs the address still on screen.
 *
 * Success and lost access still redirect — the first because a fresh blank
 * form is the right next state, the second because the person can no longer
 * use the form at all.
 */
export async function inviteMemberAction(
  _prevState: InviteMemberState,
  formData: FormData,
): Promise<InviteMemberState> {
  const teamId = extractTeamId(formData);

  const values: InviteMemberValues = {
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
  };

  const parsed = inviteSchema.safeParse({
    email: formData.get("email") ?? "",
    role: formData.get("role") ?? "",
  });

  if (!parsed.success) {
    return { status: "invalid", code: "invalid-invite", values };
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
      // The Invitation row survives a failed send, and re-inviting the same
      // address replaces it (createInvitation deletes prior unaccepted rows),
      // so retrying from this form is safe — which is why the address has to
      // still be in it.
      return { status: "invalid", code: "email-failed", values };
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
