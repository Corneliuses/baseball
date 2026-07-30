import { describe, expect, it } from "vitest";

import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("returns null for a blank string", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
  });

  it("returns null for non-string input", () => {
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(normalizePhone("  555-123-4567  ")).toBe("555-123-4567");
  });

  it("collapses internal runs of whitespace to a single space", () => {
    expect(normalizePhone("555   123  4567")).toBe("555 123 4567");
  });

  it("preserves punctuation and international formats", () => {
    expect(normalizePhone("+1 (555) 123-4567")).toBe("+1 (555) 123-4567");
  });

  it("rejects a value longer than 32 characters", () => {
    expect(() => normalizePhone("1".repeat(33))).toThrow(RangeError);
  });

  it("accepts a value exactly 32 characters long", () => {
    expect(normalizePhone("1".repeat(32))).toBe("1".repeat(32));
  });
});
