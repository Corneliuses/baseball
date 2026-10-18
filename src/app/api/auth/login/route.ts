import { NextResponse, type NextRequest } from "next/server";

import { beginLogin, parseLoginPrompt } from "@/lib/login-start";
import { usesSecureCookies } from "@/lib/session-cookie";

/// Start a login with the auth service: seal the pending-login cookie and
/// send the browser to the service's authorize endpoint.
///
/// A Route Handler, not a page or an action, because it answers with a
/// redirect and a cookie and nothing else. Link to it with a plain `<a>`,
/// never `next/link`: a prefetch would start a login on hover, and the
/// router fetches a `<Link>` target as RSC first, which a redirect to another
/// origin cannot satisfy.
///
/// Static segments win over `[...nextauth]`, so this coexists with Auth.js
/// until the cutover deletes it.
///
/// Query parameters, all optional and all attacker-choosable:
/// - `callbackUrl`: where to land afterwards, reduced to a same-site path.
/// - `login_hint`: pre-fills the service's form; the callback then refuses a
///   login as anyone else. A forged hint can only make the visitor's own login
///   fail with `account-mismatch`, which offers a way out.
/// - `prompt`: only `login` is forwarded.

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const secure = usesSecureCookies({
    authUrl: process.env.AUTH_URL,
    forwardedProto: request.headers.get("x-forwarded-proto"),
  });

  let response: NextResponse;
  try {
    const { authorizeUrl, cookie } = await beginLogin({
      returnTo: params.get("callbackUrl"),
      loginHint: params.get("login_hint"),
      prompt: parseLoginPrompt(params.get("prompt")),
      secure,
    });
    response = NextResponse.redirect(authorizeUrl);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  } catch (error) {
    // A missing or malformed auth-service variable. The message names it in
    // the log; the person gets the generic failure.
    console.error("Could not start a login:", error);
    response = NextResponse.redirect(
      new URL("/signin?error=signin-failed", request.url),
    );
  }

  // Every response carries a fresh state and nonce; nothing may cache one.
  response.headers.set("Cache-Control", "no-store");
  return response;
}
