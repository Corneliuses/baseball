import { NextResponse, type NextRequest } from "next/server";

import { getAuthClient } from "@/lib/auth-client";
import { normalizeEmail } from "@/lib/email-address";
import {
  clearedPendingLoginCookieOptions,
  PENDING_LOGIN_COOKIE_NAMES,
  readPendingLogin,
} from "@/lib/pending-login-cookie";
import {
  readSessionToken,
  sessionCookieName,
  sessionCookieOptions,
  usesSecureCookies,
} from "@/lib/session-cookie";
import { createUserSession, deleteUserSession } from "@/lib/sessions";
import { completeSignIn } from "@/lib/signin-callback";
import type { SigninError } from "@/app/signin/signin-messages";

/// Where the auth service sends the browser back after a login. The second
/// half of `GET /api/auth/login`, and once Auth.js is gone the only place a
/// session is minted.
///
/// In order, each step's failure ending on `/signin?error=<key>` (the keys are
/// `SIGNIN_MESSAGES` in `src/app/signin/signin-messages.ts`):
///
/// 1. Read the pending-login cookie, and clear both spellings on whatever
///    response this returns: one login, one use.
/// 2. No live cookie, or a `state` that does not match it → `login-state`.
/// 3. An `error` from the service → `access-denied`, `login-required` or
///    `signin-failed`.
/// 4. Exchange the code and verify the id token against the cookie's nonce →
///    any failure is `signin-failed`.
/// 5. Revoke the refresh token, best-effort: the app calls no API, so it keeps
///    no tokens but the id token, and that only for `id_token_hint` at logout.
/// 6. A login that pinned an address (an invitation) but came back as someone
///    else → `account-mismatch`, before any row is linked or created.
/// 7. `completeSignIn` — the app's own gate — refuses → `not-invited` (or
///    `signin-failed` for an unverified or conflicting account).
/// 8. Otherwise write the `Session` row with the id token, set the session
///    cookie, and redirect to the cookie's `returnTo`.
///
/// Reads `request.cookies` and writes `response.cookies` rather than using
/// `next/headers`, so the whole flow tests with a `NextRequest`.

/// The service's OAuth `error` values this app tells apart. Anything else —
/// `server_error`, `invalid_request`, a value nobody has seen — reads as a
/// failure rather than a cancellation.
function serviceErrorKey(error: string): SigninError {
  switch (error) {
    case "access_denied":
      return "access-denied";
    case "login_required":
    case "interaction_required":
      return "login-required";
    default:
      return "signin-failed";
  }
}

export async function GET(request: NextRequest) {
  const now = new Date();
  const params = request.nextUrl.searchParams;
  const secure = usesSecureCookies({
    authUrl: process.env.AUTH_URL,
    forwardedProto: request.headers.get("x-forwarded-proto"),
  });

  const finish = (location: string): NextResponse => {
    const response = NextResponse.redirect(new URL(location, request.url));
    // Both spellings, each with its own secure flag: a browser only replaces
    // a cookie written with matching attributes, and `__Host-` is refused
    // outright unless it is secure.
    for (const name of PENDING_LOGIN_COOKIE_NAMES) {
      const clearSecure = name.startsWith("__Host-") ? true : secure;
      response.cookies.set(name, "", clearedPendingLoginCookieOptions(clearSecure));
    }
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  // Once the pending login is known, failures carry its destination back to
  // /signin as `callbackUrl`, so a retry or "Use a different account" lands
  // where the login was headed rather than on the home page.
  let returnTo = "/";
  const fail = (key: SigninError) => {
    const query = new URLSearchParams({ error: key });
    if (returnTo !== "/") {
      query.set("callbackUrl", returnTo);
    }
    return finish(`/signin?${query}`);
  };

  let pending;
  try {
    pending = await readPendingLogin(
      (name) => request.cookies.get(name)?.value,
      { secure, secret: process.env.AUTH_SECRET ?? "", now },
    );
  } catch (error) {
    // Only a missing AUTH_SECRET throws here.
    console.error("Sign-in callback could not read the pending login:", error);
    return fail("signin-failed");
  }

  if (!pending || params.get("state") !== pending.state) {
    return fail("login-state");
  }
  returnTo = pending.returnTo;

  const serviceError = params.get("error");
  if (serviceError) {
    return fail(serviceErrorKey(serviceError));
  }

  const code = params.get("code");
  if (!code) {
    return fail("signin-failed");
  }

  let idToken: string;
  let refreshToken: string | undefined;
  let claims;
  try {
    const client = getAuthClient();
    const tokens = await client.exchangeCode(code, pending.verifier);
    idToken = tokens.id_token;
    refreshToken = tokens.refresh_token;
    claims = await client.verifyIdToken(idToken, pending.nonce);
    // The signature proves who wrote these, not their shape.
    if (typeof claims.sub !== "string" || typeof claims.email !== "string") {
      throw new Error("id token is missing sub or email");
    }
  } catch (error) {
    // Includes a code that outlived its 60 seconds, a replayed code, a bad
    // signature and a nonce from another login.
    console.error("Sign-in callback could not verify the login:", error);
    return fail("signin-failed");
  }

  if (refreshToken) {
    try {
      await getAuthClient().revoke(refreshToken);
    } catch (error) {
      // Unrevoked, it simply expires at the service; nothing here holds it.
      console.warn("Could not revoke the auth service refresh token:", error);
    }
  }

  if (
    pending.loginHint &&
    pending.loginHint !== normalizeEmail(claims.email)
  ) {
    return fail("account-mismatch");
  }

  const result = await completeSignIn(
    {
      sub: claims.sub,
      email: claims.email,
      email_verified: claims.email_verified,
      ...(typeof claims.name === "string" ? { name: claims.name } : {}),
    },
    now,
  );
  if (result.status === "denied") {
    // Only the gate's refusal is "not invited". An unverified address or a
    // row bound to another service account is nothing a coach's invitation
    // can fix; both are logged by `completeSignIn` for the operator.
    return fail(result.reason === "no-invitation" ? "not-invited" : "signin-failed");
  }
  if (result.status === "failed") {
    return fail("signin-failed");
  }

  let session;
  try {
    session = await createUserSession(result.userId, now, { idToken });
  } catch (error) {
    console.error("Sign-in callback could not create a session:", error);
    return fail("signin-failed");
  }

  // Signing in over an existing session on this device replaces it; the old
  // row would otherwise sit unreachable for up to 90 days.
  const previous = readSessionToken(
    (name) => request.cookies.get(name)?.value,
    secure,
  );
  if (previous) {
    try {
      await deleteUserSession(previous);
    } catch (error) {
      console.warn("Could not delete the replaced session:", error);
    }
  }

  const response = finish(pending.returnTo);
  response.cookies.set(
    sessionCookieName(secure),
    session.sessionToken,
    sessionCookieOptions(secure, session.expires),
  );
  return response;
}
