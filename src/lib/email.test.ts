import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Only the wrapper's behavior is under test — never a real network call.
// Mocking the Resend constructor lets us observe exactly what payload would
// have been sent.
const send = vi.fn();

vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

import { sendEmail } from "./email";

const INPUT = {
  to: "parent@example.com",
  subject: "Game moved",
  react: createElement("p", null, "See you Saturday"),
};

beforeEach(() => {
  vi.clearAllMocks();
  send.mockResolvedValue({ error: null });
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("EMAIL_FROM", "team@example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sendEmail", () => {
  it("fails without sending when env vars are unset", async () => {
    vi.stubEnv("RESEND_API_KEY", "");

    const result = await sendEmail(INPUT);

    expect(result.ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("passes replyTo through to Resend when provided", async () => {
    await sendEmail({ ...INPUT, replyTo: "coach@example.com" });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: "coach@example.com" }),
    );
  });

  it("omits the replyTo key entirely when not provided", async () => {
    await sendEmail(INPUT);

    expect(send).toHaveBeenCalledTimes(1);
    // Omitted, not undefined: Resend's SDK validates the shape it receives,
    // and an explicit `replyTo: undefined` is a different payload than none.
    expect(send.mock.calls[0][0]).not.toHaveProperty("replyTo");
  });

  it("reports a Resend error as a failed send", async () => {
    send.mockResolvedValue({ error: { message: "rate limited" } });

    const result = await sendEmail(INPUT);

    expect(result).toEqual({ ok: false, reason: "rate limited" });
  });
});
