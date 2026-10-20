"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { isOwnerEmail } from "@/lib/owner";
import { getCurrentUser } from "@/lib/session";
import { hasLineupChart } from "@/lib/sport";
import { createTeam } from "@/lib/teams";

import type {
  NewTeamField,
  NewTeamState,
  NewTeamValues,
} from "./new-team-state";

const createTeamSchema = z.object({
  name: z.string().trim().min(1),
  season: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value)),
  // Required, with no default: the form preselects nothing, so an absent
  // radio is the owner not having chosen, and nothing is assumed for them.
  sport: z.enum(["BASEBALL", "BASKETBALL"]),
});

/// The inputs in the order they appear on screen, and the code each one's
/// failure reports — the topmost offender wins, the same rule as the settings
/// form, so the owner works down the form the way it is read.
const FIELD_CODES: ReadonlyArray<readonly [NewTeamField, string]> = [
  ["name", "invalid-name"],
  ["sport", "invalid-sport"],
];

function firstInvalidField(error: z.ZodError): readonly [NewTeamField, string] {
  const hit = FIELD_CODES.find(([field]) =>
    error.issues.some((issue) => issue.path[0] === field),
  );
  return hit ?? FIELD_CODES[0];
}

/// No teamId exists yet to run requireTeamAccess against, so ownership is
/// checked directly here — and re-checked, never trusting that the page's
/// own gate ran, since a Server Action is independently reachable.
///
/// A `useActionState` action: a validation failure returns the typed values
/// rather than redirecting with `?error=`, which used to drop the team name.
/// Success, lost access and a failed write still redirect.
export async function createTeamAction(
  _prevState: NewTeamState,
  formData: FormData,
): Promise<NewTeamState> {
  const user = await getCurrentUser();
  if (!user || !isOwnerEmail(user.email, process.env.OWNER_EMAIL)) {
    redirect("/t/new?error=access");
  }

  const values: NewTeamValues = {
    name: String(formData.get("name") ?? ""),
    season: String(formData.get("season") ?? ""),
    sport: String(formData.get("sport") ?? ""),
    allPlay: formData.get("allPlay") === "on",
  };

  const parsed = createTeamSchema.safeParse(values);

  if (!parsed.success) {
    const [field, code] = firstInvalidField(parsed.error);
    return { status: "invalid", code, field, values };
  }

  // All-play ("every kid bats and fields") belongs to the lineup chart, which
  // only baseball has. For any other sport the field is left out entirely, even if a stray `allPlay=on` was
  // posted, so the column keeps its default and nothing claims a setting the
  // owner was never shown.
  const input =
    hasLineupChart(parsed.data.sport)
      ? { ...parsed.data, allPlay: values.allPlay }
      : parsed.data;

  let team;
  try {
    team = await createTeam(input, user.id);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Failed to create team:", error);
    redirect("/t/new?error=create-failed");
  }

  revalidatePath("/");
  redirect(`/t/${team.id}`);
}
