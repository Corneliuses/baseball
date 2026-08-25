"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { isGroupMeUrl } from "@/lib/groupme";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { archiveTeam, unarchiveTeam, updateTeam } from "@/lib/teams";

import type {
  TeamSettingsField,
  TeamSettingsState,
  TeamSettingsValues,
} from "./team-settings-state";

const updateTeamSchema = z.object({
  name: z.string().trim().min(1),
  season: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value)),
  allPlay: z.boolean(),
  // Empty clears the link; anything else must actually be a GroupMe URL —
  // team home renders this as a tappable "join the chat" link for every
  // family, so a typo'd or non-GroupMe address is refused, not stored.
  groupMeUrl: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .refine((value) => value === null || isGroupMeUrl(value)),
});

/// The inputs in the order they appear on screen, and the code each one's
/// failure reports.
///
/// Order is the whole point. Two fields can fail at once, and picking whichever
/// Zod happened to list first meant a bad name could hide behind a bad link —
/// the owner fixes the link, submits, and only then learns the name is empty.
/// Reporting the topmost offender instead means working down the form the way
/// it is read. Nothing is lost either way now that a rejection echoes the
/// values back, but being told about the second problem first is still wrong.
const FIELD_CODES: ReadonlyArray<readonly [TeamSettingsField, string]> = [
  ["name", "invalid-name"],
  ["groupMeUrl", "invalid-groupme"],
];

function firstInvalidField(
  error: z.ZodError,
): readonly [TeamSettingsField, string] {
  const hit = FIELD_CODES.find(([field]) =>
    error.issues.some((issue) => issue.path[0] === field),
  );
  // Every branch of the schema is keyed to one of the two fields above, so
  // the fallback is unreachable in practice — it exists so a field added to
  // the schema and forgotten here reports *something* rather than crashing.
  return hit ?? FIELD_CODES[0];
}

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

/// Name, season, all-play and the GroupMe link, saved together.
///
/// A `useActionState` action rather than a bare `<form action={...}>`: this is
/// a form people *type* into, and AGENTS.md's rule for those is that a
/// validation failure returns `{status: "invalid", ...}` with the typed values
/// intact. It used to redirect with `?error=`, which threw away the pasted
/// link along with any unsaved name and season edits in the same submit. That
/// path was very nearly unreachable while `required` was the only check the
/// browser could not satisfy; the GroupMe link made rejection routine.
///
/// Success and lost access still redirect. Success has new state to show and
/// nothing to preserve, and a save that can never succeed is not worth keeping
/// a form warm for.
export async function updateTeamAction(
  _prevState: TeamSettingsState,
  formData: FormData,
): Promise<TeamSettingsState> {
  const teamId = extractTeamId(formData);

  const values: TeamSettingsValues = {
    name: String(formData.get("name") ?? ""),
    season: String(formData.get("season") ?? ""),
    allPlay: formData.get("allPlay") === "on",
    groupMeUrl: String(formData.get("groupMeUrl") ?? ""),
  };

  const parsed = updateTeamSchema.safeParse(values);

  if (!parsed.success) {
    const [field, code] = firstInvalidField(parsed.error);
    return { status: "invalid", code, field, values };
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
