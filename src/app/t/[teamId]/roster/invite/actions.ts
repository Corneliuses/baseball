"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getRosterEntry } from "@/lib/roster";
import { linkGuardian } from "@/lib/invitations";
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

const emailSchema = z.email();

/// Generous but bounded — the message rides inside the email body only, so
/// the cap guards Resend's payload, not a database column.
const messageSchema = z.string().trim().max(1000);

/// One `email-<entryId>` field per player row. Blank rows are players the
/// coach chose to skip, not errors.
function collectRows(formData: FormData): { entryId: string; email: string }[] {
  const rows: { entryId: string; email: string }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("email-") || typeof value !== "string") {
      continue;
    }
    const email = value.trim();
    if (!email) {
      continue;
    }
    rows.push({ entryId: key.slice("email-".length), email });
  }
  return rows;
}

/**
 * Invite many parents at once, each pre-linked to their kid.
 *
 * Per-row, this is exactly `linkGuardianAction` (../actions.ts): resolve the
 * roster entry through the teamId-scoped lookup (never trusting a form
 * playerId), let `linkGuardian` create the user, kid link, and membership,
 * and mail the invitation only when the membership is new. The same address
 * on two kids' rows therefore sends one email and links both kids — the
 * second row's `invitation` comes back null.
 *
 * Rows are processed independently: one bad address or one Resend failure
 * must not lose the rest of the batch, so each row's failure is counted and
 * reported rather than thrown. A row whose entry has vanished (removed in
 * another tab since render) is skipped the same way.
 */
export async function bulkInviteGuardiansAction(formData: FormData) {
  const teamId = extractTeamId(formData);

  const parsedMessage = messageSchema.safeParse(formData.get("message") ?? "");
  if (!parsedMessage.success) {
    redirect(`/t/${teamId}/roster/invite?error=invalid-message`);
  }
  const message = parsedMessage.data || undefined;

  const rows = collectRows(formData);
  if (rows.length === 0) {
    redirect(`/t/${teamId}/roster/invite?error=no-emails`);
  }
  if (rows.some((row) => !emailSchema.safeParse(row.email).success)) {
    redirect(`/t/${teamId}/roster/invite?error=invalid-email`);
  }

  let sent = 0;
  let linked = 0;
  let failed = 0;

  try {
    await requireTeamAccess(teamId, { intent: "write", minRole: "COACH" });

    // One lookup for the whole batch — every email shares the team name and
    // the env-derived base URL.
    const team = await getTeamById(teamId);
    const teamName = team?.name ?? "your team";
    const env = {
      AUTH_URL: process.env.AUTH_URL,
      VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
      VERCEL_URL: process.env.VERCEL_URL,
    };

    for (const row of rows) {
      try {
        const entry = await getRosterEntry(teamId, row.entryId);
        if (!entry) {
          failed += 1;
          continue;
        }

        const result = await linkGuardian({
          teamId,
          playerId: entry.player.id,
          email: row.email,
        });

        if (!result.invitation) {
          // Already a member — the kid link is made, no email is owed.
          linked += 1;
          continue;
        }

        const { subject, acceptUrl } = buildInvitationEmail({
          teamName,
          token: result.invitation.token,
          env,
        });
        const outcome = await sendEmail({
          to: result.email,
          subject,
          react: InvitationEmail({
            teamName,
            acceptUrl,
            expiresAt: result.invitation.expiresAt,
            message,
          }),
        });

        if (outcome.ok) {
          sent += 1;
        } else {
          // The invitation row survives a failed send (design-doc.md #4
          // Decision 7) — the player page's resend button can retry it.
          failed += 1;
        }
      } catch (rowError) {
        unstable_rethrow(rowError);
        const detail =
          rowError instanceof Error ? rowError.message : "Unknown error";
        console.error(`Bulk invite failed for entry ${row.entryId}:`, detail);
        failed += 1;
      }
    }
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`/t/${teamId}/roster/invite?error=access`);
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/roster", "page");
  revalidatePath("/t/[teamId]/roster/invite", "page");

  const params = new URLSearchParams();
  if (sent > 0) params.set("sent", String(sent));
  if (linked > 0) params.set("linked", String(linked));
  if (failed > 0) params.set("failed", String(failed));
  redirect(`/t/${teamId}/roster/invite?${params.toString()}`);
}
