import { createAuthClient, type AuthClient } from "@corneliuses/auth-client";

/// The one configured client for the auth service (auth.corneliuses.com).
///
/// Same posture as `src/lib/db.ts`: nothing is read at import, so `next build`
/// needs none of these variables, and a missing one fails the first login with
/// an error naming it rather than every page. Route handlers and actions call
/// `getAuthClient()`; nothing in a component should.
///
/// The redirect and post-logout URIs are derived from `AUTH_URL`, never from
/// the request. The service matches redirect URIs exactly, so the value has to
/// be the one registered for this environment — and a Host header is something
/// a caller chooses. That is also why `AUTH_URL` is required here with no
/// Vercel-URL fallback (unlike `absolute-url.ts`): a per-deploy
/// `*.vercel.app` origin is never registered, so falling back to it would only
/// trade a clear configuration error for the service's redirect-mismatch page.

export type AuthClientEnv = {
  AUTH_ISSUER?: string;
  AUTH_CLIENT_ID?: string;
  AUTH_CLIENT_SECRET?: string;
  AUTH_URL?: string;
};

export type AuthClientConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /// This deployment's origin, from `AUTH_URL` with any path dropped.
  origin: string;
  /// `${origin}/api/auth/callback` — registered per environment.
  redirectUri: string;
  /// `${origin}/` — registered per environment, matched byte for byte, so the
  /// trailing slash is part of the value.
  postLogoutRedirectUri: string;
};

const REQUIRED = [
  "AUTH_ISSUER",
  "AUTH_CLIENT_ID",
  "AUTH_CLIENT_SECRET",
  "AUTH_URL",
] as const;

/**
 * Read and check the auth service configuration. Pure: tests pass an object,
 * `getAuthConfig` passes the four variables read from `process.env`.
 *
 * Throws naming every missing variable at once, so a half-configured Vercel
 * environment is fixed in one pass rather than one redeploy per variable.
 */
export function readAuthClientConfig(env: AuthClientEnv): AuthClientConfig {
  const missing = REQUIRED.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not set — see .env.example`,
    );
  }

  let origin: string;
  try {
    const url = new URL((env.AUTH_URL as string).trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("not http(s)");
    }
    origin = url.origin;
  } catch {
    throw new Error("AUTH_URL is not an http(s) URL — see .env.example");
  }

  return {
    issuer: (env.AUTH_ISSUER as string).trim(),
    clientId: (env.AUTH_CLIENT_ID as string).trim(),
    clientSecret: (env.AUTH_CLIENT_SECRET as string).trim(),
    origin,
    redirectUri: `${origin}/api/auth/callback`,
    postLogoutRedirectUri: `${origin}/`,
  };
}

let config: AuthClientConfig | null = null;
let client: AuthClient | null = null;

/// The resolved configuration, read once per process.
export function getAuthConfig(): AuthClientConfig {
  config ??= readAuthClientConfig({
    AUTH_ISSUER: process.env.AUTH_ISSUER,
    AUTH_CLIENT_ID: process.env.AUTH_CLIENT_ID,
    AUTH_CLIENT_SECRET: process.env.AUTH_CLIENT_SECRET,
    AUTH_URL: process.env.AUTH_URL,
  });
  return config;
}

/// One client per process, as the package asks, so its JWKS cache is reused
/// across logins instead of refetched on every callback.
export function getAuthClient(): AuthClient {
  if (!client) {
    const { issuer, clientId, clientSecret, redirectUri } = getAuthConfig();
    client = createAuthClient({ issuer, clientId, clientSecret, redirectUri });
  }
  return client;
}

/// This deployment's public origin, as registered with the auth service.
export function appOrigin(): string {
  return getAuthConfig().origin;
}
