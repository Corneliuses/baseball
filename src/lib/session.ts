import { cache } from "react";
import { auth } from "@/auth";

/// The one place the app asks who is calling.
///
/// Everything downstream — page loaders, server actions, and later the planned
/// MCP server for agent integration — goes through this function rather than
/// calling `auth()` directly. An MCP client carries no browser cookie under any
/// session strategy; it authenticates out of band. Keeping identity resolution
/// in one function is what makes adding that second source a one-file change,
/// and it is why the authorization decisions themselves (checkTeamAccess,
/// decideSignIn) take plain values instead of reading a request.

export type CurrentUser = {
  id: string;
  email: string | null;
  name: string | null;
};

/// Cached per request: a single page render asks "who is calling" several
/// times over (the layout, the page, and requireTeamAccess inside each), and
/// every `auth()` call is a session row lookup. Taking no arguments means the
/// cache key is trivially stable — unlike a function taking an options object,
/// where React's reference-identity keying would miss on every call.
export const getCurrentUser = cache(async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const user = session?.user;

  if (!user?.id) {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? null,
    name: user.name ?? null,
  };
});
