import { describe, expect, it } from "vitest";

import { generateCalendarToken } from "./calendar-token";

describe("generateCalendarToken", () => {
  it("is URL-safe", () => {
    const token = generateCalendarToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("encodes 32 bytes — 43 base64url characters, the invitation token's strength", () => {
    expect(generateCalendarToken()).toHaveLength(43);
  });

  it("differs across calls", () => {
    const a = generateCalendarToken();
    const b = generateCalendarToken();
    expect(a).not.toBe(b);
  });
});
