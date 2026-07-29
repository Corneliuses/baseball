import { describe, expect, it } from "vitest";

import { normalizeEmail } from "./email-address";

describe("normalizeEmail", () => {
  it("lowercases the address", () => {
    expect(normalizeEmail("Sam@Example.com")).toBe("sam@example.com");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeEmail("  sam@example.com  ")).toBe("sam@example.com");
  });

  it("leaves an already-normalized address unchanged", () => {
    expect(normalizeEmail("sam@example.com")).toBe("sam@example.com");
  });

  it("returns an empty string for blank input", () => {
    expect(normalizeEmail("   ")).toBe("");
  });

  it("trims and lowercases together", () => {
    expect(normalizeEmail("  Sam@Example.com  ")).toBe("sam@example.com");
  });
});
