"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { archiveTeam, unarchiveTeam, updateTeam } from "@/lib/teams";

const updateTeamSchema = z.object({
  name: z.string().trim().min(1),
  season: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value)),
  allPlay: z.boolean(),
});

function extractTeamId(formData: FormData): string {
  const teamId = String(formData.get("teamId")).trim();
  if (!teamId || teamId === "null" || teamId === "undefined") {
    throw new Error("Invalid team ID");
  }
  return teamId;
}

/// A literal page path only revalidates that one page — revalidating the
/// dynamic-segment pattern with `type: "layout"` is what the docs specify
/// for refreshing a layout (the team name shown in the switcher chrome) and
/// every page nested beneath it, settings included.
/// (node_modules/next/dist/docs/.../revalidatePath.md)
function revalidateTeamPaths() {
  revalidatePath("/t/[teamId]", "layout");
  revalidatePath("/");
}

export async function updateTeamAction(formData: FormData) {
  const teamId = extractTeamId(formData);

  const parsed = updateTeamSchema.safeParse({
    name: formData.get("name") ?? "",
    season: formData.get("season") ?? "",
    allPlay: formData.get("allPlay") === "on",
  });

  if (!parsed.success) {
    redirect(`/t/${teamId}/settings?error=invalid-name`);
  }

  try {
    await requireTeamAccess(teamId, { intent: "write", minRole: "OWNER" });
    await updateTeam(teamId, parsed.data);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`/t/${teamId}/settings?error=access`);
    }
    throw error;
  }

  revalidateTeamPaths();
  redirect(`/t/${teamId}/settings?saved=1`);
}

export async function archiveTeamAction(formData: FormData) {
  const teamId = extractTeamId(formData);

  try {
    await requireTeamAccess(teamId, { intent: "write", minRole: "OWNER" });
    await archiveTeam(teamId);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`/t/${teamId}/settings?error=access`);
    }
    throw error;
  }

  revalidateTeamPaths();
  redirect(`/t/${teamId}/settings`);
}

export async function unarchiveTeamAction(formData: FormData) {
  const teamId = extractTeamId(formData);

  try {
    // Deliberately `intent: "read"`, not "write". checkTeamAccess rejects
    // every write to an archived team unconditionally, which would make this
    // the one action that could never run if it asked for "write" here —
    // it's the designed exit from that state, not a content mutation.
    // See design-doc.md #3 Decision 3.
    await requireTeamAccess(teamId, { intent: "read", minRole: "OWNER" });
    await unarchiveTeam(teamId);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`/t/${teamId}/settings?error=access`);
    }
    throw error;
  }

  revalidateTeamPaths();
  redirect(`/t/${teamId}/settings`);
}
