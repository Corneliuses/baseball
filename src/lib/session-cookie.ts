/// The session cookie: what it is called, how it is read, and the attributes
/// it is written with.
///
/// Several places have to agree on this. Auth.js writes the cookie when a
/// sign-in code is redeemed, `/invite/[token]` writes it when a parent accepts
/// an invitation, `getCurrentUser` (`session.ts`) reads it, the profile page's
/// sign-out clears it, and `proxy.ts` checks it is there. `src/auth.ts`
/// deliberately passes no `cookies` config, so what this module states is
/// Auth.js's own default, restated once instead of guessed at in each place:
/// `@auth/core`'s `defaultCookies` names the cookie
/// `${prefix}authjs.session-token` with `httpOnly`, `sameSite: "lax"` and
/// `path: "/"`, and applies the `__Secure-` prefix exactly when it marks the
/// cookie secure. The name outlives Auth.js on purpose: keeping it is what
/// keeps every live session through the move to the auth service.
///
/// Pure and dependency-free on purpose — `proxy.ts` imports it, and Proxy must
/// not pull in Auth.js or the database.

const BASE_NAME = "authjs.session-token";
const SECURE_NAME = `__Secure-${BASE_NAME}`;

/// Both spellings, for reading. Which one is present depends on whether the
/// session was established over HTTPS. Database sessions store a short opaque
/// token, so Auth.js's chunked `.0` variants never come into play.
export const SESSION_COOKIE_NAMES = [BASE_NAME, SECURE_NAME] as const;

export function sessionCookieName(secure: boolean): string {
  return secure ? SECURE_NAME : BASE_NAME;
}

/**
 * The session token this origin should trust, or null.
 *
 * Only the spelling this origin writes is read, exactly as Auth.js reads only
 * the one it would write. Falling back to the bare name on an HTTPS origin
 * would let anyone who can set a cookie for the host without `__Secure-` (a
 * sibling subdomain, a plain-HTTP response) plant their own session token and
 * have a signed-out visitor acting as them. `SESSION_COOKIE_NAMES` lists both
 * for `proxy.ts`, whose check is only optimistic.
 */
export function readSessionToken(
  read: (name: string) => string | undefined,
  secure: boolean,
): string | null {
  const value = read(sessionCookieName(secure));
  return value ? value : null;
}

export type SecureCookieInput = {
  /// `AUTH_URL`, when set. It wins, exactly as it does in Auth.js.
  authUrl?: string | null;
  /// The request's `x-forwarded-proto`, with or without a trailing colon.
  forwardedProto?: string | null;
};

/**
 * Whether cookies get the `secure` flag and the `__Secure-` prefix.
 *
 * Mirrors `createActionURL` in `@auth/core`: `AUTH_URL`'s protocol when that is
 * set, otherwise `x-forwarded-proto`, otherwise https. Disagreeing with Auth.js
 * here does not fail subtly — a `__Secure-` cookie sent over plain HTTP is
 * dropped by the browser outright, and writing the other spelling than Auth.js
 * reads would leave two sessions that never see each other.
 *
 * An unparseable `AUTH_URL` falls through to the header rather than throwing.
 * Signing a parent in is not the place to discover a malformed env var, and
 * Auth.js will raise its own error on the next request either way.
 */
export function usesSecureCookies({
  authUrl,
  forwardedProto,
}: SecureCookieInput): boolean {
  if (authUrl) {
    try {
      return new URL(authUrl).protocol === "https:";
    } catch {
      // Fall through to the header.
    }
  }

  if (!forwardedProto) {
    return true;
  }

  return forwardedProto.trim().replace(/:$/, "").toLowerCase() === "https";
}

export type SessionCookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
  expires: Date;
};

/**
 * The attributes Auth.js writes the session cookie with.
 *
 * `sameSite: "lax"` is load-bearing, for the reason `src/auth.ts` gives: an
 * invitation link clicked in an email client is a cross-site top-level
 * navigation that "strict" would silently drop. `expires` matches the
 * `Session` row's own expiry, so the cookie and the row die together.
 */
export function sessionCookieOptions(
  secure: boolean,
  expires: Date,
): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    expires,
  };
}

export type ClearedSessionCookieOptions = Omit<SessionCookieOptions, "expires"> & {
  maxAge: 0;
};

/// The same name-matching attributes with `maxAge: 0`, so the browser drops
/// the cookie. A `__Secure-` cookie is only replaced by one that is itself
/// secure, which is why this takes the flag rather than assuming it.
export function clearedSessionCookieOptions(
  secure: boolean,
): ClearedSessionCookieOptions {
  return { httpOnly: true, sameSite: "lax", path: "/", secure, maxAge: 0 };
}
