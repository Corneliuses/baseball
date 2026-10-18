import { randomUUID } from "node:crypto";

import { db } from "./db";

/// Database sessions: the app's own `Session` table, read and written here.
///
/// The app owns its sessions outright. `getCurrentUser` reads them through
/// `findLiveSession`, sign-out ends them through `deleteUserSession`, and
/// `createUserSession` writes them for the auth service's callback, the only
/// place a session is minted.
///
/// Rows are created exactly the way `@auth/core` created them in the Auth.js
/// era, so the rows it left behind read the same way: a
/// `crypto.randomUUID()` token and `expires` at now plus the session max age.
/// The cookie carries that token verbatim — database sessions hand out an
/// opaque row key rather than encrypting a payload the way JWT sessions do,
/// which is what made owning them outside Auth.js possible at all, and what
/// let the move to the auth service keep every live session.

/// Long enough that a parent at a ballfield is not re-authenticating on a
/// phone. Database sessions make this safe: a 90-day window is revocable by
/// deleting the row. Reads do not slide it (Auth.js's renewal could not set
/// the cookie from a Server Component anyway, so the row outlived the cookie).
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

export type CreatedSession = {
  sessionToken: string;
  expires: Date;
};

export async function createUserSession(
  userId: string,
  now: Date = new Date(),
  { idToken }: { idToken?: string } = {},
): Promise<CreatedSession> {
  return db.session.create({
    data: {
      sessionToken: randomUUID(),
      userId,
      expires: new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000),
      // Kept only to pass as `id_token_hint` at sign-out, which is what lets
      // the auth service end its own session without a confirmation page.
      ...(idToken ? { idToken } : {}),
    },
    select: { sessionToken: true, expires: true },
  });
}

export type SessionUser = {
  id: string;
  email: string | null;
  name: string | null;
};

/**
 * The person a session token belongs to, or null when there is no such row or
 * it has expired.
 *
 * Read-only: an expired row is left for the next sign-out or a cleanup rather
 * than deleted here, because this runs inside Server Components on every page.
 * A row is dead at its expiry instant. `@auth/core` lets it live through that
 * one millisecond; the difference cannot matter, and `<=` reads as "expired".
 */
export async function findLiveSession(
  sessionToken: string,
  now: Date = new Date(),
): Promise<SessionUser | null> {
  const row = await db.session.findUnique({
    where: { sessionToken },
    select: {
      expires: true,
      user: { select: { id: true, email: true, name: true } },
    },
  });

  if (!row || row.expires.getTime() <= now.getTime()) {
    return null;
  }

  return row.user;
}

/**
 * End one session. Returns the row's id token, for the auth service's logout,
 * or null when there was no such row.
 *
 * A missing row is not an error: a double-tapped sign-out, or a cookie whose
 * row already expired and was swept, ends in the same place. Any other
 * failure throws, and the caller decides what that means.
 */
export async function deleteUserSession(
  sessionToken: string,
): Promise<{ idToken: string | null } | null> {
  try {
    return await db.session.delete({
      where: { sessionToken },
      select: { idToken: true },
    });
  } catch (error) {
    // Prisma's "record to delete does not exist". Duck-typed for the reason
    // `rosterWriteFailure` gives: the generated client's error class is not a
    // stable import.
    if ((error as { code?: unknown } | null)?.code === "P2025") {
      return null;
    }
    throw error;
  }
}
