"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { chartWriteFailure, validatePositions } from "@/lib/chart";
import { ALL_POSITIONS } from "@/lib/positions";
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

/**
 * The submitted board: entry id per filled position. Bounded like
 * `orderSchema` next door — nine positions is the whole enum, and entry ids
 * are cuids, so 64 characters is already generous.
 *
 * **Neither bound is a DoS guard**, and it would be wrong to add more of them
 * believing otherwise: `JSON.parse` above has already materialized the entire
 * payload by the time Zod sees it, and `z.record` walks every pair before a
 * `.refine` can fire. What actually bounds that work is Next's 1MB
 * server-action body limit (`serverActions.bodySizeLimit`, unconfigured in
 * next.config.ts so the default applies). The same goes for `orderSchema`'s
 * `.max(50)`. These bounds do one narrower thing: stop a payload that could
 * never be a real board from reaching `validatePositions` shaped like one.
 */
const positionsSchema = z
  .record(z.string(), z.string().min(1).max(64))
  .refine((board) => Object.keys(board).length <= ALL_POSITIONS.length);

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
