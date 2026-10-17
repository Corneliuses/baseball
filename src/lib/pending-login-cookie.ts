import { EncryptJWT, jwtDecrypt } from "jose";

import { safeCallbackUrl } from "./callback-url";
import { normalizeEmail } from "./email-address";

/// The state of one login in flight with the auth service, carried from
/// `GET /api/auth/login` to `GET /api/auth/callback` in a short-lived httpOnly
/// cookie.
///
/// Same shape as `pending-signin-cookie.ts`, which it replaces at cutover: the
/// name and attributes live in one module so the writers (the login route and,
/// later, invitation accept) and the one reader (the callback) cannot drift.
///
/// Unlike that cookie, this one is sealed. It holds the PKCE verifier, the
/// `state` the callback compares and the `nonce` the id token must echo, so a
/// readable or forgeable value would let anyone who can plant a cookie (a
/// sibling subdomain, a plain-HTTP response) pair their own authorization code
/// with the victim's browser — which is also why reading trusts only the
/// spelling this origin writes (`readPendingLogin`), and why that spelling is
/// `__Host-`. Sealing stops a forged value, not a replayed one: an attacker can
/// start a login of their own and copy out a genuinely sealed cookie. A
/// `__Secure-` cookie may still carry `Domain=corneliuses.com`, so an HTTPS
/// sibling subdomain could plant that copy here; `__Host-` forbids `Domain`
/// and so only this exact host can set it. It is encrypted with `dir` + `A256GCM`, keyed by
/// SHA-256 of `AUTH_SECRET`, and carries its own expiry, so a tampered, stale or
/// foreign-key value opens to `null` exactly like a missing one.
///
/// DB-free and framework-free: callers pass the secret and the clock, and a
/// cookie getter for reading, so every case tests without a request.

const BASE_NAME = "pending-login";
const SECURE_NAME = `__Host-${BASE_NAME}`;

/// How long a login may sit at the service's login page before the callback
/// stops recognizing it. Long enough to fetch an emailed code from another app
/// and type it in; short enough that an abandoned attempt does not linger.
export const PENDING_LOGIN_MAX_AGE_SECONDS = 60 * 10;

/// Both spellings, for clearing: the callback expires whichever one it was
/// handed, and a stray one from an earlier HTTP/HTTPS mix-up with it.
///
/// Reading does **not** walk this list — see `readPendingLogin`.
export const PENDING_LOGIN_COOKIE_NAMES = [SECURE_NAME, BASE_NAME] as const;

export function pendingLoginCookieName(secure: boolean): string {
  return secure ? SECURE_NAME : BASE_NAME;
}

export type PendingLoginCookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  /// `/`, because `__Host-` requires it. That sends a small, short-lived
  /// cookie with every request for ten minutes, which is a cheap price for
  /// host isolation; only the callback ever reads it.
  path: "/";
  secure: boolean;
  maxAge: number;
};

/**
 * The attributes the pending cookie is written with.
 *
 * `sameSite: "lax"` is load-bearing: the service redirects back to the callback
 * as a cross-site top-level GET, which lax admits and strict silently drops —
 * the failure would be every login ending in `?error=login-state`.
 */
export function pendingLoginCookieOptions(
  secure: boolean,
): PendingLoginCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: PENDING_LOGIN_MAX_AGE_SECONDS,
  };
}

/// The same cookie, expired. A browser only deletes a cookie whose name, path
/// and secure flag match the one it holds, so clearing goes through here
/// rather than a hand-written `maxAge: 0`.
export function clearedPendingLoginCookieOptions(
  secure: boolean,
): PendingLoginCookieOptions {
  return { ...pendingLoginCookieOptions(secure), maxAge: 0 };
}

export type PendingLogin = {
  /// PKCE code verifier, sent with the code exchange.
  verifier: string;
  /// Compared against the callback's `state` query parameter.
  state: string;
  /// Must equal the id token's `nonce` claim.
  nonce: string;
  /// Same-site path to land on after signing in, re-sanitized on every read.
  returnTo: string;
  /// The address an invitation was sent to, normalized. When present, the
  /// callback refuses a login as anyone else (a shared phone holding another
  /// family's service session) instead of silently signing that person in —
  /// comparing against `normalizeEmail(claims.email)`, never the raw claim.
  loginHint?: string;
};

/// HKDF's `info`: binds the derived key to this one purpose, so any other
/// value this app ever seals under `AUTH_SECRET` — with its own label — can
/// never be opened as a pending login, or the other way round.
const KEY_INFO = "baseball pending-login v1";

/**
 * The 256-bit content key, derived from `AUTH_SECRET`.
 *
 * Throws on an empty secret rather than sealing with a key anyone can
 * compute: a missing variable is a deploy problem and should fail loudly at
 * the first login, naming the variable.
 */
async function pendingLoginKey(secret: string): Promise<Uint8Array> {
  if (!secret) {
    throw new Error("AUTH_SECRET is not set — see .env.example");
  }

  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "HKDF",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(KEY_INFO),
    },
    material,
    256,
  );
  return new Uint8Array(bits);
}

function epochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

export async function sealPendingLogin(
  pending: PendingLogin,
  secret: string,
  now: Date,
): Promise<string> {
  const issuedAt = epochSeconds(now);
  const claims: Record<string, string> = {
    verifier: pending.verifier,
    state: pending.state,
    nonce: pending.nonce,
    returnTo: safeCallbackUrl(pending.returnTo),
  };
  const loginHint = pending.loginHint ? normalizeEmail(pending.loginHint) : "";
  if (loginHint) {
    claims.loginHint = loginHint;
  }

  return new EncryptJWT(claims)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + PENDING_LOGIN_MAX_AGE_SECONDS)
    .encrypt(await pendingLoginKey(secret));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Open a sealed value, or `null` for anything that is not a live pending login
 * sealed under this secret: absent, malformed, tampered, another key, expired,
 * or missing a field.
 *
 * `returnTo` goes back through `safeCallbackUrl` even though the writer
 * sanitized it — the seal proves who wrote it, not that the writer was right.
 */
export async function openPendingLogin(
  value: string | undefined,
  secret: string,
  now: Date,
): Promise<PendingLogin | null> {
  // Derived before the early return so a missing secret throws on every
  // read, not only when a cookie happens to be present.
  const key = await pendingLoginKey(secret);
  if (!value) {
    return null;
  }

  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtDecrypt(value, key, {
      keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: ["A256GCM"],
      currentDate: now,
      // An exact window: the cookie's own maxAge is the same 10 minutes, and
      // the clock reading it is the server that wrote it.
      clockTolerance: 0,
      requiredClaims: ["exp"],
    }));
  } catch {
    return null;
  }

  const { verifier, state, nonce, returnTo, loginHint } = payload;
  if (
    !nonEmptyString(verifier) ||
    !nonEmptyString(state) ||
    !nonEmptyString(nonce)
  ) {
    return null;
  }

  return {
    verifier,
    state,
    nonce,
    returnTo: safeCallbackUrl(returnTo),
    ...(nonEmptyString(loginHint) && normalizeEmail(loginHint)
      ? { loginHint: normalizeEmail(loginHint) }
      : {}),
  };
}

/**
 * The pending login, from the one cookie spelling this origin writes.
 *
 * Unlike `readPendingSignIn` this deliberately does not fall back to the other
 * spelling. A sealed value proves this server wrote it, not that it was written
 * for *this browser*: anyone can start a login, keep the cookie they get back,
 * and plant it on a victim along with their own authorization code. The bare
 * name can be planted by a sibling subdomain or a plain-HTTP response, so on an
 * HTTPS origin only the `__Host-` spelling is trusted: a browser accepts it
 * only from HTTPS on this exact host, with no `Domain` (which `__Secure-`
 * would still allow a sibling to set). That turns the remaining login-CSRF
 * path into "control this exact origin", which is game over anyway.
 *
 * `secure` is the same `usesSecureCookies` answer the writer used. Callers pass
 * their own getter (`request.cookies.get(name)?.value` in a route handler) so
 * this module stays free of Next.js.
 */
export async function readPendingLogin(
  read: (name: string) => string | undefined,
  options: { secure: boolean; secret: string; now: Date },
): Promise<PendingLogin | null> {
  return openPendingLogin(
    read(pendingLoginCookieName(options.secure)),
    options.secret,
    options.now,
  );
}
