// @vitest-environment node

import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";

import { proxy, config } from "./proxy";

function request(path: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(new URL(path, "https://example.com"));

  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }

  return req;
}

describe("proxy", () => {
  it("runs on the signed-in-only routes: team-scoped pages and /profile", () => {
    expect(config.matcher).toEqual(["/t/:path*", "/profile"]);
  });

  it("redirects to sign-in when no session cookie is present", () => {
    const response = proxy(request("/t/team-a/roster"));

    expect(response.status).toBe(307);

    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/signin");
  });

  it("preserves the original path as callbackUrl", () => {
    const response = proxy(request("/t/team-a/roster?tab=chart"));

    const location = new URL(response.headers.get("location") ?? "");
    expect(location.searchParams.get("callbackUrl")).toBe(
      "/t/team-a/roster?tab=chart",
    );
  });

  it("passes through with a development session cookie", () => {
    const response = proxy(
      request("/t/team-a/roster", { "authjs.session-token": "session-value" }),
    );

    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });

  it("passes through with a production __Secure- session cookie", () => {
    const response = proxy(
      request("/t/team-a/roster", {
        "__Secure-authjs.session-token": "session-value",
      }),
    );

    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });

  it("does not treat an unrelated auth cookie as a session", () => {
    const response = proxy(
      request("/t/team-a", { "authjs.callback-url": "https://example.com" }),
    );

    expect(response.status).toBe(307);
  });
});
