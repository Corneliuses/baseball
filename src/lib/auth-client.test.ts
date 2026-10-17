// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readAuthClientConfig, type AuthClientEnv } from "./auth-client";

const ENV: AuthClientEnv = {
  AUTH_ISSUER: "https://auth.corneliuses.com",
  AUTH_CLIENT_ID: "client-123",
  AUTH_CLIENT_SECRET: "secret-456",
  AUTH_URL: "https://baseball.corneliuses.com",
};

describe("readAuthClientConfig", () => {
  it("derives the registered URIs from AUTH_URL", () => {
    expect(readAuthClientConfig(ENV)).toEqual({
      issuer: "https://auth.corneliuses.com",
      clientId: "client-123",
      clientSecret: "secret-456",
      origin: "https://baseball.corneliuses.com",
      redirectUri: "https://baseball.corneliuses.com/api/auth/callback",
      postLogoutRedirectUri: "https://baseball.corneliuses.com/",
    });
  });

  it.each([
    "https://baseball.corneliuses.com/",
    "https://baseball.corneliuses.com/api/auth",
    "  https://baseball.corneliuses.com  ",
  ])("reduces AUTH_URL %j to its origin", (authUrl) => {
    const config = readAuthClientConfig({ ...ENV, AUTH_URL: authUrl });

    expect(config.redirectUri).toBe(
      "https://baseball.corneliuses.com/api/auth/callback",
    );
    expect(config.postLogoutRedirectUri).toBe(
      "https://baseball.corneliuses.com/",
    );
  });

  it("keeps a local http origin and its port", () => {
    expect(
      readAuthClientConfig({ ...ENV, AUTH_URL: "http://localhost:3000" })
        .redirectUri,
    ).toBe("http://localhost:3000/api/auth/callback");
  });

  it("names one missing variable", () => {
    expect(() =>
      readAuthClientConfig({ ...ENV, AUTH_CLIENT_SECRET: undefined }),
    ).toThrow("AUTH_CLIENT_SECRET is not set");
  });

  it("names every missing variable at once, treating blank as missing", () => {
    expect(() =>
      readAuthClientConfig({ AUTH_URL: ENV.AUTH_URL, AUTH_ISSUER: "  " }),
    ).toThrow("AUTH_ISSUER, AUTH_CLIENT_ID, AUTH_CLIENT_SECRET are not set");
  });

  it.each(["not a url", "ftp://baseball.corneliuses.com"])(
    "rejects AUTH_URL %j by name",
    (authUrl) => {
      expect(() => readAuthClientConfig({ ...ENV, AUTH_URL: authUrl })).toThrow(
        "AUTH_URL is not an http(s) URL",
      );
    },
  );

  it("never echoes the secret in an error", () => {
    expect.assertions(1);
    try {
      readAuthClientConfig({ ...ENV, AUTH_URL: "nope" });
    } catch (error) {
      expect(String(error)).not.toContain("secret-456");
    }
  });
});

describe("getAuthClient", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Dynamic imports on purpose: these need a fresh module per test to observe
  // the lazy singleton, which is the one case AGENTS.md allows them for.
  it("reads nothing at import and throws by name on first use", async () => {
    vi.stubEnv("AUTH_ISSUER", "");
    const { getAuthClient } = await import("./auth-client");

    expect(() => getAuthClient()).toThrow("AUTH_ISSUER");
  });

  it("returns one client per process, built from the environment", async () => {
    for (const [name, value] of Object.entries(ENV)) {
      vi.stubEnv(name, value);
    }
    const { appOrigin, getAuthClient } = await import("./auth-client");

    const client = getAuthClient();
    expect(getAuthClient()).toBe(client);
    expect(client.issuer).toBe("https://auth.corneliuses.com");
    expect(client.clientId).toBe("client-123");
    expect(appOrigin()).toBe("https://baseball.corneliuses.com");

    const authorize = new URL(
      client.buildAuthorizeUrl({ state: "s", codeChallenge: "c" }),
    );
    expect(authorize.searchParams.get("redirect_uri")).toBe(
      "https://baseball.corneliuses.com/api/auth/callback",
    );
  });
});
