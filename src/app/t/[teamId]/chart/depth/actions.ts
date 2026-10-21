"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { chartWriteFailure } from "@/lib/chart";
import { COURT_POSITIONS } from "@/lib/court-positions";
import {
  boardOf,
  buildDepthDraft,
  sameDepth,
  validateDepthChart,
} from "@/lib/depth-chart";
import { byJerseyThenName } from "@/lib/chart-view";
import { getDepthChart, saveDepthChart } from "@/lib/roster";
import { hasDepthChart } from "@/lib/sport";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getTeamById } from "@/lib/teams";

import { parseJson } from "../form-json";

function extractTeamId(formData: FormData): string {
  const teamId = String(formData.get("teamId")).trim();
  if (!teamId || teamId === "null" || teamId === "undefined") {
    throw new Error("Invalid team ID");
  }
  return teamId;
}

const entryIdSchema = z.string().min(1).max(64);

/// The submitted board: one starter per court position (open spots omitted)
/// and the bench in order. Bounded like the baseball actions' schemas — not a
/// DoS guard (Next's body limit is), just a refusal of anything that could
/// never be a real board.
const depthSchema = z.object({
  starters: z
    .record(z.string(), entryIdSchema)
    .refine((starters) => Object.keys(starters).length <= COURT_POSITIONS.length),
  bench: z.array(entryIdSchema).max(50),
});

/**
 * Persist basketball's depth chart: five starters and the bench order.
 *
 * The client submits only who starts where and the bench in order; the roster
 * is re-read here rather than trusted, and bench slots are numbered by
 * `validateDepthChart`. The save replaces the whole chart, so the board this
 * editor loaded rides along as `baseline` and a mismatch against a fresh read
 * refuses the write (`chart-changed`) — the same lost-update guard as the
 * baseball editors, with the same knowingly-open read-then-write window.
 */
export async function saveDepthChartAction(formData: FormData) {
  const teamId = extractTeamId(formData);
  const page = `/t/${teamId}/chart/depth`;

  try {
    // Access first, before the payload is touched.
    await requireTeamAccess(teamId, { intent: "write", minRole: "COACH" });

    const parsed = depthSchema.safeParse(parseJson(formData.get("depth")));
    const parsedBaseline = depthSchema.safeParse(
      parseJson(formData.get("baseline")),
    );
    if (!parsed.success || !parsedBaseline.success) {
      redirect(`${page}?error=invalid-depth`);
    }

    const [team, entries] = await Promise.all([
      getTeamById(teamId),
      getDepthChart(teamId),
    ]);
    // The page 404s for any other sport, so only a forged POST reaches this:
    // it must not write court columns onto a baseball roster.
    if (!team || !hasDepthChart(team.sport)) {
      redirect(`${page}?error=access`);
    }

    const result = validateDepthChart(
      parsed.data,
      entries.map((entry) => entry.entryId),
    );
    if (!result.ok) {
      redirect(`${page}?error=${result.reason}`);
    }

    // Rebuilt the way the editor built its baseline — the page sorts the
    // roster jersey-then-name before `buildDepthDraft`, which decides where
    // unplaced kids sit on the bench — so an untouched chart compares equal.
    // A kid added to the roster since the page loaded changes the bench, and
    // is refused here rather than written around.
    if (
      !sameDepth(
        boardOf(buildDepthDraft([...entries].sort(byJerseyThenName))),
        parsedBaseline.data,
      )
    ) {
      redirect(`${page}?error=chart-changed`);
    }

    await saveDepthChart(teamId, result.assignments);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`${page}?error=access`);
    }
    if (chartWriteFailure(error) === "roster-changed") {
      redirect(`${page}?error=roster-changed`);
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      redirect(`${page}?error=depth-conflict`);
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/chart/depth", "page");
  revalidatePath("/t/[teamId]/view", "page");
  redirect(`${page}?saved=1`);
}
