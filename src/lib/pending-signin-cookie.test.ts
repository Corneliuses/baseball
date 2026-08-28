import { describe, expect, it } from "vitest";

import {
  PENDING_SIGNIN_COOKIE_NAMES,
  normalizeSignInEmail,
  parsePendingSignIn,
  pendingSignInCookieName,
  pendingSignInCookieOptions,
  readPendingSignIn,
  serializePendingSignIn,
} from "./pending-signin-cookie";
import { SIGNIN_CODE_MAX_AGE_SECONDS } from "./signin-code";

describe("pendingSignInCookieName", () => {
  it("applies the __Secure- prefix exactly when secure", () => {
    expect(pendingSignInCookieName(true)).toBe("__Secure-pending-signin");
    expect(pendingSignInCookieName(false)).toBe("pending-signin");
  });

  it("both spellings are listed for reading", () => {
    expect(PENDING_SIGNIN_COOKIE_NAMES).toContain(pendingSignInCookieName(true));
    expect(PENDING_SIGNIN_COOKIE_NAMES).toContain(
      pendingSignInCookieName(false),
    );
  });
});

describe("pendingSignInCookieOptions", () => {
  it("is httpOnly, lax, scoped to /signin, and dies with the code", () => {
    expect(pendingSignInCookieOptions(true)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      path: "/signin",
      secure: true,
      maxAge: SIGNIN_CODE_MAX_AGE_SECONDS,
    });
  });

  it("carries the secure flag through", () => {
    expect(pendingSignInCookieOptions(false).secure).toBe(false);
  });
});

describe("normalizeSignInEmail", () => {
  // Mirrors @auth/core's defaultNormalizer: the cookie must hold the same
  // spelling Auth.js stores the verification token under.
  it("lowercases, trims, and NFKC-normalizes", () => {
    expect(normalizeSignInEmail("  Parent@Example.COM ")).toBe(
      "parent@example.com",
    );
    // U+FF20 FULLWIDTH COMMERCIAL AT normalizes to a real @.
    expect(normalizeSignInEmail("a＠example.com")).toBe("a@example.com");
  });
});

describe("serialize / parse round trip", () => {
  it("carries email and callbackUrl through", () => {
    const value = serializePendingSignIn({
      email: "parent@example.com",
      callbackUrl: "/t/team-a/roster",
    });

    expect(parsePendingSignIn(value)).toEqual({
      email: "parent@example.com",
      callbackUrl: "/t/team-a/roster",
    });
  });
});

describe("parsePendingSignIn", () => {
  it("returns null for a missing cookie", () => {
    expect(parsePendingSignIn(undefined)).toBeNull();
    expect(parsePendingSignIn("")).toBeNull();
  });

  it("returns null for junk the client invented", () => {
    expect(parsePendingSignIn("not json")).toBeNull();
    expect(parsePendingSignIn("42")).toBeNull();
    expect(parsePendingSignIn("null")).toBeNull();
    expect(parsePendingSignIn('{"callbackUrl":"/"}')).toBeNull();
    expect(parsePendingSignIn('{"email":42}')).toBeNull();
    expect(parsePendingSignIn('{"email":"no-at-sign"}')).toBeNull();
  });

  it("re-normalizes an email that was tampered into mixed case", () => {
    expect(
      parsePendingSignIn('{"email":"Parent@Example.com","callbackUrl":"/"}'),
    ).toEqual({ email: "parent@example.com", callbackUrl: "/" });
  });

  it("re-sanitizes the callbackUrl rather than trusting the write", () => {
    for (const hostile of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
    ]) {
      const parsed = parsePendingSignIn(
        JSON.stringify({ email: "a@b.com", callbackUrl: hostile }),
      );
      expect(parsed?.callbackUrl).toBe("/");
    }
  });

  it("defaults a missing callbackUrl to the landing page", () => {
    expect(parsePendingSignIn('{"email":"a@b.com"}')?.callbackUrl).toBe("/");
  });
});

describe("readPendingSignIn", () => {
  const live = JSON.stringify({
    email: "parent@example.com",
    callbackUrl: "/t/team-a",
  });

  function reader(jar: Record<string, string>) {
    return (name: string) => jar[name];
  }

  it("reads either spelling", () => {
    expect(readPendingSignIn(reader({ "pending-signin": live }))?.email).toBe(
      "parent@example.com",
    );
    expect(
      readPendingSignIn(reader({ "__Secure-pending-signin": live }))?.email,
    ).toBe("parent@example.com");
  });

  it("returns null when the jar holds none", () => {
    expect(readPendingSignIn(reader({}))).toBeNull();
  });

  // The lockout this closes: the bare name can be planted by a sibling
  // subdomain or a plain-HTTP response, and taking the first cookie that
  // *existed* meant that junk shadowed the real one — leaving the victim
  // unable to sign in at all, with nothing on screen to explain it.
  it("ignores junk in the unprefixed name and uses the real cookie", () => {
    const pending = readPendingSignIn(
      reader({ "pending-signin": "not json", "__Secure-pending-signin": live }),
    );

    expect(pending?.email).toBe("parent@example.com");
  });

  it("ignores an empty planted cookie", () => {
    const pending = readPendingSignIn(
      reader({ "pending-signin": "", "__Secure-pending-signin": live }),
    );

    expect(pending?.email).toBe("parent@example.com");
  });

  // Both parse, so ordering alone decides — and the __Secure- one is the only
  // one an attacker on a sibling host could not have written.
  it("prefers the __Secure- cookie when both parse", () => {
    const pending = readPendingSignIn(
      reader({
        "pending-signin": JSON.stringify({
          email: "attacker@example.com",
          callbackUrl: "/",
        }),
        "__Secure-pending-signin": live,
      }),
    );

    expect(pending?.email).toBe("parent@example.com");
  });
});
