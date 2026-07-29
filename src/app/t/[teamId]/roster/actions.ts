"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import {
  addPlayerToRoster,
  removeRosterEntry,
  updateRosterEntry,
} from "@/lib/roster";
import { parseJerseyNumber, rosterWriteFailure } from "@/lib/roster-rules";

function extractTeamId(formData: FormData): string {
  const teamId = String(formData.get("teamId")).trim();
  if (!teamId || teamId === "null" || teamId === "undefined") {
    throw new Error("Invalid team ID");
  }
  return teamId;
}

function extractEntryId(formData: FormData): string {
  const entryId = String(formData.get("entryId")).trim();
  if (!entryId || entryId === "null" || entryId === "undefined") {
    throw new Error("Invalid roster entry ID");
  }
  return entryId;
}

const playerSchema = z.object({
  name: z.string().trim().min(1),
  dateOfBirth: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value)),
});

function parseDateOfBirth(raw: string | null): Date | null {
  return raw ? new Date(raw) : null;
}

export async function addPlayerAction(formData: FormData) {
  const teamId = extractTeamId(formData);

  const parsed = playerSchema.safeParse({
    name: formData.get("name") ?? "",
    dateOfBirth: formData.get("dateOfBirth") ?? "",
  });

  if (!parsed.success) {
    redirect(`/t/${teamId}/roster?error=invalid-name`);
  }

  let jerseyNumber: number | null;
  try {
    jerseyNumber = parseJerseyNumber(formData.get("jerseyNumber"));
  } catch {
    redirect(`/t/${teamId}/roster?error=invalid-jersey`);
  }

  try {
    await requireTeamAccess(teamId, { intent: "write", minRole: "COACH" });
    await addPlayerToRoster(teamId, {
      name: parsed.data.name,
      dateOfBirth: parseDateOfBirth(parsed.data.dateOfBirth),
      jerseyNumber,
    });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`/t/${teamId}/roster?error=access`);
    }
    const failure = rosterWriteFailure(error);
    if (failure) {
      redirect(`/t/${teamId}/roster?error=${failure}`);
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/roster", "page");
  redirect(`/t/${teamId}/roster`);
}

export async function updateRosterEntryAction(formData: FormData) {
  const teamId = extractTeamId(formData);
  const entryId = extractEntryId(formData);

  const parsed = playerSchema.safeParse({
    name: formData.get("name") ?? "",
    dateOfBirth: formData.get("dateOfBirth") ?? "",
  });

  if (!parsed.success) {
    redirect(`/t/${teamId}/roster/${entryId}?error=invalid-name`);
  }

  let jerseyNumber: number | null;
  try {
    jerseyNumber = parseJerseyNumber(formData.get("jerseyNumber"));
  } catch {
    redirect(`/t/${teamId}/roster/${entryId}?error=invalid-jersey`);
  }

  try {
    await requireTeamAccess(teamId, { intent: "write", minRole: "COACH" });
    await updateRosterEntry(teamId, entryId, {
      name: parsed.data.name,
      dateOfBirth: parseDateOfBirth(parsed.data.dateOfBirth),
      jerseyNumber,
    });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`/t/${teamId}/roster/${entryId}?error=access`);
    }
    const failure = rosterWriteFailure(error);
    if (failure) {
      redirect(`/t/${teamId}/roster/${entryId}?error=${failure}`);
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/roster", "page");
  revalidatePath("/t/[teamId]/roster/[entryId]", "page");
  redirect(`/t/${teamId}/roster/${entryId}?saved=1`);
}

export async function removeRosterEntryAction(formData: FormData) {
  const teamId = extractTeamId(formData);
  const entryId = extractEntryId(formData);

  try {
    await requireTeamAccess(teamId, { intent: "write", minRole: "COACH" });
    await removeRosterEntry(teamId, entryId);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof TeamAccessError) {
      redirect(`/t/${teamId}/roster/${entryId}?error=access`);
    }
    throw error;
  }

  revalidatePath("/t/[teamId]/roster", "page");
  redirect(`/t/${teamId}/roster`);
}
