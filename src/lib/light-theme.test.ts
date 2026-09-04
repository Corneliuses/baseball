import { describe, expect, it } from "vitest";

import { lightThemeHex } from "./light-theme";

describe("lightThemeHex", () => {
  it("reads the light value of a token that the dark theme also overrides", () => {
    // `--background` is 42 70% 94% in :root and 218 22% 10% in the dark
    // block; the whole point of scoping to :root is that this stays cream.
    expect(lightThemeHex("background")).toBe("#FAF4E5");
  });

  it("throws on a token that does not exist rather than returning a guess", () => {
    expect(() => lightThemeHex("no-such-token")).toThrow(/not in globals.css/);
  });
});
