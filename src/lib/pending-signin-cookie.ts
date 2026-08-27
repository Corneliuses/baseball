import { safeCallbackUrl } from "./callback-url";
import { SIGNIN_CODE_MAX_AGE_SECONDS } from "./signin-code";

/// The address a sign-in code was just mailed to, carried from the request
/// form to the code-entry form in a short-lived httpOnly cookie — never a
/// query parameter, which would put someone's email address in history,
/// referrers and server logs (#60).
///
/// Same shape as `session-cookie.ts` and for the same reason: the attributes
/// live in one pure module so the writer (`requestSignInLink`) and the readers
/// (the check-email page and `submitSignInCode`) cannot drift. The `__Secure-`
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
export const PENDING_SIGNIN_COOKIE_NAMES = [BASE_NAME, SECURE_NAME] as const;

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
