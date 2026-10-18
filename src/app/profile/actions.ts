"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";

import { getAuthClient, getAuthConfig } from "@/lib/auth-client";
import { normalizePhone } from "@/lib/phone";
import { updateProfile } from "@/lib/profile";
import { getCurrentUser } from "@/lib/session";
import {
  clearedSessionCookieOptions,
  readSessionToken,
  sessionCookieName,
  usesSecureCookies,
} from "@/lib/session-cookie";
import { deleteUserSession } from "@/lib/sessions";

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
 * The app owns its sessions (`src/lib/sessions.ts`), so this deletes this
 * device's `Session` row and clears its cookie itself. Every other device
 * holds its own row and cookie and is untouched.
 *
 * A row created by the auth service's callback carries the id token it was
 * issued with; handing that back as `id_token_hint` lets the service end its
 * own single-sign-on session without a confirmation page, then return here. A
 * row with no id token — every session left over from the Auth.js era's
 * sign-in codes and invitation accepts — signs out locally only and lands on
 * the signed-out home page.
 *
 * A failed delete keeps the cookie and reports the failure. Clearing it
 * anyway would look signed out while leaving a live row behind for up to 90
 * days, and with no cookie left the person could not retry.
 */
export async function signOutAction() {
  let destination = "/";

  try {
    const secure = usesSecureCookies({
      authUrl: process.env.AUTH_URL,
      forwardedProto: (await headers()).get("x-forwarded-proto"),
    });
    const cookieStore = await cookies();
    const token = readSessionToken(
      (name) => cookieStore.get(name)?.value,
      secure,
    );

    // Delete first: if that throws, the cookie stays, so the error banner on
    // /profile can show (Proxy would bounce a cookie-less visit to sign-in)
    // and a second tap can retry against a row that is still live.
    const ended = token ? await deleteUserSession(token) : null;
    cookieStore.set(
      sessionCookieName(secure),
      "",
      clearedSessionCookieOptions(secure),
    );

    if (ended?.idToken) {
      destination = serviceLogoutUrl(ended.idToken);
    }
  } catch (error) {
    // Never swallow a Next control-flow throw.
    unstable_rethrow(error);

    // A database failure is logged server-side. Without this the repo's lack
    // of an error.tsx means the person gets a raw error page.
    console.error("Sign-out failed:", error);
    redirect("/profile?error=signout-failed");
  }

  redirect(destination);
}

/// The auth service's logout URL, or the home page when the service is not
/// configured. The local session is already gone by the time this runs, so a
/// missing variable must not turn a finished sign-out into an error page; the
/// service's own session simply outlives it, as it would on any other app.
function serviceLogoutUrl(idToken: string): string {
  try {
    return getAuthClient().buildLogoutUrl({
      idToken,
      postLogoutRedirectUri: getAuthConfig().postLogoutRedirectUri,
    });
  } catch (error) {
    console.error("Auth service logout skipped:", error);
    return "/";
  }
}
