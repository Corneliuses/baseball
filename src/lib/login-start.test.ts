// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthClient } from "@corneliuses/auth-client";

vi.mock("@/lib/auth-client", () => ({
  getAuthClient: () =>
    createAuthClient({
      issuer: "https://auth.example",
      clientId: "app_test",
      clientSecret: "secret",
      redirectUri: "https://baseball.example/api/auth/callback",
    }),
}));

import { beginLogin, parseLoginPrompt } from "./login-start";
import { openPendingLogin } from "./pending-login-cookie";

const SECRET = "test-auth-secret";
const NOW = new Date("2026-10-18T12:00:00Z");

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", SECRET);
});

describe("parseLoginPrompt", () => {
  it("forwards only login", () => {
    expect(parseLoginPrompt("login")).toBe("login");
    for (const value of ["none", "select_account", "LOGIN", "", null, undefined]) {
      expect(parseLoginPrompt(value)).toBeUndefined();
    }
  });
});

describe("beginLogin", () => {
  it("seals the values the authorize URL carries", async () => {
    const { authorizeUrl, cookie } = await beginLogin({
      returnTo: "/t/team-a",
      secure: true,
      now: NOW,
    });

    const url = new URL(authorizeUrl);
    expect(url.origin + url.pathname).toBe("https://auth.example/authorize");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.has("prompt")).toBe(false);
    expect(url.searchParams.has("login_hint")).toBe(false);

    const pending = await openPendingLogin(cookie.value, SECRET, NOW);
    expect(pending).toMatchObject({
      state: url.searchParams.get("state"),
      nonce: url.searchParams.get("nonce"),
      returnTo: "/t/team-a",
    });
    expect(pending?.loginHint).toBeUndefined();
  });

  it("names the cookie for the scheme and pins it to this host under https", async () => {
    const secure = await beginLogin({ returnTo: "/", secure: true, now: NOW });
    expect(secure.cookie.name).toBe("__Host-pending-login");
    expect(secure.cookie.options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: true,
      maxAge: 600,
    });

    const plain = await beginLogin({ returnTo: "/", secure: false, now: NOW });
    expect(plain.cookie.name).toBe("pending-login");
    expect(plain.cookie.options.secure).toBe(false);
  });

  it("reduces a hostile returnTo to the home page", async () => {
    for (const returnTo of ["https://evil.example", "//evil.example", "/\\evil", null]) {
      const { cookie } = await beginLogin({ returnTo, secure: true, now: NOW });
      expect((await openPendingLogin(cookie.value, SECRET, NOW))?.returnTo).toBe("/");
    }
  });

  it("normalizes the hint, sends it, and pins it in the cookie", async () => {
    const { authorizeUrl, cookie } = await beginLogin({
      returnTo: "/",
      loginHint: "  Sam@Example.COM ",
      prompt: "login",
      secure: true,
      now: NOW,
    });

    const url = new URL(authorizeUrl);
    expect(url.searchParams.get("login_hint")).toBe("sam@example.com");
    expect(url.searchParams.get("prompt")).toBe("login");
    expect((await openPendingLogin(cookie.value, SECRET, NOW))?.loginHint).toBe(
      "sam@example.com",
    );
  });

  it("treats a blank hint as none", async () => {
    const { authorizeUrl, cookie } = await beginLogin({
      returnTo: "/",
      loginHint: "   ",
      secure: true,
      now: NOW,
    });

    expect(new URL(authorizeUrl).searchParams.has("login_hint")).toBe(false);
    expect((await openPendingLogin(cookie.value, SECRET, NOW))?.loginHint).toBeUndefined();
  });

  it("throws without AUTH_SECRET rather than sealing with an empty key", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    await expect(
      beginLogin({ returnTo: "/", secure: true, now: NOW }),
    ).rejects.toThrow(/AUTH_SECRET/);
  });
});
