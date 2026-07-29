/// Builds an absolute URL for links that leave the app — invitation emails,
/// added-to-team notices. Nothing in the request context is available when an
/// email is composed, so the base has to come from the environment.
///
/// Precedence: `AUTH_URL` (already required for Auth.js, so it is the base
/// this app already trusts) → Vercel's production URL → Vercel's per-deploy
/// URL → localhost, for local development.

export type AbsoluteUrlEnv = {
  AUTH_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  VERCEL_URL?: string;
};

export function absoluteUrl(path: string, env: AbsoluteUrlEnv): string {
  const base = resolveBase(env);
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${normalizedBase}${normalizedPath}`;
}

function resolveBase(env: AbsoluteUrlEnv): string {
  if (env.AUTH_URL) {
    return env.AUTH_URL;
  }

  const host = env.VERCEL_PROJECT_PRODUCTION_URL ?? env.VERCEL_URL;
  if (host) {
    return withScheme(host);
  }

  return "http://localhost:3000";
}

function withScheme(host: string): string {
  return /^https?:\/\//.test(host) ? host : `https://${host}`;
}
