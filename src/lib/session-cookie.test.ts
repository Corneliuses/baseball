import { describe, it, expect } from "vitest";

import {
  SESSION_COOKIE_NAMES,
  sessionCookieName,
  sessionCookieOptions,
  usesSecureCookies,
} from "./session-cookie";

describe("sessionCookieName", () => {
  it("uses the __Secure- prefix only when the cookie is secure", () => {
    expect(sessionCookieName(false)).toBe("authjs.session-token");
    expect(sessionCookieName(true)).toBe("__Secure-authjs.session-token");
  });

  // Proxy reads this list; the accept action writes one of its members. A name
  // in one and not the other is a session Proxy cannot see.
  it("lists exactly the two names it can write", () => {
    expect([...SESSION_COOKIE_NAMES].sort()).toEqual(
      [sessionCookieName(false), sessionCookieName(true)].sort(),
    );
  });
});

describe("usesSecureCookies", () => {
  it("takes AUTH_URL's protocol when it is set", () => {
    expect(usesSecureCookies({ authUrl: "https://team.example.com" })).toBe(true);
    expect(usesSecureCookies({ authUrl: "http://localhost:3000" })).toBe(false);
  });

  it("lets AUTH_URL win over a disagreeing forwarded protocol", () => {
    expect(
      usesSecureCookies({
        authUrl: "http://localhost:3000",
        forwardedProto: "https",
      }),
    ).toBe(false);
  });

  it("falls back to x-forwarded-proto when AUTH_URL is unset", () => {
    expect(usesSecureCookies({ forwardedProto: "https" })).toBe(true);
    expect(usesSecureCookies({ forwardedProto: "http" })).toBe(false);
  });

  it("accepts the header with or without a trailing colon, in any case", () => {
    expect(usesSecureCookies({ forwardedProto: "HTTPS:" })).toBe(true);
    expect(usesSecureCookies({ forwardedProto: " https " })).toBe(true);
    expect(usesSecureCookies({ forwardedProto: "HTTP" })).toBe(false);
  });

  // Matches createActionURL in @auth/core, which defaults an absent protocol to
  // https rather than to http.
  it("defaults to secure when neither is available", () => {
    expect(usesSecureCookies({})).toBe(true);
    expect(usesSecureCookies({ authUrl: "", forwardedProto: null })).toBe(true);
  });

  it("falls through to the header on an unparseable AUTH_URL", () => {
    expect(
      usesSecureCookies({ authUrl: "not a url", forwardedProto: "http" }),
    ).toBe(false);
  });
});

describe("sessionCookieOptions", () => {
  it("restates the Auth.js defaults, with the row's own expiry", () => {
    const expires = new Date("2026-11-01T00:00:00Z");

    expect(sessionCookieOptions(true, expires)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: true,
      expires,
    });
  });

  it("drops the secure flag alongside the prefix", () => {
    expect(sessionCookieOptions(false, new Date()).secure).toBe(false);
  });
});
