"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { chartWriteFailure, validatePositions } from "@/lib/chart";
import { getChart, savePositions } from "@/lib/roster";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getTeamById } from "@/lib/teams";

function extractTeamId(formData: FormData): string {
  const teamId = String(formData.get("teamId")).trim();
  if (!teamId || teamId === "null" || teamId === "undefined") {
    throw new Error("Invalid team ID");
  }
  return teamId;
}

/// The submitted board: entry id per filled position. No size bound, unlike
/// `orderSchema` next door — there are only nine legal keys, and
/// `validatePositions` rejects on the first one that isn't a droppable position
/// for this team's allPlay setting, so a garbage payload dies at its first key.
const positionsSchema = z.record(z.string(), z.string().min(1));

/**
 * Persist the standing positions chart (#11).
 *
 * The client submits only WHICH entry stands WHERE. The roster and the
 * `allPlay` flag are re-loaded here rather than trusted from the form, so a
 * roster edit or a settings toggle that raced the editing session fails
 * validation instead of writing a chart the coach never saw.
 */
export async function savePositionsAction(formData: FormData) {
  const teamId = extractTeamId(formData);

  let submitted: unknown;
  try {
    submitted = JSON.parse(String(formData.get("positions")));
  } catch {
    redirect(`/t/${teamId}/chart/positions?error=invalid-positions`);
  }

  const parsed = positionsSchema.safeParse(submitted);
  if (!parsed.success) {
    redirect(`/t/${teamId}/chart/positions?error=invalid-positions`);
  }

  try {
    await requireTeamAccess(teamId, { intent: "write", minRole: "COACH" });

    const [team, entries] = await Promise.all([
      getTeamById(teamId),
      getChart(teamId),
    ]);
    if (!team) {
      redirect(`/t/${teamId}/chart/positions?error=access`);
    }

    const result = validatePositions(
      parsed.data,
      entries.map((entry) => entry.entryId),
      team.allPlay,
    );
    if (!result.ok) {
      redirect(`/t/${teamId}/chart/positions?error=${result.reason}`);
    }

    await savePositions(teamId, result.assignments);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`/t/${teamId}/chart/positions?error=access`);
    }
    const failure = chartWriteFailure(error);
    if (failure) {
      redirect(`/t/${teamId}/chart/positions?error=${failure}`);
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/chart/positions", "page");
  revalidatePath("/t/[teamId]/view", "page");
  redirect(`/t/${teamId}/chart/positions?saved=1`);
}
