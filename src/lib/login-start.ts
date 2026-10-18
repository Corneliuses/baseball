import { getAuthClient } from "./auth-client";
import { safeCallbackUrl } from "./callback-url";
import { normalizeEmail } from "./email-address";
import {
  pendingLoginCookieName,
  pendingLoginCookieOptions,
  sealPendingLogin,
  type PendingLoginCookieOptions,
} from "./pending-login-cookie";

/// The first half of a login with the auth service: mint the PKCE verifier,
/// `state` and `nonce`, seal them into the pending-login cookie, and build the
/// authorize URL to send the browser to.
///
/// Shared by `GET /api/auth/login` and, at cutover, invitation accept, so the
/// two writers of the pending cookie cannot disagree on what goes in it. The
/// caller sets the returned cookie on its own response (`response.cookies` in
/// a route handler, `cookies()` in an action) and redirects.

/// The only `prompt` the app ever forwards. `login` makes the service show
/// its form even over a live single-sign-on session, which is what "Use a
/// different account" needs. `none` is left out on purpose: nothing here
/// handles a silent-login failure as anything but an error page, and
/// `select_account` has no meaning on a service with one account per person.
export type LoginPrompt = "login";

export function parseLoginPrompt(value: unknown): LoginPrompt | undefined {
  return value === "login" ? "login" : undefined;
}

export type BeginLoginInput = {
  /// Where to land after signing in. Sanitized here, and again on read.
  returnTo: unknown;
  /// The address to pre-fill and, at the callback, insist on.
  loginHint?: string | null;
  prompt?: LoginPrompt;
  /// The `usesSecureCookies` answer for this request.
  secure: boolean;
  now?: Date;
};

export type PendingLoginCookie = {
  name: string;
  value: string;
  options: PendingLoginCookieOptions;
};

export type BeganLogin = {
  authorizeUrl: string;
  cookie: PendingLoginCookie;
};

/**
 * Start one login.
 *
 * Throws when the auth service or `AUTH_SECRET` is not configured, naming the
 * variable; the caller decides how that reads to a person.
 */
export async function beginLogin({
  returnTo,
  loginHint,
  prompt,
  secure,
  now = new Date(),
}: BeginLoginInput): Promise<BeganLogin> {
  const client = getAuthClient();
  const { verifier, challenge, state, nonce } = await client.startLogin();

  // An address that normalizes to nothing is no hint at all — neither sent to
  // the service nor insisted on at the callback.
  const hint = loginHint ? normalizeEmail(loginHint) : "";

  const value = await sealPendingLogin(
    {
      verifier,
      state,
      nonce,
      returnTo: safeCallbackUrl(returnTo),
      ...(hint ? { loginHint: hint } : {}),
    },
    process.env.AUTH_SECRET ?? "",
    now,
  );

  return {
    authorizeUrl: client.buildAuthorizeUrl({
      state,
      codeChallenge: challenge,
      nonce,
      ...(prompt ? { prompt } : {}),
      ...(hint ? { loginHint: hint } : {}),
    }),
    cookie: {
      name: pendingLoginCookieName(secure),
      value,
      options: pendingLoginCookieOptions(secure),
    },
  };
}
