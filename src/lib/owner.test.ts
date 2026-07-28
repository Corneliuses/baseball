import { describe, it, expect } from "vitest";

import { isOwnerEmail } from "./owner";

describe("isOwnerEmail", () => {
  it("matches an identical address", () => {
    expect(isOwnerEmail("coach@example.com", "coach@example.com")).toBe(true);
  });

  it("ignores case on both sides", () => {
    expect(isOwnerEmail("Coach@Example.COM", "coach@example.com")).toBe(true);
    expect(isOwnerEmail("coach@example.com", "COACH@EXAMPLE.COM")).toBe(true);
  });

  it("ignores surrounding whitespace", () => {
    expect(isOwnerEmail("  coach@example.com  ", "coach@example.com")).toBe(
      true,
    );
    expect(isOwnerEmail("coach@example.com", "\tcoach@example.com\n")).toBe(
      true,
    );
  });

  it("rejects a different address", () => {
    expect(isOwnerEmail("parent@example.com", "coach@example.com")).toBe(false);
  });

  it("does not treat a substring as a match", () => {
    expect(isOwnerEmail("coach@example.com.evil.test", "coach@example.com")).toBe(
      false,
    );
  });

  describe("when OWNER_EMAIL is not configured", () => {
    it("returns false for undefined", () => {
      expect(isOwnerEmail("coach@example.com", undefined)).toBe(false);
    });

    it("returns false for null", () => {
      expect(isOwnerEmail("coach@example.com", null)).toBe(false);
    });

    it("returns false for an empty string", () => {
      expect(isOwnerEmail("coach@example.com", "")).toBe(false);
    });

    it("returns false for whitespace only — so a blank env var grants nothing", () => {
      expect(isOwnerEmail("coach@example.com", "   ")).toBe(false);
    });
  });

  describe("when the candidate address is missing", () => {
    it("returns false for undefined", () => {
      expect(isOwnerEmail(undefined, "coach@example.com")).toBe(false);
    });

    it("returns false for null", () => {
      expect(isOwnerEmail(null, "coach@example.com")).toBe(false);
    });

    it("returns false for an empty string", () => {
      expect(isOwnerEmail("", "coach@example.com")).toBe(false);
    });

    it("returns false when both sides are blank, not true", () => {
      expect(isOwnerEmail("", "")).toBe(false);
      expect(isOwnerEmail("  ", "  ")).toBe(false);
    });
  });
});
