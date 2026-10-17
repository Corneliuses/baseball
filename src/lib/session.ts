import { cache } from "react";
import { cookies, headers } from "next/headers";

import { readSessionToken, usesSecureCookies } from "@/lib/session-cookie";
import { findLiveSession } from "@/lib/sessions";

/// The one place the app asks who is calling.
///
/// Everything downstream — page loaders, server actions, and later the planned
/// MCP server for agent integration — goes through this function rather than
/// reading the session cookie itself. An MCP client carries no browser cookie
/// under any session strategy; it authenticates out of band. Keeping identity
/// resolution in one function is what makes adding that second source a
/// one-file change, and it is why the authorization decisions themselves
/// (checkTeamAccess, decideSignIn) take plain values instead of reading a
/// request.
///
/// The app reads its own `Session` table here rather than asking Auth.js. The
/// row and cookie are the same ones Auth.js writes (see `session-cookie.ts`),
/// so every session minted by a sign-in code, by an invitation, or later by the
/// auth service's callback resolves the same way.

export type CurrentUser = {
  id: string;
  email: string | null;
  name: string | null;
};

/// Cached per request: a single page render asks "who is calling" several
/// times over (the layout, the page, and requireTeamAccess inside each), and
/// every call is a session row lookup. Taking no arguments means the cache key
/// is trivially stable — unlike a function taking an options object, where
/// React's reference-identity keying would miss on every call.
export const getCurrentUser = cache(async function getCurrentUser(): Promise<CurrentUser | null> {
  // Which spelling to trust is decided the way it is decided when the cookie
  // is written, so a reader and a writer can never disagree about the name.
  const secure = usesSecureCookies({
    authUrl: process.env.AUTH_URL,
    forwardedProto: (await headers()).get("x-forwarded-proto"),
  });

  const cookieStore = await cookies();
  const token = readSessionToken((name) => cookieStore.get(name)?.value, secure);
  if (!token) {
    return null;
  }

  return findLiveSession(token);
});
