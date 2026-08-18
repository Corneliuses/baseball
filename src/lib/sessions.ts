import { randomUUID } from "node:crypto";

import { db } from "./db";

/// Database sessions, written directly.
///
/// Auth.js owns the `Session` table everywhere else. The one exception is
/// invitation acceptance, which signs a parent in from the token they were
/// mailed rather than making them fetch a second link out of their inbox — see
/// `src/app/invite/[token]/actions.ts`. Auth.js v5 exposes no "sign this user
/// in" API under the database strategy (`signIn` for an email provider always
/// mails a link and returns nothing usable), so the row is created here.
///
/// It is created exactly the way `@auth/core` creates it: a `crypto.randomUUID()`
/// token and `expires` at now plus the session max age. The cookie carries that
/// token verbatim — database sessions hand out an opaque row key rather than
/// encrypting a payload the way JWT sessions do, which is what makes writing
/// one from outside Auth.js possible at all.

/// Long enough that a parent at a ballfield is not re-authenticating on a
/// phone, sliding so that opening the app keeps it alive. Database sessions
/// make this safe: a 90-day window is revocable by deleting the row.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;
export const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;

export type CreatedSession = {
  sessionToken: string;
  expires: Date;
};

export async function createUserSession(
  userId: string,
  now: Date = new Date(),
): Promise<CreatedSession> {
  return db.session.create({
    data: {
      sessionToken: randomUUID(),
      userId,
      expires: new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000),
    },
    select: { sessionToken: true, expires: true },
  });
}
