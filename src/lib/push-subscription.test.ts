import { describe, expect, it } from "vitest";

import { parsePushSubscription } from "@/lib/push-subscription";

const VALID = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: { p256dh: "BPublicKeyBytes", auth: "AuthSecretBytes" },
};

describe("parsePushSubscription", () => {
  it("flattens the browser's nested keys into storage columns", () => {
    const result = parsePushSubscription(VALID);

    expect(result).toEqual({
      ok: true,
      subscription: {
        endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
        p256dh: "BPublicKeyBytes",
        auth: "AuthSecretBytes",
      },
    });
  });

  it("refuses a non-https endpoint — the server later requests this URL", () => {
    for (const endpoint of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "file:///etc/passwd",
      "not-a-url",
    ]) {
      expect(parsePushSubscription({ ...VALID, endpoint }).ok).toBe(false);
    }
  });

  it("refuses missing or empty keys", () => {
    expect(parsePushSubscription({ endpoint: VALID.endpoint }).ok).toBe(false);
    expect(
      parsePushSubscription({ ...VALID, keys: { p256dh: "", auth: "a" } }).ok,
    ).toBe(false);
    expect(
      parsePushSubscription({ ...VALID, keys: { p256dh: "a", auth: "  " } }).ok,
    ).toBe(false);
  });

  it("bounds an oversized endpoint rather than writing it to a unique index", () => {
    const endpoint = `https://example.com/${"x".repeat(4000)}`;

    expect(parsePushSubscription({ ...VALID, endpoint }).ok).toBe(false);
  });

  it("rejects non-object input without throwing", () => {
    for (const input of [null, undefined, "string", 42, []]) {
      expect(parsePushSubscription(input).ok).toBe(false);
    }
  });

  it("reports one opaque reason — the client cannot fix a field-level message", () => {
    const result = parsePushSubscription({});
    expect(result).toEqual({ ok: false, reason: "invalid-subscription" });
  });
});
