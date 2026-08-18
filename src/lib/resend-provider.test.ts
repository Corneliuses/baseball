import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Only resendProvider()'s wrapping behavior is under test here — not the real
// Resend network call. Mocking the provider factory lets us observe whether
// sendVerificationRequest was reached without hitting the network, and keeps
// this test from depending on next-auth's internal EmailConfig shape.
const sendVerificationRequest = vi.fn();

vi.mock("next-auth/providers/resend", () => ({
  default: (config: { apiKey: string; from: string }) => ({
    id: "resend",
    type: "email",
    name: "Resend",
    sendVerificationRequest,
    options: config,
  }),
}));

import { resendProvider } from "./resend-provider";

const PARAMS = {} as Parameters<
  ReturnType<typeof resendProvider>["sendVerificationRequest"]
>[0];

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(sendVerificationRequest).not.toHaveBeenCalled();
  });

  it("throws when EMAIL_FROM is unset at send time, without sending", async () => {
    vi.stubEnv("EMAIL_FROM", "");

    await expect(resendProvider().sendVerificationRequest(PARAMS)).rejects.toThrow(
      "EMAIL_FROM is not set",
    );
    expect(sendVerificationRequest).not.toHaveBeenCalled();
  });

  it("delegates to the real provider once both env vars are present", async () => {
    await resendProvider().sendVerificationRequest(PARAMS);

    expect(sendVerificationRequest).toHaveBeenCalledWith(PARAMS);
  });
});
