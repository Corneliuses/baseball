import { z } from "zod";

import type { Role } from "@/generated/prisma/enums";
import { db } from "./db";
import type { TeamMember } from "./memberships";

/// Team messaging (#13): who may email whom, and the broadcast record.
///
/// `resolveRecipients` is the pure decision — the `checkTeamAccess` /
/// `requireTeamAccess` split applied to messaging. The action loads members
/// with `listTeamMembers(teamId)` (already team-scoped) and this function
/// decides, so the product's one hard rule — **no parent-to-parent path,
/// anywhere** — is a tested invariant here rather than a hidden form option:
/// a PARENT sender can only ever address the coaching staff, whatever the
/// POST claims.
///
/// Only coach → all-parents broadcasts persist as `Message` rows (owner
/// decision, 2026-08-20 — see .agents/issue-planner/13/design-doc.md).
/// Individual and parent→coaches sends are email-only, so the list view is
/// unambiguously "team announcements" and the schema needs no audience
/// column.

export const MESSAGE_AUDIENCES = [
  "ALL_PARENTS",
  "INDIVIDUAL_PARENT",
  "ALL_COACHES",
] as const;

export type MessageAudience = (typeof MESSAGE_AUDIENCES)[number];

/// Generous but bounded. The subject rides into a real email header (and, for
/// broadcasts, a database row); the body is the email itself.
export const messageSubjectSchema = z.string().trim().min(1).max(200);
export const messageBodySchema = z.string().trim().min(1).max(5000);

export type MessageRecipient = {
  userId: string;
  name: string | null;
  email: string;
};

export type ResolveRecipientsInput = {
  audience: MessageAudience;
  senderRole: Role;
  senderUserId: string;
  /// Required for INDIVIDUAL_PARENT; ignored otherwise.
  targetUserId?: string;
  /// The team's membership rows, already scoped to the URL's teamId by the
  /// caller. Never a global user list.
  members: TeamMember[];
};

export type ResolveRecipientsFailure =
  | "forbidden-audience"
  | "invalid-target"
  | "no-recipients";

export type ResolveRecipientsResult =
  | { ok: true; recipients: MessageRecipient[] }
  | { ok: false; reason: ResolveRecipientsFailure };

const COACHING_ROLES: readonly Role[] = ["OWNER", "COACH"];

/**
 * The role → audience matrix, in one testable place:
 *
 * | Sender role   | ALL_PARENTS | INDIVIDUAL_PARENT | ALL_COACHES |
 * |---------------|-------------|-------------------|-------------|
 * | OWNER / COACH | yes         | yes               | no          |
 * | PARENT        | no          | no                | yes         |
 *
 * Coach → coaching-staff is deliberately out of scope for #13, so it is
 * forbidden rather than quietly allowed.
 *
 * The individual target arrives from a form, so it is trusted only if it
 * matches a PARENT membership in `members` — the same never-trust-the-POST
 * stance the bulk invite takes when it re-resolves roster entries. The
 * sender is excluded from every recipient list; with one role per
 * (user, team) that only bites in degenerate data, but the guarantee is
 * cheap and "the app emailed me my own message" is a confusing bug.
 */
export function resolveRecipients({
  audience,
  senderRole,
  senderUserId,
  targetUserId,
  members,
}: ResolveRecipientsInput): ResolveRecipientsResult {
  const senderIsCoach = COACHING_ROLES.includes(senderRole);

  const allowed = senderIsCoach
    ? audience === "ALL_PARENTS" || audience === "INDIVIDUAL_PARENT"
    : audience === "ALL_COACHES";
  if (!allowed) {
    return { ok: false, reason: "forbidden-audience" };
  }

  if (audience === "INDIVIDUAL_PARENT") {
    const target = members.find(
      (m) =>
        m.userId === targetUserId &&
        m.role === "PARENT" &&
        m.userId !== senderUserId,
    );
    if (!targetUserId || !target) {
      return { ok: false, reason: "invalid-target" };
    }
    return { ok: true, recipients: [toRecipient(target)] };
  }

  const wantedRole =
    audience === "ALL_PARENTS" ? (["PARENT"] as const) : COACHING_ROLES;

  const recipients = members
    .filter((m) => wantedRole.includes(m.role) && m.userId !== senderUserId)
    .map(toRecipient);

  if (recipients.length === 0) {
    return { ok: false, reason: "no-recipients" };
  }

  return { ok: true, recipients };
}

function toRecipient(member: TeamMember): MessageRecipient {
  return { userId: member.userId, name: member.name, email: member.email };
}

export type TeamMessage = {
  id: string;
  subject: string;
  body: string;
  sentAt: Date;
  senderName: string | null;
  senderEmail: string;
};

/**
 * Broadcast history for the coach-only list view, newest first — served by
 * the schema's `@@index([teamId, sentAt])`. Read-only list, so it degrades
 * to empty like the other list reads in this directory.
 */
export async function listMessages(teamId: string): Promise<TeamMessage[]> {
  try {
    const messages = await db.message.findMany({
      where: { teamId },
      orderBy: { sentAt: "desc" },
      select: {
        id: true,
        subject: true,
        body: true,
        sentAt: true,
        sender: { select: { name: true, email: true } },
      },
    });

    return messages.map((m) => ({
      id: m.id,
      subject: m.subject,
      body: m.body,
      sentAt: m.sentAt,
      senderName: m.sender.name,
      senderEmail: m.sender.email,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch messages:", message);
    return [];
  }
}

/**
 * Record one broadcast. Written BEFORE the fan-out, deliberately: the row is
 * the coach's copy of what was said and when, and a Resend hiccup on
 * recipient 21 of 25 must not erase the record of the 20 that went out.
 * Errors propagate — the action decides how to report a failed write.
 */
export async function createMessage(
  teamId: string,
  senderId: string,
  subject: string,
  body: string,
): Promise<{ id: string }> {
  const created = await db.message.create({
    data: { teamId, senderId, subject, body },
    select: { id: true },
  });
  return created;
}
