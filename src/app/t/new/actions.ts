"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { isOwnerEmail } from "@/lib/owner";
import { getCurrentUser } from "@/lib/session";
import { createTeam } from "@/lib/teams";

const createTeamSchema = z.object({
  name: z.string().trim().min(1),
  season: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value)),
  allPlay: z.boolean(),
});

/// No teamId exists yet to run requireTeamAccess against, so ownership is
/// checked directly here — and re-checked, never trusting that the page's
/// own gate ran, since a Server Action is independently reachable.
export async function createTeamAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || !isOwnerEmail(user.email, process.env.OWNER_EMAIL)) {
    redirect("/t/new?error=access");
  }

  const parsed = createTeamSchema.safeParse({
    name: formData.get("name") ?? "",
    season: formData.get("season") ?? "",
    allPlay: formData.get("allPlay") === "on",
  });

  if (!parsed.success) {
    redirect("/t/new?error=invalid-name");
  }

  let team;
  try {
    team = await createTeam(parsed.data, user.id);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Failed to create team:", error);
    redirect("/t/new?error=create-failed");
  }

  revalidatePath("/");
  redirect(`/t/${team.id}`);
}
