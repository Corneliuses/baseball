"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { chartWriteFailure, validateBattingOrder } from "@/lib/chart";
import { getChart, saveBattingOrder } from "@/lib/roster";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getTeamById } from "@/lib/teams";

function extractTeamId(formData: FormData): string {
  const teamId = String(formData.get("teamId")).trim();
  if (!teamId || teamId === "null" || teamId === "undefined") {
    throw new Error("Invalid team ID");
  }
  return teamId;
}

/// The submitted slots array: entry id per occupied slot, null per empty one.
/// Bounded well above any real roster so a garbage payload can't balloon the
/// validation work; the real ceiling is validateBattingOrder's slot count.
const orderSchema = z.array(z.string().min(1).nullable()).max(50);

/**
 * Persist the standing batting order (#10).
 *
 * The client submits only WHICH entry sits in WHICH slot — `battingOrder`
 * numbers are derived server-side from slot position, and the roster and
 * `allPlay` flag are re-loaded here rather than trusted from the form, so a
 * roster edit or settings toggle that raced the editing session fails
 * validation instead of writing a chart the coach never saw.
 */
export async function saveBattingOrderAction(formData: FormData) {
  const teamId = extractTeamId(formData);

  let submitted: unknown;
  try {
    submitted = JSON.parse(String(formData.get("order")));
  } catch {
    redirect(`/t/${teamId}/chart?error=invalid-order`);
  }

  const parsed = orderSchema.safeParse(submitted);
  if (!parsed.success) {
    redirect(`/t/${teamId}/chart?error=invalid-order`);
  }

  try {
    await requireTeamAccess(teamId, { intent: "write", minRole: "COACH" });

    const [team, entries] = await Promise.all([
      getTeamById(teamId),
      getChart(teamId),
    ]);
    if (!team) {
      redirect(`/t/${teamId}/chart?error=access`);
    }

    const result = validateBattingOrder(
      parsed.data,
      entries.map((entry) => entry.entryId),
      team.allPlay,
    );
    if (!result.ok) {
      redirect(`/t/${teamId}/chart?error=${result.reason}`);
    }

    await saveBattingOrder(teamId, result.assignments);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`/t/${teamId}/chart?error=access`);
    }
    const failure = chartWriteFailure(error);
    if (failure) {
      redirect(`/t/${teamId}/chart?error=${failure}`);
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/chart", "page");
  revalidatePath("/t/[teamId]/view", "page");
  redirect(`/t/${teamId}/chart?saved=1`);
}
