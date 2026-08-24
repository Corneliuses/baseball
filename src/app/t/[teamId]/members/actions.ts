"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import type { Role } from "@/generated/prisma/enums";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import {
  createInvitation,
  getTeamInvitation,
  revokeInvitation,
} from "@/lib/invitations";
import { LastOwnerError, removeMember, setMemberRole } from "@/lib/memberships";
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
  // Say so. A role change used to redirect with no param at all, so a
  // successful save was indistinguishable from a click that did nothing — the
  // select simply re-rendered showing the value it already showed (C7).
  redirect(`/t/${teamId}/members?role-saved=1`);
}

/**
 * Remove one member from this team.
 *
 * Deletes only the Membership row — `removeMember` documents why the person,
 * their family links, and their kids' roster spots all survive. The last-owner
 * guard lives in the same transaction as the delete, so this action just
 * translates its refusal into the error the page already knows how to say.
 *
 * An owner may remove themselves when another owner remains; the redirect
 * then goes to `/`, because the members page they were standing on is one
 * they no longer have access to read.
 */
export async function removeMemberAction(formData: FormData) {
  const teamId = extractTeamId(formData);
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) {
    throw new Error("Invalid user ID");
  }

  let removed: boolean;
  let callerId: string;
  try {
    ({ userId: callerId } = await requireTeamAccess(teamId, {
      intent: "write",
      minRole: "OWNER",
    }));
    removed = await removeMember(teamId, userId);
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

  if (removed && userId === callerId) {
    // Self-removal succeeded, so the caller can no longer read the page this
    // would otherwise land on.
    redirect("/");
  }

  revalidatePath("/t/[teamId]/members", "page");
  // Like revokeInvitationAction: a row a second tab already removed is not
  // this click's removal, so don't claim it.
  redirect(`/t/${teamId}/members${removed ? "?removed=1" : ""}`);
}

function extractInvitationId(formData: FormData): string {
  const invitationId = String(formData.get("invitationId") ?? "").trim();
  if (!invitationId) {
    throw new Error("Invalid invitation ID");
  }
  return invitationId;
}

/**
 * Withdraw a pending invitation.
 *
 * There was no way to do this. Mistyping an address left a live token in
 * somebody else's inbox with no undo, and "revoking" meant re-inviting the
 * right person and relying on `createInvitation` sweeping the old row away —
 * which sends yet another email to the address you are trying to stop.
 *
 * The id is resolved through the teamId scope inside `revokeInvitation`, so a
 * forged id from another team deletes nothing.
 */
export async function revokeInvitationAction(formData: FormData) {
  const teamId = extractTeamId(formData);
  const invitationId = extractInvitationId(formData);

  let removed: boolean;
  try {
    await requireTeamAccess(teamId, { intent: "write", minRole: "OWNER" });
    removed = await revokeInvitation(teamId, invitationId);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`/t/${teamId}/members?error=access`);
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/members", "page");
  // `revokeInvitation` matches on `acceptedAt: null`, so it removes nothing for
  // an invitation somebody already accepted — or one a second tab withdrew a
  // moment ago. Claiming "Invitation withdrawn." there would be a lie about a
  // token that is either still live or was never this row's to withdraw. The
  // list re-renders either way and shows the truth.
  redirect(`/t/${teamId}/members${removed ? "?revoked=1" : ""}`);
}

/**
 * Send a pending invitation again.
 *
 * Re-issues rather than re-mails the old token: `createInvitation` deletes the
 * unaccepted row for this (teamId, email) and writes a fresh one, so the clock
 * restarts and the previous link stops working. That is the behaviour worth
 * having — an invitation resent because the first one expired should not
 * arrive already expiring.
 *
 * The address and role come from the stored invitation, never from the form —
 * the form carries only an id, and that id is resolved through the team scope.
 * Otherwise this button would be a way to mail an arbitrary address from a
 * signed-in POST.
 */
export async function resendInvitationAction(formData: FormData) {
  const teamId = extractTeamId(formData);
  const invitationId = extractInvitationId(formData);

  try {
    await requireTeamAccess(teamId, { intent: "write", minRole: "OWNER" });

    const existing = await getTeamInvitation(teamId, invitationId);
    if (!existing || existing.acceptedAt !== null) {
      // Already accepted, or already gone. Nothing to resend, and nothing
      // worth an error — the list will simply no longer show it.
      redirect(`/t/${teamId}/members`);
    }

    const invitation = await createInvitation({
      teamId,
      email: existing.email,
      role: existing.role,
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
      to: existing.email,
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
  redirect(`/t/${teamId}/members?resent=1`);
}
