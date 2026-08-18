"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { signOut } from "@/auth";
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
  // Every other page that renders User.name or User.phone. This list mirrors
  // the table in src/lib/profile.ts — add a page there and here together, or
  // it serves the old value and the save looks broken.
  revalidatePath("/t/[teamId]/directory", "page");
  revalidatePath("/t/[teamId]/roster/[entryId]", "page");
  revalidatePath("/t/[teamId]/members", "page");
  revalidatePath("/t/[teamId]", "page");
  revalidatePath("/");
  redirect("/profile?saved=1");
}

/**
 * Sign out on this device.
 *
 * Both sign-in paths share one Session table and cookie name — see
 * src/lib/session-cookie.ts — so `signOut` finds the row whichever path
 * minted it. The row delete is best-effort, not guaranteed: `@auth/core`
 * logs a failed deleteSession and clears the cookie anyway, so a database
 * blip here can leave a row to age out on its own. Only this device's
 * session is touched — every other device holds its own row and cookie.
 */
export async function signOutAction() {
  try {
    await signOut({ redirectTo: "/" });
  } catch (error) {
    // Next implements redirect() by throwing, and signOut's success path
    // ends in one; never swallow that.
    unstable_rethrow(error);

    // Everything else — a malformed AUTH_URL, an Auth.js config failure —
    // is logged server-side. Without this the repo's lack of an error.tsx
    // means the person gets a raw error page while still signed in.
    console.error("Sign-out failed:", error);
    redirect("/profile?error=signout-failed");
  }
}
