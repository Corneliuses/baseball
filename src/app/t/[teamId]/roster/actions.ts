"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import {
  addPlayerToRoster,
  getRosterEntry,
  removeRosterEntry,
  updateRosterEntry,
} from "@/lib/roster";
import { parseJerseyNumber, rosterWriteFailure } from "@/lib/roster-rules";
import {
  createInvitation,
  linkGuardian,
  unlinkGuardian,
} from "@/lib/invitations";
import { sendEmail } from "@/lib/email";
import { InvitationEmail } from "@/emails/InvitationEmail";
import { buildInvitationEmail } from "@/emails/invitation-email";
import { getTeamById } from "@/lib/teams";

function extractTeamId(formData: FormData): string {
  const teamId = String(formData.get("teamId")).trim();
  if (!teamId || teamId === "null" || teamId === "undefined") {
    throw new Error("Invalid team ID");
  }
  return teamId;
}

function extractEntryId(formData: FormData): string {
  const entryId = String(formData.get("entryId")).trim();
  if (!entryId || entryId === "null" || entryId === "undefined") {
    throw new Error("Invalid roster entry ID");
  }
  return entryId;
}

/// Builds and sends the invitation email, reporting whether it went out.
/// The invitation row is not rolled back on a send failure — see
/// design-doc.md #4 Decision 7 — so callers redirect to `?error=email-failed`
/// rather than throwing, and a "resend" action can retry.
async function sendInvitationEmail(
  teamId: string,
  to: string,
  invitation: { token: string; expiresAt: Date },
): Promise<boolean> {
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

  const result = await sendEmail({
    to,
    subject,
    react: InvitationEmail({
      teamName,
      acceptUrl,
      expiresAt: invitation.expiresAt,
    }),
  });

  return result.ok;
}

const playerSchema = z.object({
  name: z.string().trim().min(1),
  dateOfBirth: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value)),
});

function parseDateOfBirth(raw: string | null): Date | null {
  return raw ? new Date(raw) : null;
}

export async function addPlayerAction(formData: FormData) {
  const teamId = extractTeamId(formData);

  const parsed = playerSchema.safeParse({
    name: formData.get("name") ?? "",
    dateOfBirth: formData.get("dateOfBirth") ?? "",
  });

  if (!parsed.success) {
    redirect(`/t/${teamId}/roster?error=invalid-name`);
  }

  let jerseyNumber: number | null;
  try {
    jerseyNumber = parseJerseyNumber(formData.get("jerseyNumber"));
  } catch {
    redirect(`/t/${teamId}/roster?error=invalid-jersey`);
  }

  try {
    await requireTeamAccess(teamId, { intent: "write", minRole: "COACH" });
    await addPlayerToRoster(teamId, {
      name: parsed.data.name,
      dateOfBirth: parseDateOfBirth(parsed.data.dateOfBirth),
      jerseyNumber,
    });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`/t/${teamId}/roster?error=access`);
    }
    const failure = rosterWriteFailure(error);
    if (failure) {
      redirect(`/t/${teamId}/roster?error=${failure}`);
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/roster", "page");
  redirect(`/t/${teamId}/roster`);
}

export async function updateRosterEntryAction(formData: FormData) {
  const teamId = extractTeamId(formData);
  const entryId = extractEntryId(formData);

  const parsed = playerSchema.safeParse({
    name: formData.get("name") ?? "",
    dateOfBirth: formData.get("dateOfBirth") ?? "",
  });

  if (!parsed.success) {
    redirect(`/t/${teamId}/roster/${entryId}?error=invalid-name`);
  }

  let jerseyNumber: number | null;
  try {
    jerseyNumber = parseJerseyNumber(formData.get("jerseyNumber"));
  } catch {
    redirect(`/t/${teamId}/roster/${entryId}?error=invalid-jersey`);
  }

  try {
    await requireTeamAccess(teamId, { intent: "write", minRole: "COACH" });
    await updateRosterEntry(teamId, entryId, {
      name: parsed.data.name,
      dateOfBirth: parseDateOfBirth(parsed.data.dateOfBirth),
      jerseyNumber,
    });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`/t/${teamId}/roster/${entryId}?error=access`);
    }
    const failure = rosterWriteFailure(error);
    if (failure) {
      redirect(`/t/${teamId}/roster/${entryId}?error=${failure}`);
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/roster", "page");
  revalidatePath("/t/[teamId]/roster/[entryId]", "page");
  redirect(`/t/${teamId}/roster/${entryId}?saved=1`);
}

export async function removeRosterEntryAction(formData: FormData) {
  const teamId = extractTeamId(formData);
  const entryId = extractEntryId(formData);

  try {
    await requireTeamAccess(teamId, { intent: "write", minRole: "COACH" });
    await removeRosterEntry(teamId, entryId);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`/t/${teamId}/roster/${entryId}?error=access`);
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/roster", "page");
  redirect(`/t/${teamId}/roster`);
}

const guardianSchema = z.object({
  email: z.email(),
});

/**
 * Resolve the roster entry this request claims to act on, scoped by teamId.
 *
 * `requireTeamAccess` proves the caller may write to *this team*; it cannot
 * prove the record they named belongs to it, because a server action POSTs to
 * the current page URL and only the action knows what it is about to mutate
 * (see the note in src/proxy.ts). So `playerId` is never taken from the form:
 * it is read back from the entry, which is looked up with `teamId` in the
 * where clause. Without this a coach on team A could POST any `playerId` and
 * create or delete `GuardianPlayer` rows for a child on team B — and
 * `GuardianPlayer` is global, so that write is exactly what #5's
 * returning-player cascade later reads.
 */
async function requireRosterEntry(teamId: string, entryId: string) {
  await requireTeamAccess(teamId, { intent: "write", minRole: "COACH" });

  const entry = await getRosterEntry(teamId, entryId);
  if (!entry) {
    redirect(`/t/${teamId}/roster`);
  }

  return entry;
}

export async function linkGuardianAction(formData: FormData) {
  const teamId = extractTeamId(formData);
  const entryId = extractEntryId(formData);

  const parsed = guardianSchema.safeParse({
    email: formData.get("email") ?? "",
  });

  if (!parsed.success) {
    redirect(`/t/${teamId}/roster/${entryId}?error=invalid-email`);
  }

  try {
    const entry = await requireRosterEntry(teamId, entryId);

    const result = await linkGuardian({
      teamId,
      playerId: entry.player.id,
      email: parsed.data.email,
    });

    if (result.invitation) {
      const sent = await sendInvitationEmail(
        teamId,
        result.email,
        result.invitation,
      );
      if (!sent) {
        redirect(`/t/${teamId}/roster/${entryId}?error=email-failed`);
      }
    }
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`/t/${teamId}/roster/${entryId}?error=access`);
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/roster/[entryId]", "page");
  redirect(`/t/${teamId}/roster/${entryId}`);
}

export async function unlinkGuardianAction(formData: FormData) {
  const teamId = extractTeamId(formData);
  const entryId = extractEntryId(formData);
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) {
    throw new Error("Invalid user ID");
  }

  try {
    const entry = await requireRosterEntry(teamId, entryId);

    // Only a guardian actually linked to this player can be unlinked through
    // this page, so a forged userId cannot reach an unrelated family link.
    const guardian = entry.guardians.find((g) => g.id === userId);
    if (!guardian) {
      redirect(`/t/${teamId}/roster/${entryId}?error=not-a-guardian`);
    }

    await unlinkGuardian(entry.player.id, guardian.id);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`/t/${teamId}/roster/${entryId}?error=access`);
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/roster/[entryId]", "page");
  redirect(`/t/${teamId}/roster/${entryId}`);
}

export async function resendInvitationAction(formData: FormData) {
  const teamId = extractTeamId(formData);
  const entryId = extractEntryId(formData);
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) {
    throw new Error("Invalid user ID");
  }

  try {
    const entry = await requireRosterEntry(teamId, entryId);

    // The address comes from the guardian row, never from the form — this is
    // an authenticated mail-send and must not be steerable to an arbitrary
    // recipient.
    const guardian = entry.guardians.find((g) => g.id === userId);
    if (!guardian) {
      redirect(`/t/${teamId}/roster/${entryId}?error=not-a-guardian`);
    }

    const invitation = await createInvitation({
      teamId,
      email: guardian.email,
      role: "PARENT",
    });

    const sent = await sendInvitationEmail(teamId, guardian.email, invitation);
    if (!sent) {
      redirect(`/t/${teamId}/roster/${entryId}?error=email-failed`);
    }
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`/t/${teamId}/roster/${entryId}?error=access`);
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/roster/[entryId]", "page");
  redirect(`/t/${teamId}/roster/${entryId}?invited=1`);
}
