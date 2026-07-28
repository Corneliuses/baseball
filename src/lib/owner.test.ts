import { describe, it, expect } from "vitest";
import { isOwnerEmail } from "@/lib/owner";

describe("isOwnerEmail", () => {
  it("returns true for exact email match", () => {
    expect(isOwnerEmail("owner@example.com", "owner@example.com")).toBe(true);
  });

  it("returns true for case-insensitive match", () => {
    expect(isOwnerEmail("Owner@Example.COM", "owner@example.com")).toBe(true);
    expect(isOwnerEmail("owner@example.com", "OWNER@EXAMPLE.COM")).toBe(true);
  });

  it("returns false for non-matching emails", () => {
    expect(isOwnerEmail("user@example.com", "owner@example.com")).toBe(false);
  });

  it("returns false when ownerEmail is undefined", () => {
    expect(isOwnerEmail("owner@example.com", undefined)).toBe(false);
  });

  it("returns false when ownerEmail is empty string", () => {
    expect(isOwnerEmail("owner@example.com", "")).toBe(false);
  });
});
