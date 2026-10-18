// @vitest-environment node
import { EncryptJWT } from "jose";
import { describe, expect, it } from "vitest";

import {
  PENDING_LOGIN_COOKIE_NAMES,
  PENDING_LOGIN_MAX_AGE_SECONDS,
  clearedPendingLoginCookieOptions,
  openPendingLogin,
  pendingLoginCookieName,
  pendingLoginCookieOptions,
  readPendingLogin,
  sealPendingLogin,
  type PendingLogin,
} from "./pending-login-cookie";

const SECRET = "test-auth-secret-0123456789abcdef";
const NOW = new Date("2026-10-17T12:00:00Z");

const PENDING: PendingLogin = {
  verifier: "verifier-abc",
  state: "state-abc",
  nonce: "nonce-abc",
  returnTo: "/t/team-1/schedule",
};

function later(seconds: number): Date {
  return new Date(NOW.getTime() + seconds * 1000);
}

/// The derivation restated, so tests can hand-craft values the sealer would
/// refuse to write. Restating it also pins it: a change to the label or hash
/// fails "re-sanitizes returnTo on read" rather than passing silently.
async function keyFor(secret: string, info = "baseball pending-login v1") {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "HKDF",
    false,
    ["deriveBits"],
  );
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(0),
        info: new TextEncoder().encode(info),
      },
      material,
      256,
    ),
  );
}

async function handSealed(
  claims: Record<string, unknown>,
  key: Uint8Array,
): Promise<string> {
  return new EncryptJWT(claims)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setExpirationTime(Math.floor(NOW.getTime() / 1000) + 60)
    .encrypt(key);
}

describe("pendingLoginCookieName", () => {
  it("applies the __Host- prefix exactly when secure", () => {
    expect(pendingLoginCookieName(true)).toBe("__Host-pending-login");
    expect(pendingLoginCookieName(false)).toBe("pending-login");
  });

  it("lists both spellings for clearing", () => {
    expect(PENDING_LOGIN_COOKIE_NAMES).toEqual([
      "__Host-pending-login",
      "pending-login",
    ]);
  });
});

describe("pendingLoginCookieOptions", () => {
  it("is httpOnly, lax, host-only at path /, and lives ten minutes", () => {
    expect(pendingLoginCookieOptions(true)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      // __Host- requires path / (and no Domain, which these options never set).
      path: "/",
      secure: true,
      maxAge: 600,
    });
    expect(PENDING_LOGIN_MAX_AGE_SECONDS).toBe(600);
  });

  it("clears with the same name-matching attributes and maxAge 0", () => {
    expect(clearedPendingLoginCookieOptions(false)).toEqual({
      ...pendingLoginCookieOptions(false),
      maxAge: 0,
    });
  });
});

describe("sealPendingLogin / openPendingLogin", () => {
  it("round-trips every field", async () => {
    const sealed = await sealPendingLogin(
      { ...PENDING, loginHint: "sam@example.com" },
      SECRET,
      NOW,
    );

    await expect(openPendingLogin(sealed, SECRET, later(60))).resolves.toEqual({
      ...PENDING,
      loginHint: "sam@example.com",
    });
  });

  it("normalizes loginHint, so the callback can compare it to a normalized claim", async () => {
    const sealed = await sealPendingLogin(
      { ...PENDING, loginHint: "  Sam@Example.com " },
      SECRET,
      NOW,
    );

    await expect(openPendingLogin(sealed, SECRET, NOW)).resolves.toMatchObject({
      loginHint: "sam@example.com",
    });
  });

  it("opens a hand-sealed value under the same derivation", async () => {
    // Guards the helper below: if this fails, the "refuses" cases that use it
    // would be passing for the wrong reason.
    await expect(
      openPendingLogin(await handSealed({ ...PENDING }, await keyFor(SECRET)), SECRET, NOW),
    ).resolves.toEqual(PENDING);
  });

  it("refuses a value keyed for another purpose under the same secret", async () => {
    // Domain separation: plain SHA-256 of the secret, or HKDF with another
    // label, must not open as a pending login.
    const sha = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SECRET)),
    );
    await expect(
      openPendingLogin(await handSealed({ ...PENDING }, sha), SECRET, NOW),
    ).resolves.toBeNull();
    await expect(
      openPendingLogin(
        await handSealed({ ...PENDING }, await keyFor(SECRET, "something else")),
        SECRET,
        NOW,
      ),
    ).resolves.toBeNull();
  });

  it("omits loginHint when none was sealed", async () => {
    const sealed = await sealPendingLogin(PENDING, SECRET, NOW);
    const opened = await openPendingLogin(sealed, SECRET, NOW);

    expect(opened).toEqual(PENDING);
    expect(opened).not.toHaveProperty("loginHint");
  });

  it("does not expose its contents in the cookie value", async () => {
    const sealed = await sealPendingLogin(PENDING, SECRET, NOW);

    expect(sealed).not.toContain("verifier-abc");
    expect(Buffer.from(sealed.split(".")[3] ?? "", "base64url").toString()).not.toContain(
      "verifier-abc",
    );
  });

  it("refuses a value sealed under another secret", async () => {
    const sealed = await sealPendingLogin(PENDING, "some-other-secret", NOW);

    await expect(openPendingLogin(sealed, SECRET, NOW)).resolves.toBeNull();
  });

  it("refuses a tampered value", async () => {
    const sealed = await sealPendingLogin(PENDING, SECRET, NOW);
    const parts = sealed.split(".");
    const ciphertext = parts[3] ?? "";
    parts[3] = (ciphertext[0] === "A" ? "B" : "A") + ciphertext.slice(1);

    await expect(
      openPendingLogin(parts.join("."), SECRET, NOW),
    ).resolves.toBeNull();
  });

  it("is live through its tenth minute and dead after it", async () => {
    const sealed = await sealPendingLogin(PENDING, SECRET, NOW);

    await expect(
      openPendingLogin(sealed, SECRET, later(PENDING_LOGIN_MAX_AGE_SECONDS - 1)),
    ).resolves.not.toBeNull();
    await expect(
      openPendingLogin(sealed, SECRET, later(PENDING_LOGIN_MAX_AGE_SECONDS + 1)),
    ).resolves.toBeNull();
  });

  it("refuses a value with no expiry, even under the right key", async () => {
    const forever = await new EncryptJWT({ ...PENDING })
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
      .encrypt(await keyFor(SECRET));

    await expect(openPendingLogin(forever, SECRET, NOW)).resolves.toBeNull();
  });

  it("refuses a value missing a required field", async () => {
    const partial = await handSealed(
      { state: "s", nonce: "n", returnTo: "/" },
      await keyFor(SECRET),
    );

    await expect(openPendingLogin(partial, SECRET, NOW)).resolves.toBeNull();
  });

  it.each([undefined, "", "not-a-jwe", "a.b.c.d.e"])(
    "opens %j to null",
    async (value) => {
      await expect(openPendingLogin(value, SECRET, NOW)).resolves.toBeNull();
    },
  );

  it.each([
    "https://evil.example/steal",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "/\t/evil.example",
  ])("sanitizes a hostile returnTo %j to /", async (returnTo) => {
    const sealed = await sealPendingLogin({ ...PENDING, returnTo }, SECRET, NOW);

    await expect(openPendingLogin(sealed, SECRET, NOW)).resolves.toMatchObject({
      returnTo: "/",
    });
  });

  it("re-sanitizes returnTo on read, not only on write", async () => {
    // A value sealed by something other than sealPendingLogin — a future
    // writer that forgot to sanitize — still cannot redirect off-site.
    const sealed = await handSealed(
      { ...PENDING, returnTo: "//evil.example" },
      await keyFor(SECRET),
    );

    await expect(openPendingLogin(sealed, SECRET, NOW)).resolves.toMatchObject({
      returnTo: "/",
    });
  });

  it("throws, naming the variable, when the secret is empty", async () => {
    await expect(sealPendingLogin(PENDING, "", NOW)).rejects.toThrow(
      "AUTH_SECRET",
    );
    await expect(openPendingLogin(undefined, "", NOW)).rejects.toThrow(
      "AUTH_SECRET",
    );
  });
});

describe("readPendingLogin", () => {
  const options = { secret: SECRET, now: NOW };

  it("reads the __Host- spelling on an HTTPS origin", async () => {
    const sealed = await sealPendingLogin(PENDING, SECRET, NOW);
    const jar: Record<string, string> = { "__Host-pending-login": sealed };

    await expect(
      readPendingLogin((name) => jar[name], { ...options, secure: true }),
    ).resolves.toEqual(PENDING);
  });

  it("reads the bare spelling on a plain-HTTP origin", async () => {
    const sealed = await sealPendingLogin(PENDING, SECRET, NOW);
    const jar: Record<string, string> = { "pending-login": sealed };

    await expect(
      readPendingLogin((name) => jar[name], { ...options, secure: false }),
    ).resolves.toEqual(PENDING);
  });

  it("never trusts a bare cookie on an HTTPS origin, however valid", async () => {
    // Login CSRF: an attacker starts their own login, keeps the sealed cookie
    // that comes back, and plants it under the bare name (a sibling subdomain
    // or plain-HTTP response can; neither can set __Host-). Its seal is
    // genuine, so the only defence is not reading that spelling at all.
    const planted = await sealPendingLogin(
      { ...PENDING, state: "attacker-state" },
      SECRET,
      NOW,
    );
    const jar: Record<string, string> = { "pending-login": planted };

    await expect(
      readPendingLogin((name) => jar[name], { ...options, secure: true }),
    ).resolves.toBeNull();
  });

  // __Secure- admits Domain=corneliuses.com, so an HTTPS sibling subdomain
  // could plant a genuinely sealed copy under that name. __Host- cannot be
  // set by anyone but this host; the __Secure- spelling is never read.
  it("never trusts a __Secure- cookie a sibling subdomain could plant", async () => {
    const planted = await sealPendingLogin(
      { ...PENDING, state: "attacker-state" },
      SECRET,
      NOW,
    );
    const jar: Record<string, string> = { "__Secure-pending-login": planted };

    await expect(
      readPendingLogin((name) => jar[name], { ...options, secure: true }),
    ).resolves.toBeNull();
  });

  it("ignores a planted bare cookie beside the real one", async () => {
    const real = await sealPendingLogin(PENDING, SECRET, NOW);
    const planted = await sealPendingLogin(
      { ...PENDING, state: "attacker-state" },
      SECRET,
      NOW,
    );
    const jar: Record<string, string> = {
      "__Host-pending-login": real,
      "pending-login": planted,
    };

    await expect(
      readPendingLogin((name) => jar[name], { ...options, secure: true }),
    ).resolves.toMatchObject({ state: "state-abc" });
  });

  it("is null when the cookie is absent", async () => {
    await expect(
      readPendingLogin(() => undefined, { ...options, secure: true }),
    ).resolves.toBeNull();
  });
});
