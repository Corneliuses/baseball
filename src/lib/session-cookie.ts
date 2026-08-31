/// The session cookie: what it is called, and the attributes it is written
/// with.
///
/// Three places have to agree on this. Auth.js writes the cookie when a magic
/// link is clicked, `/invite/[token]` writes it when a parent accepts an
/// invitation, and `proxy.ts` reads it. `src/auth.ts` deliberately passes no
/// `cookies` config, so what this module states is Auth.js's own default,
/// restated once instead of guessed at three times: `@auth/core`'s
/// `defaultCookies` names the cookie `${prefix}authjs.session-token` with
/// `httpOnly`, `sameSite: "lax"` and `path: "/"`, and applies the `__Secure-`
/// prefix exactly when it marks the cookie secure.
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
