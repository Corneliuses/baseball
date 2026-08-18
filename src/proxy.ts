import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAMES } from "@/lib/session-cookie";

/// Next.js 16 renamed Middleware to Proxy. This file lives in `src/` rather than
/// the repository root because the convention is that it sits beside `app` — and
/// this project's router is `src/app`. A root proxy.ts would simply never run,
/// and it would fail silently.
///
/// It does exactly one job: redirect to sign-in when no session cookie is
/// present. It must stay that way.
///
/// Do not move the membership, role, or archived check in here, and do not
/// import from `@/auth`. Proxy runs on every request including prefetches, so
/// anything that touches the database fires on link hover — and more
/// fundamentally it cannot be the authorization boundary, because a server
/// action POSTs to the current page URL. Proxy can see /t/team-A/roster but not
/// which record the action mutates. Only the action knows that, which is why
/// requireTeamAccess runs inside it.
///
/// Cookie presence is not cookie validity. That is what "optimistic" means.

export function proxy(request: NextRequest) {
  const hasSessionCookie = SESSION_COOKIE_NAMES.some((name) =>
    request.cookies.has(name),
  );

  if (hasSessionCookie) {
    return NextResponse.next();
  }

  const signInUrl = new URL("/signin", request.url);
  signInUrl.searchParams.set(
    "callbackUrl",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );

  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: "/t/:path*",
};
