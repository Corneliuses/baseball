import Resend from "next-auth/providers/resend";

/// Wraps Auth.js's Resend provider so RESEND_API_KEY/EMAIL_FROM are demanded
/// only when a magic-link email is actually about to be sent, not on every
/// page view. Building the provider object is inert — Resend() just
/// assembles config, it makes no network call — so passing possibly-empty
/// strings is safe; sendVerificationRequest is the one place those values
/// are read to make a request, which is why the checks live in this
/// wrapper's send path.
///
/// Lives outside src/auth.ts, which is otherwise deliberately thin: this
/// file avoids the top-level `next-auth` package import (only the
/// `next-auth/providers/resend` submodule), because next-auth's main entry
/// pulls in `next/server`, which fails to resolve outside Next's own
/// bundler — see the module resolution error importing `./auth` directly
/// used to hit under Vitest. That constraint is what makes this function
/// testable at all.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set — see .env.example`);
  }
  return value;
}

export function resendProvider() {
  const provider = Resend({
    apiKey: process.env.RESEND_API_KEY ?? "",
    // Must be explicit. The provider's default `from` is an authjs.dev address
    // that this project does not control, and mail from an unverified domain
    // is the difference between parents seeing invitations and never finding
    // them.
    from: process.env.EMAIL_FROM ?? "",
  });

  return {
    ...provider,
    async sendVerificationRequest(
      params: Parameters<typeof provider.sendVerificationRequest>[0],
    ) {
      requireEnv("RESEND_API_KEY");
      requireEnv("EMAIL_FROM");
      return provider.sendVerificationRequest(params);
    },
  };
}
