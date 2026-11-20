"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { sameSkills, validateSkills } from "@/lib/skills";
import { hasSkills } from "@/lib/sport";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getTeamById, getTeamSkills, saveTeamSkills } from "@/lib/teams";

import { parseJson } from "../../chart/form-json";

function extractTeamId(formData: FormData): string {
  const teamId = String(formData.get("teamId")).trim();
  if (!teamId || teamId === "null" || teamId === "undefined") {
    throw new Error("Invalid team ID");
  }
  return teamId;
}

/// Bounded like the chart schemas: not a DoS guard, just a refusal of
/// anything that could never be a real list of skills.
const idsSchema = z.array(z.string().min(1).max(64)).max(50);

/**
 * Save a basketball team's at-home skills: the ones the coach ticked, at most
 * five. The playbook's save (`playbook/edit/actions.ts`) with the nouns changed.
 *
 * Coach+ and writable, then the sport — a forged POST must not write a
 * skills list onto a baseball team (rule 4). `validateSkills` is the boundary
 * on the ids; the form's disabled checkboxes are only a convenience.
 *
 * The save replaces the whole list and a team can have several coaches, so
 * the list the page loaded rides along as `baseline` and a mismatch
 * against a fresh read refuses the write (`skills-changed`) — the chart
 * editors' lost-update guard, with the same knowingly-open read-then-write
 * window.
 */
export async function saveSkillsAction(formData: FormData) {
  const teamId = extractTeamId(formData);
  const page = `/t/${teamId}/skills/edit`;

  try {
    await requireTeamAccess(teamId, { intent: "write", minRole: "COACH" });

    const chosen = idsSchema.safeParse(
      formData.getAll("skill").map((value) => String(value)),
    );
    const baseline = idsSchema.safeParse(parseJson(formData.get("baseline")));
    if (!chosen.success || !baseline.success) {
      redirect(`${page}?error=invalid-skills`);
    }

    const team = await getTeamById(teamId);
    if (!team || !hasSkills(team.sport)) {
      redirect(`${page}?error=access`);
    }

    const result = validateSkills(chosen.data);
    if (!result.ok) {
      redirect(`${page}?error=${result.reason}`);
    }

    if (!sameSkills(await getTeamSkills(teamId), baseline.data)) {
      redirect(`${page}?error=skills-changed`);
    }

    await saveTeamSkills(teamId, result.skillIds);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`${page}?error=access`);
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/skills", "page");
  revalidatePath("/t/[teamId]/skills/edit", "page");
  redirect(`${page}?saved=1`);
}
