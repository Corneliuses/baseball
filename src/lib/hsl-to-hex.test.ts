import { describe, expect, it } from "vitest";

import { hslToHex } from "./hsl-to-hex";

describe("hslToHex", () => {
  it.each([
    // The two colours app/manifest.ts freezes, and the three the email brand
    // leans on hardest — spot values a reader can check against globals.css by
    // eye.
    ["42 70% 94%", "#FAF4E5"],
    ["131 39% 30%", "#2F6A3A"],
    ["224 42% 20%", "#1E2948"],
    ["44 100% 59%", "#FFC72E"],
    ["218 22% 10%", "#14181F"],
  ])("converts %s to %s", (triple, hex) => {
    expect(hslToHex(triple)).toBe(hex);
  });

  it("handles the achromatic and full-saturation edges", () => {
    expect(hslToHex("0 0% 100%")).toBe("#FFFFFF");
    expect(hslToHex("0 0% 0%")).toBe("#000000");
    expect(hslToHex("0 100% 50%")).toBe("#FF0000");
    expect(hslToHex("120 100% 50%")).toBe("#00FF00");
    expect(hslToHex("240 100% 50%")).toBe("#0000FF");
    // Hue 360 is hue 0 — the modulo in the sector lookup, which is the one
    // place an off-by-one would silently return black.
    expect(hslToHex("360 100% 50%")).toBe("#FF0000");
  });

  it("throws rather than guessing at anything that is not a token triple", () => {
    // A silent fallback would make a stale colour look verified, which is the
    // one job this function has.
    expect(() => hslToHex("#FAF4E5")).toThrow(/Not an HSL triple/);
    expect(() => hslToHex("42 70 94")).toThrow(/Not an HSL triple/);
    expect(() => hslToHex("")).toThrow(/Not an HSL triple/);
  });
});
