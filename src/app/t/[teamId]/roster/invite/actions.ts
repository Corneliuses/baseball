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

import type {
  BulkInviteOutcome,
  BulkInviteState,
  BulkInviteValues,
} from "./bulk-invite-state";

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
const MAX_MESSAGE_LENGTH = 1000;
const messageSchema = z.string().trim().max(MAX_MESSAGE_LENGTH);

/// Hard ceiling on rows in one batch. The rendered form never comes close —
/// it is one row per unlinked player, and a youth team is ~15 (product-brief.md)
/// — but the action reads whatever fields the POST carries, and each row costs
/// a query and (potentially) an email to an address taken straight from the
/// request. Bounding the batch keeps a forged or repeated submission from
/// turning one request into an unbounded send to arbitrary recipients.
///
/// Kept well under what MIN_SEND_INTERVAL_MS can fit inside the page's
/// `maxDuration`: at 600ms a row, this is 18s of pacing before per-row work,
/// against a 60s ceiling. A cap that could outlast the timeout would trade a
/// clean rejection for a half-finished batch.
const MAX_ROWS = 30;

/// Resend's API is rate limited (2 requests/second by default), and a batch is
/// the one place in this app that sends in a loop. Pace the sends so a
/// full-team invite doesn't get its tail rejected as 429s — which would count
/// as `failed` rows the coach can no longer retry from this page, since the
/// guardian link already exists by then.
const MIN_SEND_INTERVAL_MS = 600;

/// One `email-<entryId>` field per player row. Blank rows are players the
/// coach chose to skip, not errors.
///
/// Deduplicated by entryId, first row wins: the form renders exactly one input
/// per player, so a repeated key can only come from a forged POST, and letting
/// it through would mail several addresses per kid.
function collectRows(formData: FormData): { entryId: string; email: string }[] {
  const byEntryId = new Map<string, string>();
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("email-") || typeof value !== "string") {
      continue;
    }
    const email = value.trim();
    if (!email) {
      continue;
    }
    const entryId = key.slice("email-".length);
    if (!entryId || byEntryId.has(entryId)) {
      continue;
    }
    byEntryId.set(entryId, email);
  }
  return [...byEntryId].map(([entryId, email]) => ({ entryId, email }));
}

/// Everything typed, blank rows included, so a rejected submission can be
/// handed back exactly as it was written. Separate from `collectRows` on
/// purpose: that one drops blanks because they are skipped players, and this
/// one keeps them because they are still the state of the form.
function collectValues(formData: FormData): BulkInviteValues {
  const emails: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("email-") && typeof value === "string") {
      emails[key.slice("email-".length)] = value;
    }
  }
  const message = formData.get("message");
  return { emails, message: typeof message === "string" ? message : "" };
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
 * Rows are processed independently once the batch starts: one Resend failure
 * must not lose the rest, so each row's failure is recorded and reported
 * rather than thrown. A row whose entry has vanished (removed in another tab
 * since render) is recorded the same way.
 *
 * **Validation, though, is all-or-nothing on purpose.** A malformed address
 * stops the whole batch before a single send. Sending the valid rows and
 * reporting the rest would leave the coach holding a form whose remaining
 * rows may or may not have gone out, and the retry — resubmitting the form —
 * would be ambiguous about which. Rejecting early keeps "nothing was sent"
 * true, and now the rejection says which row to fix instead of which it isn't.
 *
 * Shaped for `useActionState`, hence the leading state argument. The return
 * value *is* the feedback: no redirect, so nothing reloads, nothing scrolls to
 * the top, and nothing typed is lost (Dugout Report C5). Losing team access is
 * the one exception that still redirects — someone who is no longer a coach
 * here should land on the page's own access message, not read it inside a form
 * they can no longer use.
 */
export async function bulkInviteGuardiansAction(
  _prevState: BulkInviteState,
  formData: FormData,
): Promise<BulkInviteState> {
  const teamId = extractTeamId(formData);
  const values = collectValues(formData);

  const invalid = (
    message: string,
    rowErrors: Record<string, string> = {},
  ): BulkInviteState => ({ status: "invalid", message, rowErrors, values });

  const parsedMessage = messageSchema.safeParse(values.message);
  if (!parsedMessage.success) {
    return invalid(
      `That note is too long — keep it under ${MAX_MESSAGE_LENGTH.toLocaleString()} characters. Nothing was sent.`,
    );
  }
  const message = parsedMessage.data || undefined;

  const rows = collectRows(formData);
  if (rows.length === 0) {
    return invalid(
      "Add at least one parent's email address — every row is blank.",
    );
  }
  if (rows.length > MAX_ROWS) {
    return invalid(
      `That's more than ${MAX_ROWS} invitations in one batch. Nothing was sent — send them in smaller groups.`,
    );
  }

  // Per row, so the coach is told which address to fix rather than that one of
  // fifteen is wrong somewhere.
  const rowErrors: Record<string, string> = {};
  for (const row of rows) {
    if (!emailSchema.safeParse(row.email).success) {
      rowErrors[row.entryId] = "That doesn't look like an email address.";
    }
  }
  if (Object.keys(rowErrors).length > 0) {
    const count = Object.keys(rowErrors).length;
    return invalid(
      count === 1
        ? "One address needs a look. Nothing was sent yet."
        : `${count} addresses need a look. Nothing was sent yet.`,
      rowErrors,
    );
  }

  const outcomes: BulkInviteOutcome[] = [];

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

    let lastSendAt = 0;

    for (const row of rows) {
      try {
        const entry = await getRosterEntry(teamId, row.entryId);
        if (!entry) {
          outcomes.push({
            entryId: row.entryId,
            playerName: null,
            email: row.email,
            outcome: "failed",
            reason: "That player is no longer on the roster.",
          });
          continue;
        }

        const result = await linkGuardian({
          teamId,
          playerId: entry.player.id,
          email: row.email,
        });

        if (!result.invitation) {
          // Already a member — the kid link is made, no email is owed.
          outcomes.push({
            entryId: row.entryId,
            playerName: entry.player.name,
            email: row.email,
            outcome: "linked",
          });
          continue;
        }

        const { subject, acceptUrl } = buildInvitationEmail({
          teamName,
          token: result.invitation.token,
          env,
        });
        // Wait out only the remainder of the interval — a slow send has
        // already paid for itself.
        const waitMs = lastSendAt + MIN_SEND_INTERVAL_MS - Date.now();
        if (waitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
        lastSendAt = Date.now();

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

        outcomes.push({
          entryId: row.entryId,
          playerName: entry.player.name,
          email: row.email,
          outcome: outcome.ok ? "sent" : "failed",
          // The invitation row survives a failed send — the player's own page
          // can retry it, which is where that button already lives.
          reason: outcome.ok
            ? undefined
            : "The invitation was created but the email didn't go out — resend it from the player's page.",
        });
      } catch (rowError) {
        unstable_rethrow(rowError);
        const detail =
          rowError instanceof Error ? rowError.message : "Unknown error";
        console.error(`Bulk invite failed for entry ${row.entryId}:`, detail);
        outcomes.push({
          entryId: row.entryId,
          playerName: null,
          email: row.email,
          outcome: "failed",
          reason: "Something went wrong on this row — check the player's page.",
        });
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

  return { status: "done", outcomes };
}
