"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { addReturningPlayer, isReturningCandidate } from "@/lib/roster";
import type { GuardianLink } from "@/lib/returning-players";
import { parseJerseyNumber, rosterWriteFailure } from "@/lib/roster-rules";
import { sendEmail } from "@/lib/email";
import { AddedToTeamEmail } from "@/emails/AddedToTeamEmail";
import { buildAddedToTeamEmail } from "@/emails/added-to-team-email";
import { getTeamById } from "@/lib/teams";

function extractTeamId(formData: FormData): string {
  const teamId = String(formData.get("teamId")).trim();
  if (!teamId || teamId === "null" || teamId === "undefined") {
    throw new Error("Invalid team ID");
  }
  return teamId;
}

function extractPlayerId(formData: FormData): string {
  const playerId = String(formData.get("playerId")).trim();
  if (!playerId || playerId === "null" || playerId === "undefined") {
    throw new Error("Invalid player ID");
  }
  return playerId;
}

/// Notifies every newly-added guardian in parallel. One bad address must not
/// suppress another guardian's notice — see design-doc.md #5 Decision 4 — so
/// this uses allSettled rather than stopping at the first rejection.
async function notifyNewGuardians(
  teamId: string,
  guardians: { email: string }[],
): Promise<boolean> {
  if (guardians.length === 0) {
    return true;
  }

  const team = await getTeamById(teamId);
  const teamName = team?.name ?? "your team";
  const { subject, teamUrl } = buildAddedToTeamEmail({
    teamName,
    teamId,
    env: {
      AUTH_URL: process.env.AUTH_URL,
      VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
      VERCEL_URL: process.env.VERCEL_URL,
    },
  });

  const results = await Promise.allSettled(
    guardians.map((guardian) =>
      sendEmail({
        to: guardian.email,
        subject,
        react: AddedToTeamEmail({ teamName, teamUrl }),
      }),
    ),
  );

  return results.every((result) => result.status === "fulfilled" && result.value.ok);
}

/// The picker's filter, carried across the add so the owner keeps their place
/// in a list they may have narrowed to three names out of forty. Plain text
/// and re-encoded on the way out — it only ever becomes a `q` value on this
/// one page, never a destination.
function returningUrl(
  teamId: string,
  query: string,
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams();
  if (query) {
    params.set("q", query);
  }
  for (const [key, value] of Object.entries(extra)) {
    params.set(key, value);
  }
  const search = params.toString();
  return `/t/${teamId}/roster/returning${search ? `?${search}` : ""}`;
}

export async function addReturningPlayerAction(formData: FormData) {
  const teamId = extractTeamId(formData);
  const query = String(formData.get("q") ?? "").trim();
  const playerId = extractPlayerId(formData);

  let jerseyNumber: number | null;
  try {
    jerseyNumber = parseJerseyNumber(formData.get("jerseyNumber"));
  } catch {
    redirect(returningUrl(teamId, query, { error: "invalid-jersey" }));
  }

  let notify: GuardianLink[];
  try {
    await requireTeamAccess(teamId, { intent: "write", minRole: "OWNER" });

    // The picker is a global list by definition, so playerId comes from the
    // form rather than a teamId-scoped lookup. Re-check it against the same
    // predicate the candidate list was built from before writing — a stale
    // page (the player was added by another tab since render) is caught
    // here with a friendly error rather than reaching the database at all,
    // and @@unique([playerId, teamId]) still backstops the race.
    //
    // isReturningCandidate, not listReturningCandidates: the list swallows
    // database errors and returns [], which here would report an addable
    // player as unavailable and silently skip the write during an outage.
    if (!(await isReturningCandidate(teamId, playerId))) {
      redirect(returningUrl(teamId, query, { error: "not-a-candidate" }));
    }

    const result = await addReturningPlayer({ teamId, playerId, jerseyNumber });
    notify = result.notify;
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(returningUrl(teamId, query, { error: "access" }));
    }
    const failure = rosterWriteFailure(error);
    if (failure) {
      redirect(returningUrl(teamId, query, { error: failure }));
    }
    throw error;
  }

  // Past this point the roster spot and the memberships have committed. A
  // failure to *notify* must not surface as a 500 that implies nothing
  // happened — the guardians have access either way (design-doc.md #5
  // Decision 4), so it degrades to the email-failed banner.
  let allSent: boolean;
  try {
    allSent = await notifyNewGuardians(teamId, notify);
  } catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to send added-to-team notices:", message);
    allSent = false;
  }

  revalidatePath("/t/[teamId]/roster", "page");
  revalidatePath("/t/[teamId]/roster/returning", "page");

  // Stay on the picker.
  //
  // Adding a returning roster used to be N round trips with a Back-button
  // navigation between each: every successful add redirected away to the
  // roster, dropping the filter, so building a twelve-player squad meant
  // twelve trips back to a list that had forgotten where the owner was (C7).
  // The row for the player just added flips to "Added ✓" in place instead.
  //
  // A failed *notice* keeps them here too, with the warning attached — the
  // roster spot and the memberships have already committed, so sending them
  // somewhere else to read about an email would be doubly wrong.
  if (!allSent) {
    redirect(returningUrl(teamId, query, { error: "email-failed", added: playerId }));
  }
  redirect(returningUrl(teamId, query, { added: playerId }));
}
