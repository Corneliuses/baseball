"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import {
  chartWriteFailure,
  battingOrderAfterNotPlaying,
  sameIdSet,
  samePositions,
  storedNotPlaying,
  storedPositions,
  validatePositions,
} from "@/lib/chart";
import { byJerseyThenName } from "@/lib/chart-view";
import { ALL_POSITIONS, OUTFIELD_SPOT_CAPACITY } from "@/lib/positions";
import { getChart, savePositions } from "@/lib/roster";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getTeamById } from "@/lib/teams";

import { parseJson, parseJsonList } from "../form-json";

function extractTeamId(formData: FormData): string {
  const teamId = String(formData.get("teamId")).trim();
  if (!teamId || teamId === "null" || teamId === "undefined") {
    throw new Error("Invalid team ID");
  }
  return teamId;
}

/**
 * The submitted board: entry ids per filled position — an array per spot,
 * since an allPlay outfield spot stacks to `OUTFIELD_SPOT_CAPACITY` (which is
 * also the biggest stack any real board can hold, so it bounds every array;
 * whether a given position may hold more than one is `validatePositions`'
 * question, not this shape's). Bounded like `orderSchema` next door — nine
 * positions is the whole enum, and entry ids are cuids, so 64 characters is
 * already generous.
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
  .record(
    z.string(),
    z.array(z.string().min(1).max(64)).max(OUTFIELD_SPOT_CAPACITY),
  )
  .refine((board) => Object.keys(board).length <= ALL_POSITIONS.length);

/// Entry ids taken out of the chart, and the set the page loaded. Bounded like
/// `orderSchema` next door.
const idListSchema = z.array(z.string().min(1).max(64)).max(50);

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

  try {
    // Access first, before the payload is touched. Server actions POST to the
    // page URL and this one is reachable without a session, so parsing ahead
    // of the check means an anonymous caller decides how much JSON we parse.
    // Nothing below this line runs for someone who isn't a coach on this team.
    await requireTeamAccess(teamId, { intent: "write", minRole: "COACH" });

    const parsed = positionsSchema.safeParse(parseJson(formData.get("positions")));
    const parsedBaseline = positionsSchema.safeParse(
      parseJson(formData.get("baseline")),
    );
    const parsedNotPlaying = idListSchema.safeParse(
      parseJsonList(formData.get("notPlaying")),
    );
    const parsedBaselineNotPlaying = idListSchema.safeParse(
      parseJsonList(formData.get("baselineNotPlaying")),
    );
    if (
      !parsed.success ||
      !parsedBaseline.success ||
      !parsedNotPlaying.success ||
      !parsedBaselineNotPlaying.success
    ) {
      redirect(`/t/${teamId}/chart/positions?error=invalid-positions`);
    }

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
      parsedNotPlaying.data,
    );
    if (!result.ok) {
      redirect(`/t/${teamId}/chart/positions?error=${result.reason}`);
    }

    // Lost-update guard. `savePositions` nulls every position on the team and
    // then writes this board, so it replaces the whole chart rather than
    // merging into it — with up to four coaches holding edit rights, two
    // editors open on two phones at the same field means whoever saves second
    // silently erases the first one's work, and chart edits have no history to
    // recover from (AGENTS.md). `validatePositions` can't see it: a stale
    // board's entry ids are all still on the roster.
    //
    // Checked after validation on purpose. A roster deletion moves the stored
    // board too, so testing this first would report "another coach changed the
    // positions" for what is really `unknown-entry`.
    //
    // This catches honest staleness between two of our own editors, which is
    // the whole hazard. It is not a permission check — a coach who wants to
    // overwrite the board can already do it by reloading first.
    //
    // Nor is it airtight: the read above and the write below are separate
    // statements, so a save landing between them is still lost. That window is
    // milliseconds against the minutes an editor sits open, and closing it
    // needs row locks or serializable isolation — not worth it for a handful
    // of coaches. Deliberate, and the reason to reach for a version column if
    // this ever needs to be exact.
    //
    // The not-playing set is guarded alongside the board, for the same reason
    // as in the batting action: this save replaces it wholesale.
    if (
      !samePositions(storedPositions(entries), parsedBaseline.data) ||
      !sameIdSet(storedNotPlaying(entries), parsedBaselineNotPlaying.data)
    ) {
      redirect(`/t/${teamId}/chart/positions?error=chart-changed`);
    }

    // Moving the not-playing set moves the batting order too, which this
    // editor doesn't otherwise touch: a batter taken out leaves a gap to close,
    // and on an allPlay team a kid brought back needs their slot back.
    // Null when neither happened, which leaves that column alone.
    //
    // Sorted first because getChart has no orderBy, and returned kids join the
    // order in roster order — the jersey-then-name order the batting editor
    // seats a slotless allPlay kid in on load, so the two agree.
    await savePositions(
      teamId,
      result.assignments,
      result.notPlaying,
      battingOrderAfterNotPlaying(
        [...entries].sort(byJerseyThenName),
        result.notPlaying,
        team.allPlay,
      ),
    );
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
