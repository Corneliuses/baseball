// @vitest-environment node

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { createAuthClient } from "@corneliuses/auth-client";

/// The whole login, both routes, against an in-test auth service: a real
/// `createAuthClient` whose `fetch` serves a JWKS and the `/token` and
/// `/revoke` endpoints from the tables below. The app's own decisions
/// (`completeSignIn`) and its database (`sessions.ts`) are mocked; what is
/// under test is the HTTP choreography between them.

const ISSUER = "https://auth.example";
const CLIENT_ID = "app_test";
const ORIGIN = "https://baseball.example";

let privateKey: CryptoKey;
let publicJwk: JWK;

/// What the fake service does when the code is exchanged.
const service = {
  /// The nonce the id token carries; defaults to the one the authorize URL sent.
  nonce: undefined as string | undefined,
  email: "sam@example.com",
  emailVerified: true,
  tokenStatus: 200,
  revokeStatus: 200,
  revoked: [] as string[],
  exchanged: [] as URLSearchParams[],
};
let lastAuthorizeNonce: string | null = null;

async function mintIdToken(): Promise<string> {
  return new SignJWT({
    email: service.email,
    email_verified: service.emailVerified,
    nonce: service.nonce ?? lastAuthorizeNonce ?? undefined,
    amr: ["otp"],
    auth_time: Math.floor(Date.now() / 1000),
    sid: "sid-1",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: "k1" })
    .setIssuer(ISSUER)
    .setAudience(CLIENT_ID)
    .setSubject("sub-sam")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

const fakeFetch: typeof fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.pathname === "/.well-known/jwks.json") {
    return Response.json({ keys: [publicJwk] });
  }
  const body = new URLSearchParams(String(init?.body ?? ""));
  if (url.pathname === "/token") {
    service.exchanged.push(body);
    if (service.tokenStatus !== 200) {
      return Response.json(
        { error: "invalid_grant", error_description: "code expired" },
        { status: service.tokenStatus },
      );
    }
    return Response.json({
      access_token: "at",
      token_type: "Bearer",
      expires_in: 600,
      refresh_token: "rt-1",
      id_token: await mintIdToken(),
      scope: "openid email profile",
    });
  }
  if (url.pathname === "/revoke") {
    service.revoked.push(body.get("token") ?? "");
    return new Response(null, { status: service.revokeStatus });
  }
  return new Response("not found", { status: 404 });
};

const client = createAuthClient({
  issuer: ISSUER,
  clientId: CLIENT_ID,
  clientSecret: "secret",
  redirectUri: `${ORIGIN}/api/auth/callback`,
  fetch: fakeFetch,
});

vi.mock("@/lib/auth-client", () => ({
  getAuthClient: () => client,
}));

const completeSignIn = vi.fn();
vi.mock("@/lib/signin-callback", () => ({
  completeSignIn: (...args: unknown[]) => completeSignIn(...args),
}));

const createUserSession = vi.fn();
const deleteUserSession = vi.fn();
vi.mock("@/lib/sessions", () => ({
  createUserSession: (...args: unknown[]) => createUserSession(...args),
  deleteUserSession: (...args: unknown[]) => deleteUserSession(...args),
}));

import { GET as login } from "../login/route";
import { GET as callback } from "./route";

const SESSION_EXPIRES = new Date("2027-01-16T12:00:00Z");

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubEnv("AUTH_SECRET", "test-auth-secret");
  vi.stubEnv("AUTH_URL", ORIGIN);
  Object.assign(service, {
    nonce: undefined,
    email: "sam@example.com",
    emailVerified: true,
    tokenStatus: 200,
    revokeStatus: 200,
    revoked: [],
    exchanged: [],
  });
  lastAuthorizeNonce = null;
  completeSignIn.mockResolvedValue({ status: "signed-in", userId: "user-1" });
  createUserSession.mockResolvedValue({
    sessionToken: "new-session",
    expires: SESSION_EXPIRES,
  });
  deleteUserSession.mockResolvedValue(null);
});

function get(path: string, cookies: Record<string, string> = {}) {
  const request = new NextRequest(new URL(path, ORIGIN));
  for (const [name, value] of Object.entries(cookies)) {
    request.cookies.set(name, value);
  }
  return request;
}

function location(response: Response): URL {
  return new URL(response.headers.get("location") ?? "");
}

/// Run the login route and return what the browser would carry back.
async function startLogin(query = "callbackUrl=%2Fprofile") {
  const response = await login(get(`/api/auth/login?${query}`));
  const authorize = location(response);
  lastAuthorizeNonce = authorize.searchParams.get("nonce");
  const pendingCookie = response.cookies.get("__Host-pending-login");
  return {
    response,
    authorize,
    state: authorize.searchParams.get("state") ?? "",
    cookies: { "__Host-pending-login": pendingCookie?.value ?? "" },
  };
}

function expectError(response: NextResponse, key: string) {
  const url = location(response);
  expect(url.pathname).toBe("/signin");
  expect(url.searchParams.get("error")).toBe(key);
  expect(response.cookies.get("__Secure-authjs.session-token")).toBeUndefined();
}

function expectPendingCleared(response: NextResponse) {
  for (const name of ["__Host-pending-login", "pending-login"]) {
    const cleared = response.cookies.get(name);
    expect(cleared?.value).toBe("");
    expect(cleared?.maxAge).toBe(0);
  }
  expect(response.cookies.get("__Host-pending-login")?.secure).toBe(true);
}

describe("GET /api/auth/login", () => {
  it("redirects to the service with a sealed, host-pinned pending cookie", async () => {
    const { response, authorize, cookies } = await startLogin();

    expect(response.status).toBe(307);
    expect(authorize.origin).toBe(ISSUER);
    expect(authorize.pathname).toBe("/authorize");
    expect(authorize.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(authorize.searchParams.get("redirect_uri")).toBe(
      `${ORIGIN}/api/auth/callback`,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");

    const cookie = response.cookies.get("__Host-pending-login");
    expect(cookie).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: true,
      maxAge: 600,
    });
    // Sealed: nothing in it reads as the state.
    expect(cookies["__Host-pending-login"]).not.toContain(
      authorize.searchParams.get("state"),
    );
    expect(response.cookies.get("pending-login")).toBeUndefined();
  });

  it("uses the bare name over plain http", async () => {
    vi.stubEnv("AUTH_URL", "http://localhost:3000");
    const response = await login(get("/api/auth/login"));

    expect(response.cookies.get("pending-login")?.secure).toBe(false);
    expect(response.cookies.get("__Host-pending-login")).toBeUndefined();
  });

  it("forwards login_hint and only prompt=login", async () => {
    const hinted = await startLogin("login_hint=Sam%40Example.com&prompt=login");
    expect(hinted.authorize.searchParams.get("login_hint")).toBe("sam@example.com");
    expect(hinted.authorize.searchParams.get("prompt")).toBe("login");

    const other = await startLogin("prompt=none");
    expect(other.authorize.searchParams.has("prompt")).toBe(false);
  });

  it("fails to the sign-in page when the service is not configured", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    const response = await login(get("/api/auth/login"));

    expectError(response, "signin-failed");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("GET /api/auth/callback", () => {
  it("signs in: exchanges, verifies, revokes, writes the session, lands on returnTo", async () => {
    const { state, cookies } = await startLogin();

    const response = await callback(
      get(`/api/auth/callback?code=c1&state=${state}`, cookies),
    );

    expect(location(response).toString()).toBe(`${ORIGIN}/profile`);
    expect(response.headers.get("cache-control")).toBe("no-store");

    expect(service.exchanged[0].get("code")).toBe("c1");
    expect(service.exchanged[0].get("code_verifier")).toMatch(/^[\w-]{43}$/);
    expect(service.revoked).toEqual(["rt-1"]);

    expect(completeSignIn).toHaveBeenCalledWith(
      { sub: "sub-sam", email: "sam@example.com", email_verified: true },
      expect.any(Date),
    );
    expect(createUserSession).toHaveBeenCalledWith("user-1", expect.any(Date), {
      idToken: expect.stringMatching(/^ey/),
    });

    expect(response.cookies.get("__Secure-authjs.session-token")).toMatchObject({
      value: "new-session",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: true,
      expires: SESSION_EXPIRES,
    });
    expectPendingCleared(response);
  });

  it("replaces a session already on this device", async () => {
    const { state, cookies } = await startLogin();

    await callback(
      get(`/api/auth/callback?code=c1&state=${state}`, {
        ...cookies,
        "__Secure-authjs.session-token": "old-session",
      }),
    );

    expect(deleteUserSession).toHaveBeenCalledWith("old-session");
  });

  it("still signs in when revoking the refresh token fails", async () => {
    service.revokeStatus = 503;
    const { state, cookies } = await startLogin();

    const response = await callback(
      get(`/api/auth/callback?code=c1&state=${state}`, cookies),
    );

    expect(location(response).pathname).toBe("/profile");
    expect(response.cookies.get("__Secure-authjs.session-token")?.value).toBe(
      "new-session",
    );
  });

  it("refuses a callback with no pending cookie", async () => {
    const { state } = await startLogin();

    const response = await callback(get(`/api/auth/callback?code=c1&state=${state}`));

    expectError(response, "login-state");
    expectPendingCleared(response);
    expect(service.exchanged).toHaveLength(0);
  });

  it("refuses a state that does not match the cookie", async () => {
    const { cookies } = await startLogin();

    const response = await callback(
      get("/api/auth/callback?code=c1&state=forged", cookies),
    );

    expectError(response, "login-state");
    expect(service.exchanged).toHaveLength(0);
  });

  it("trusts only the __Host- spelling under https", async () => {
    const { state, cookies } = await startLogin();

    const response = await callback(
      get(`/api/auth/callback?code=c1&state=${state}`, {
        "pending-login": cookies["__Host-pending-login"],
      }),
    );

    expectError(response, "login-state");
  });

  it("maps the service's error parameter", async () => {
    const cases: [string, string][] = [
      ["access_denied", "access-denied"],
      ["login_required", "login-required"],
      ["interaction_required", "login-required"],
      ["server_error", "signin-failed"],
    ];
    for (const [error, key] of cases) {
      const { state, cookies } = await startLogin();
      const response = await callback(
        get(`/api/auth/callback?error=${error}&state=${state}`, cookies),
      );
      expectError(response, key);
      expectPendingCleared(response);
    }
    expect(service.exchanged).toHaveLength(0);
  });

  it("fails on a missing code", async () => {
    const { state, cookies } = await startLogin();

    const response = await callback(get(`/api/auth/callback?state=${state}`, cookies));

    expectError(response, "signin-failed");
  });

  it("fails when the code exchange is refused (an expired code)", async () => {
    service.tokenStatus = 400;
    const { state, cookies } = await startLogin();

    const response = await callback(
      get(`/api/auth/callback?code=c1&state=${state}`, cookies),
    );

    expectError(response, "signin-failed");
    expect(completeSignIn).not.toHaveBeenCalled();
  });

  it("fails on an id token carrying another login's nonce", async () => {
    service.nonce = "someone-elses-nonce";
    const { state, cookies } = await startLogin();

    const response = await callback(
      get(`/api/auth/callback?code=c1&state=${state}`, cookies),
    );

    expectError(response, "signin-failed");
    expect(completeSignIn).not.toHaveBeenCalled();
    expect(createUserSession).not.toHaveBeenCalled();
  });

  it("refuses an invitation login that came back as someone else", async () => {
    service.email = "other-parent@example.com";
    const { state, cookies } = await startLogin("login_hint=sam%40example.com");

    const response = await callback(
      get(`/api/auth/callback?code=c1&state=${state}`, cookies),
    );

    expectError(response, "account-mismatch");
    expect(completeSignIn).not.toHaveBeenCalled();
    // The refresh token is still revoked: the service did issue it.
    expect(service.revoked).toEqual(["rt-1"]);
  });

  it("matches the hint case-insensitively", async () => {
    service.email = "Sam@Example.com";
    const { state, cookies } = await startLogin("login_hint=sam%40example.com");

    const response = await callback(
      get(`/api/auth/callback?code=c1&state=${state}`, cookies),
    );

    expect(location(response).pathname).toBe("/");
  });

  it("sends a gate denial to not-invited, writing no session", async () => {
    completeSignIn.mockResolvedValue({ status: "denied", reason: "no-invitation" });
    const { state, cookies } = await startLogin();

    const response = await callback(
      get(`/api/auth/callback?code=c1&state=${state}`, cookies),
    );

    expectError(response, "not-invited");
    expect(createUserSession).not.toHaveBeenCalled();
  });

  it("sends an unverified or conflicting account to signin-failed, not not-invited", async () => {
    for (const reason of ["email-unverified", "account-conflict"]) {
      completeSignIn.mockResolvedValue({ status: "denied", reason });
      const { state, cookies } = await startLogin();

      const response = await callback(
        get(`/api/auth/callback?code=c1&state=${state}`, cookies),
      );

      expectError(response, "signin-failed");
    }
    expect(createUserSession).not.toHaveBeenCalled();
  });

  it("fails closed when completeSignIn fails", async () => {
    completeSignIn.mockResolvedValue({ status: "failed" });
    const { state, cookies } = await startLogin();

    const response = await callback(
      get(`/api/auth/callback?code=c1&state=${state}`, cookies),
    );

    expectError(response, "signin-failed");
    expect(createUserSession).not.toHaveBeenCalled();
  });

  it("fails when the session row cannot be written", async () => {
    createUserSession.mockRejectedValue(new Error("db down"));
    const { state, cookies } = await startLogin();

    const response = await callback(
      get(`/api/auth/callback?code=c1&state=${state}`, cookies),
    );

    expectError(response, "signin-failed");
  });

  it("re-sanitizes a returnTo from the cookie", async () => {
    const { state, cookies } = await startLogin("callbackUrl=%2F%2Fevil.example");

    const response = await callback(
      get(`/api/auth/callback?code=c1&state=${state}`, cookies),
    );

    expect(location(response).toString()).toBe(`${ORIGIN}/`);
  });

  it("works end to end over plain http in development", async () => {
    vi.stubEnv("AUTH_URL", "http://localhost:3000");
    const started = await login(get("/api/auth/login?callbackUrl=%2Ft%2Fa"));
    const authorize = location(started);
    lastAuthorizeNonce = authorize.searchParams.get("nonce");

    const response = await callback(
      get(
        `/api/auth/callback?code=c1&state=${authorize.searchParams.get("state")}`,
        { "pending-login": started.cookies.get("pending-login")?.value ?? "" },
      ),
    );

    expect(location(response).pathname).toBe("/t/a");
    expect(response.cookies.get("authjs.session-token")).toMatchObject({
      value: "new-session",
      secure: false,
    });
  });
});
