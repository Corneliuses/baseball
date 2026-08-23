"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { sendEmail } from "@/lib/email";
import { listTeamMembers } from "@/lib/memberships";
import {
  createMessage,
  MESSAGE_AUDIENCES,
  messageBodySchema,
  messageSubjectSchema,
  resolveRecipients,
} from "@/lib/messages";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getTeamById } from "@/lib/teams";
import { TeamMessageEmail } from "@/emails/TeamMessageEmail";
import { buildTeamMessageEmail } from "@/emails/team-message-email";

function extractTeamId(formData: FormData): string {
  const teamId = String(formData.get("teamId")).trim();
  if (!teamId || teamId === "null" || teamId === "undefined") {
    throw new Error("Invalid team ID");
  }
  return teamId;
}

const audienceSchema = z.enum(MESSAGE_AUDIENCES);

/// Sanity ceiling on one fan-out, playing the MAX_ROWS role from the bulk
/// invite: recipients resolve from Membership rows rather than the POST, so
/// this bounds a runaway roster, not a forged form. Matches MAX_ROWS exactly
/// rather than picking a separate number: the loop's wall-clock is bounded by
/// MIN_SEND_INTERVAL_MS only when a send is faster than the interval — a slow
/// Resend round trip adds on top rather than being absorbed by it — so the
/// real worst case is closer to MAX_RECIPIENTS × (send latency), not
/// MAX_RECIPIENTS × 600ms. 30 keeps the same margin against the page's
/// `maxDuration = 60` that the invite batch already relies on; the two
/// constants must move together (see AGENTS.md on that coupling).
const MAX_RECIPIENTS = 30;

/// Resend's API is rate limited (2 requests/second by default). Same pacing
/// as `bulkInviteGuardiansAction` — these two actions are the only places the
/// app sends in a loop.
const MIN_SEND_INTERVAL_MS = 600;

/**
 * Send one message to a team audience, in three shapes: coach → all parents
 * (the broadcast — the only shape that persists a `Message` row), coach → one
 * parent, and parent → the coaching staff.
 *
 * Authorization is two layered checks. `requireTeamAccess` proves membership
 * and writability (archived teams reject every send, minRole COACH for the
 * coach-only audiences), then `resolveRecipients` — pure, tested — decides
 * who the audience actually is from the team's own membership rows. The
 * individual target is trusted only if it matches a PARENT membership on
 * this team, and a PARENT sender can only ever reach the coaching staff:
 * no parent-to-parent path exists, whatever the POST claims.
 *
 * The broadcast row is written BEFORE the fan-out (the coach's copy survives
 * a half-failed send), and each recipient gets their own email — never a
 * shared To line, which would hand every parent the rest of the parents'
 * addresses. Reply-To is the sender, so answering works from the inbox, and
 * the broadcast — the one shape that is genuinely list mail — also carries a
 * List-Unsubscribe pointing at that same sender. Mailboxes read its absence
 * on bulk-shaped mail as a spam signal, and the coach is the person who can
 * actually act on the request.
 */
export async function sendTeamMessageAction(formData: FormData) {
  const teamId = extractTeamId(formData);
  const composeUrl = `/t/${teamId}/messages/new`;

  const parsedAudience = audienceSchema.safeParse(formData.get("audience"));
  if (!parsedAudience.success) {
    redirect(`${composeUrl}?error=invalid-audience`);
  }
  const audience = parsedAudience.data;

  const parsedSubject = messageSubjectSchema.safeParse(
    formData.get("subject") ?? "",
  );
  if (!parsedSubject.success) {
    redirect(`${composeUrl}?error=invalid-subject`);
  }
  const subject = parsedSubject.data;

  const parsedBody = messageBodySchema.safeParse(formData.get("body") ?? "");
  if (!parsedBody.success) {
    redirect(`${composeUrl}?error=invalid-body`);
  }
  const body = parsedBody.data;

  const rawTarget = formData.get("targetUserId");
  const targetUserId =
    typeof rawTarget === "string" && rawTarget.trim()
      ? rawTarget.trim()
      : undefined;

  let sent = 0;
  let failed = 0;

  try {
    const { role, userId } = await requireTeamAccess(teamId, {
      intent: "write",
      minRole: audience === "ALL_COACHES" ? "PARENT" : "COACH",
    });

    const members = await listTeamMembers(teamId);
    if (members.length === 0) {
      // requireTeamAccess just proved the caller holds a membership on this
      // team, so their own row must be in `members` — an empty result here
      // is never a real "this team has nobody in it", it's listTeamMembers
      // swallowing a database error to protect its read-only callers (the
      // directory, the compose page's own parent picker). Propagate rather
      // than let that read failure surface as a misleading "nobody to email"
      // or "that parent isn't on this team" — team-access.ts takes the same
      // fail-closed stance on its own lookup.
      throw new Error("Failed to load team members for messaging");
    }

    const resolved = resolveRecipients({
      audience,
      senderRole: role,
      senderUserId: userId,
      targetUserId,
      members,
    });
    if (!resolved.ok) {
      redirect(`${composeUrl}?error=${resolved.reason}`);
    }
    if (resolved.recipients.length > MAX_RECIPIENTS) {
      redirect(`${composeUrl}?error=too-many`);
    }

    // requireTeamAccess just proved the sender holds a membership, so they
    // are in `members`; the fallback only guards a mid-request removal.
    const sender = members.find((m) => m.userId === userId);
    const senderEmail = sender?.email ?? null;
    if (!senderEmail) {
      redirect(`${composeUrl}?error=access`);
    }
    const senderName = sender?.name ?? senderEmail;

    const team = await getTeamById(teamId);
    const teamName = team?.name ?? "your team";
    const env = {
      AUTH_URL: process.env.AUTH_URL,
      VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
      VERCEL_URL: process.env.VERCEL_URL,
    };

    if (audience === "ALL_PARENTS") {
      await createMessage(teamId, userId, subject, body);
    }

    const { subject: emailSubject, teamUrl } = buildTeamMessageEmail({
      teamName,
      teamId,
      subject,
      env,
    });

    let lastSendAt = 0;

    for (const recipient of resolved.recipients) {
      // Wait out only the remainder of the interval — a slow send has
      // already paid for itself.
      const waitMs = lastSendAt + MIN_SEND_INTERVAL_MS - Date.now();
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      lastSendAt = Date.now();

      const outcome = await sendEmail({
        to: recipient.email,
        subject: emailSubject,
        replyTo: senderEmail,
        // Broadcasts only — the other two audiences are one-to-one mail, and
        // a List-Unsubscribe on those would claim a list that isn't there.
        ...(audience === "ALL_PARENTS"
          ? { listUnsubscribe: senderEmail }
          : {}),
        react: TeamMessageEmail({ teamName, senderName, body, teamUrl }),
      });

      // One bad mailbox must not lose the rest of the broadcast — count and
      // continue, like the bulk invite. The Message row (broadcasts) already
      // exists either way.
      if (outcome.ok) {
        sent += 1;
      } else {
        failed += 1;
      }
    }
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`${composeUrl}?error=access`);
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/messages", "page");

  const params = new URLSearchParams();
  if (sent > 0) params.set("sent", String(sent));
  if (failed > 0) params.set("failed", String(failed));
  redirect(`${composeUrl}?${params.toString()}`);
}
