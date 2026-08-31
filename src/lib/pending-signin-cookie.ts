import { safeCallbackUrl } from "./callback-url";
import { SIGNIN_CODE_MAX_AGE_SECONDS } from "./signin-code";

/// The address a sign-in code was just mailed to, carried from the request
/// form to the code-entry form in a short-lived httpOnly cookie — never a
/// query parameter, which would put someone's email address in history,
/// referrers and server logs (#60).
///
/// Same shape as `session-cookie.ts` and for the same reason: the attributes
/// live in one pure module so the writer (`requestSignInCode`) and the readers
/// (the check-email page and `submitSignInCode`) cannot drift — which is also
/// why reading goes through `readPendingSignIn` rather than each caller
/// picking a cookie name for itself. The `__Secure-`
/// prefix follows `usesSecureCookies` exactly as the session cookie does.
///
/// The value is client-held and therefore client-tamperable, and that is fine:
/// a forged email only changes which identifier the typed code is verified
/// against, and the code was hashed against that identifier's row — a
/// mismatch fails exactly like a wrong code. The callbackUrl is re-sanitized
/// on every parse rather than trusted from the write.

const BASE_NAME = "pending-signin";
const SECURE_NAME = `__Secure-${BASE_NAME}`;

/// Both spellings, for reading — which one exists depends on whether the
/// request came in over HTTPS, same as the session cookie.
///
/// `__Secure-` first, and that order is load-bearing: only HTTPS can set a
/// `__Secure-` cookie, while the bare name can be planted by any sibling
/// subdomain or by a plain-HTTP response. Reading the bare one first let junk
/// there shadow the real cookie — and since a cookie that fails to parse was
/// treated as "no pending sign-in at all", that shadow locked the victim out
/// of signing in entirely, with no diagnostic. `readPendingSignIn` closes the
/// other half by taking the first cookie that *parses* rather than the first
/// that exists.
export const PENDING_SIGNIN_COOKIE_NAMES = [SECURE_NAME, BASE_NAME] as const;

export function pendingSignInCookieName(secure: boolean): string {
  return secure ? SECURE_NAME : BASE_NAME;
}

export type PendingSignInCookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  /// Scoped to the sign-in pages — nothing else reads it, so nothing else
  /// receives it. Path-matching covers /signin/check-email.
  path: "/signin";
  secure: boolean;
  maxAge: number;
};

export function pendingSignInCookieOptions(
  secure: boolean,
): PendingSignInCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/signin",
    secure,
    // The cookie and the code it belongs to expire together. A stale cookie
    // outliving the code would offer a form whose submission can only fail.
    maxAge: SIGNIN_CODE_MAX_AGE_SECONDS,
  };
}

export type PendingSignIn = {
  email: string;
  callbackUrl: string;
};

/**
 * The identifier Auth.js will store the verification token under. Mirrors
 * `defaultNormalizer` in `@auth/core`'s send-token step (NFKC, lowercase,
 * trim): the callback looks the token up by identifier, so the cookie has to
 * hold the same spelling Auth.js derived from the form value — a mixed-case
 * address stored verbatim would make every code "wrong".
 */
export function normalizeSignInEmail(email: string): string {
  return email.normalize("NFKC").toLowerCase().trim();
}

export function serializePendingSignIn(pending: PendingSignIn): string {
  return JSON.stringify(pending);
}

export function parsePendingSignIn(
  value: string | undefined,
): PendingSignIn | null {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { email?: unknown }).email !== "string" ||
      !(parsed as { email: string }).email.includes("@")
    ) {
      return null;
    }

    const { email, callbackUrl } = parsed as {
      email: string;
      callbackUrl?: unknown;
    };

    return {
      email: normalizeSignInEmail(email),
      callbackUrl: safeCallbackUrl(callbackUrl),
    };
  } catch {
    return null;
  }
}

/**
 * The pending sign-in, read from whichever cookie actually carries one.
 *
 * Callers pass their own getter (`(await cookies()).get(name)?.value` in a
 * page, the same in an action) so this module keeps its no-dependency rule
 * and stays testable without a request.
 *
 * Note "first that parses", not "first that exists" — see the ordering note
 * on `PENDING_SIGNIN_COOKIE_NAMES` for the lockout that distinction prevents.
 */
export function readPendingSignIn(
  read: (name: string) => string | undefined,
): PendingSignIn | null {
  for (const name of PENDING_SIGNIN_COOKIE_NAMES) {
    const pending = parsePendingSignIn(read(name));
    if (pending) {
      return pending;
    }
  }

  return null;
}
