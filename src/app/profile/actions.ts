"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { normalizePhone } from "@/lib/phone";
import { updateProfile } from "@/lib/profile";
import { getCurrentUser } from "@/lib/session";

/**
 * Save the signed-in person's own name and phone.
 *
 * The userId comes from the session and never from the form. That is the
 * whole authorization story for this action: there is no id to forge, so
 * "edit my profile" cannot be aimed at somebody else's row the way a
 * hidden-input userId could be. It is also why this action needs no
 * `requireTeamAccess` — nothing here is team-scoped, and an archived team
 * must not stop a person from correcting their own phone number.
 */
export async function updateProfileAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/signin?callbackUrl=%2Fprofile");
  }

  const rawName = String(formData.get("name") ?? "").trim();

  let phone: string | null;
  try {
    phone = normalizePhone(formData.get("phone"));
  } catch {
    redirect("/profile?error=invalid-phone");
  }

  try {
    await updateProfile(user.id, { name: rawName === "" ? null : rawName, phone });
  } catch (error) {
    unstable_rethrow(error);
    redirect("/profile?error=save-failed");
  }

  revalidatePath("/profile");
  // Every other page that renders these two columns. The staff-facing pair
  // show this person's name, email, and phone to their coaches; the landing
  // page greets them by name; and the team home page reads the same columns
  // back through listCoachContacts, so a coach fixing their own number has
  // to reach the card their parents actually dial.
  revalidatePath("/t/[teamId]/directory", "page");
  revalidatePath("/t/[teamId]/roster/[entryId]", "page");
  revalidatePath("/t/[teamId]", "page");
  revalidatePath("/");
  redirect("/profile?saved=1");
}
