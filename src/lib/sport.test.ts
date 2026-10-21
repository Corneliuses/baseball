import { describe, expect, it } from "vitest";
import { Sport } from "@/generated/prisma/enums";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SPORTS, SPORT_LABELS, hasLineupChart, sportTheme } from "./sport";

describe("SPORTS and SPORT_LABELS", () => {
  it("list every enum value", () => {
    expect([...SPORTS].sort()).toEqual(Object.values(Sport).sort());
  });

  it("label every enum value", () => {
    for (const sport of Object.values(Sport)) {
      expect(SPORT_LABELS[sport]).toBeTruthy();
    }
    expect(SPORT_LABELS).toEqual({ BASEBALL: "Baseball", BASKETBALL: "Basketball" });
  });
});

describe("hasLineupChart", () => {
  it("is true for baseball", () => {
    expect(hasLineupChart("BASEBALL")).toBe(true);
  });

  it("is false for basketball", () => {
    expect(hasLineupChart("BASKETBALL")).toBe(false);
  });
});

describe("sportTheme", () => {
  it("leaves baseball on the default theme", () => {
    expect(sportTheme("BASEBALL")).toBeUndefined();
  });

  it("names basketball's palette", () => {
    expect(sportTheme("BASKETBALL")).toBe("basketball");
  });

  // An attribute value with no CSS behind it renders the default palette and
  // fails nothing, so every theme sportTheme names must have its light block
  // and its dark override in the stylesheet.
  it("names only themes globals.css defines, in both colour schemes", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const themes = SPORTS.map(sportTheme).filter((theme) => theme !== undefined);
    expect(themes.length).toBeGreaterThan(0);

    for (const theme of themes) {
      const selector = `[data-sport="${theme}"] {`;
      const first = css.indexOf(selector);
      expect(first).toBeGreaterThan(-1);
      const second = css.indexOf(selector, first + 1);
      expect(second).toBeGreaterThan(first);
      expect(css.slice(0, second).lastIndexOf("@media (prefers-color-scheme: dark)")).toBeGreaterThan(first);
    }
  });
});
