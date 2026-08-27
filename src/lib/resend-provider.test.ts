import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Only resendProvider()'s wrapping behavior is under test here — not the real
// Resend network call. Mocking the provider factory keeps this test from
// depending on next-auth's internal EmailConfig shape, and mocking sendEmail
// keeps the code email off the network.
const providerSendVerificationRequest = vi.fn();

vi.mock("next-auth/providers/resend", () => ({
  default: (config: { apiKey: string; from: string }) => ({
    id: "resend",
    type: "email",
    name: "Resend",
    sendVerificationRequest: providerSendVerificationRequest,
    options: config,
  }),
}));

const sendEmail = vi.fn();

vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));

import { resendProvider } from "./resend-provider";
import { SIGNIN_CODE_MAX_AGE_SECONDS, normalizeSignInCode } from "./signin-code";

const PARAMS = {
  identifier: "parent@example.com",
  token: "K3M7QP2X",
} as Parameters<ReturnType<typeof resendProvider>["sendVerificationRequest"]>[0];

beforeEach(() => {
  vi.clearAllMocks();
  sendEmail.mockResolvedValue({ ok: true });
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("EMAIL_FROM", "coach@example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resendProvider", () => {
  // The bug this guards: the checks used to run once per page view (inside
  // src/auth.ts's NextAuth config factory, which auth() re-evaluates on every
  // request), so a missing key 500'd every page — including a signed-out
  // visitor who triggers no email. Constructing the provider must not
  // reproduce that.
  it("builds without throwing even when both env vars are unset", () => {
    vi.unstubAllEnvs();

    expect(() => resendProvider()).not.toThrow();
  });

  it("throws when RESEND_API_KEY is unset at send time, without sending", async () => {
    vi.stubEnv("RESEND_API_KEY", "");

    await expect(resendProvider().sendVerificationRequest(PARAMS)).rejects.toThrow(
      "RESEND_API_KEY is not set",
    );
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("throws when EMAIL_FROM is unset at send time, without sending", async () => {
    vi.stubEnv("EMAIL_FROM", "");

    await expect(resendProvider().sendVerificationRequest(PARAMS)).rejects.toThrow(
      "EMAIL_FROM is not set",
    );
    expect(sendEmail).not.toHaveBeenCalled();
  });

  // #60: the email is the code, and only the code. The provider's default
  // send mails a tappable link, which is exactly the thing being removed —
  // a link is redeemed in whichever browser the OS picks, not necessarily
  // the container the person requested it from.
  it("mails the typed code instead of delegating to the link email", async () => {
    await resendProvider().sendVerificationRequest(PARAMS);

    expect(providerSendVerificationRequest).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const input = sendEmail.mock.calls[0][0] as {
      to: string;
      subject: string;
    };
    expect(input.to).toBe("parent@example.com");
    expect(input.subject).toContain("K3M7-QP2X");
  });

  it("throws when the code email fails to send", async () => {
    sendEmail.mockResolvedValue({ ok: false, reason: "rate limited" });

    await expect(resendProvider().sendVerificationRequest(PARAMS)).rejects.toThrow(
      /failed to send/i,
    );
  });

  it("generates verification tokens the entry form's normalizer accepts", () => {
    const provider = resendProvider();
    const token = provider.generateVerificationToken();

    // The raw token is canonical: normalizing it is the identity, which is
    // what lets `submitSignInCode` rebuild it from whatever the person types.
    expect(normalizeSignInCode(token)).toBe(token);
  });

  it("expires codes on the shared ten-minute maxAge", () => {
    expect(resendProvider().maxAge).toBe(SIGNIN_CODE_MAX_AGE_SECONDS);
  });
});
