"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { samePlaybook, validatePlaybook } from "@/lib/plays";
import { hasPlaybook } from "@/lib/sport";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getTeamById, getTeamPlaybook, saveTeamPlaybook } from "@/lib/teams";

import { parseJson } from "../../chart/form-json";

function extractTeamId(formData: FormData): string {
  const teamId = String(formData.get("teamId")).trim();
  if (!teamId || teamId === "null" || teamId === "undefined") {
    throw new Error("Invalid team ID");
  }
  return teamId;
}

/// Bounded like the chart schemas: not a DoS guard, just a refusal of
/// anything that could never be a real playbook.
const idsSchema = z.array(z.string().min(1).max(64)).max(50);

/**
 * Save a basketball team's playbook: the plays the coach ticked, at most five.
 *
 * Coach+ and writable, then the sport — a forged POST must not write a
 * playbook onto a baseball team (rule 4). `validatePlaybook` is the boundary
 * on the ids; the form's disabled checkboxes are only a convenience.
 *
 * The save replaces the whole list and a team can have several coaches, so
 * the playbook the page loaded rides along as `baseline` and a mismatch
 * against a fresh read refuses the write (`playbook-changed`) — the chart
 * editors' lost-update guard, with the same knowingly-open read-then-write
 * window.
 */
export async function savePlaybookAction(formData: FormData) {
  const teamId = extractTeamId(formData);
  const page = `/t/${teamId}/playbook/edit`;

  try {
    await requireTeamAccess(teamId, { intent: "write", minRole: "COACH" });

    const chosen = idsSchema.safeParse(
      formData.getAll("play").map((value) => String(value)),
    );
    const baseline = idsSchema.safeParse(parseJson(formData.get("baseline")));
    if (!chosen.success || !baseline.success) {
      redirect(`${page}?error=invalid-playbook`);
    }

    const team = await getTeamById(teamId);
    if (!team || !hasPlaybook(team.sport)) {
      redirect(`${page}?error=access`);
    }

    const result = validatePlaybook(chosen.data);
    if (!result.ok) {
      redirect(`${page}?error=${result.reason}`);
    }

    if (!samePlaybook(await getTeamPlaybook(teamId), baseline.data)) {
      redirect(`${page}?error=playbook-changed`);
    }

    await saveTeamPlaybook(teamId, result.playIds);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`${page}?error=access`);
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/playbook", "page");
  revalidatePath("/t/[teamId]/playbook/edit", "page");
  redirect(`${page}?saved=1`);
}
