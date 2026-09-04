import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { hslToHex } from "@/lib/hsl-to-hex";

import manifest from "./manifest";

/**
 * The manifest is the one file in the app whose mistakes are invisible in
 * development and permanent on a phone: a wrong `start_url` or a missing icon
 * doesn't throw, it just produces an installed app that opens on the wrong page
 * or wears a blank square. Nothing else renders it, so nothing else would fail.
 *
 * Two things are checked here that a reader cannot check by eye:
 *
 * 1. **Every icon `src` actually resolves to a file.** The icons are committed
 *    PNGs, so a rename or a lost `git add` would leave the manifest pointing at
 *    a 404 that only shows up at install time on a real device.
 * 2. **The colours still match the design tokens they were derived from.** A
 *    manifest cannot express a media query, so the two colours are frozen hex
 *    copied from the *light* theme in `globals.css`. That is exactly the shape
 *    of duplication that rots — see `design-plan-drift.test.ts` for the same
 *    problem one directory up — so the conversion is redone here and compared
 *    rather than trusted. The conversion itself is `@/lib/hsl-to-hex`, shared
 *    with `src/emails/brand.test.ts`, which freezes the same light theme for
 *    the same reason: two hand-rolled converters that disagree would fail
 *    exactly one of these suites and give a reader no way to tell which one
 *    was lying.
 */

const repoRoot = process.cwd();
const globalsCss = readFileSync(join(repoRoot, "src/app/globals.css"), "utf8");

/// The light-theme value of one token, as written in the `:root` block. Reads
/// the first match deliberately: `:root` comes before the dark override in the
/// file, so this is the light value even though the token name repeats.
function lightToken(name: string): string {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(globalsCss);
  if (!match) {
    throw new Error(
      `--${name} is not in globals.css — this parser, not the stylesheet, ` +
        "is probably what needs updating.",
    );
  }
  return match[1].trim();
}

describe("web app manifest", () => {
  const result = manifest();

  it("names the app for both a listing and a home-screen label", () => {
    expect(result.name).toBe("Youth Baseball Team Manager");
    // iOS truncates around a dozen characters; a longer short_name defeats the
    // point of having one.
    expect(result.short_name).toBeDefined();
    expect(result.short_name!.length).toBeLessThanOrEqual(12);
  });

  it("opens standalone at the root, scoped to the whole app", () => {
    expect(result.start_url).toBe("/");
    expect(result.scope).toBe("/");
    expect(result.display).toBe("standalone");
  });

  // Without a stable id the installed app is keyed by start_url, so changing
  // the landing page later would install a second copy beside the first.
  it("pins a stable app id", () => {
    expect(result.id).toBe("/");
  });

  it("uses the light-theme background and primary tokens as its colours", () => {
    expect(result.background_color).toBe(hslToHex(lightToken("background")));
    expect(result.theme_color).toBe(hslToHex(lightToken("primary")));
  });

  it("carries the icon sizes iOS and Android home screens ask for", () => {
    const sizes = (result.icons ?? []).map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  // Android crops icons to the launcher's own shape. Without a maskable entry
  // it crops the `any` icon instead, cutting the crest off at the circle.
  it("offers a maskable icon so Android does not crop the crest", () => {
    const maskable = (result.icons ?? []).filter(
      (icon) => icon.purpose === "maskable",
    );
    expect(maskable).toHaveLength(1);
    expect(maskable[0].sizes).toBe("512x512");
  });

  it.each((manifest().icons ?? []).map((icon) => icon.src))(
    "%s exists in public/",
    (src) => {
      // `join`, never `resolve`. Every `src` here is rooted ("/icon-192.png"),
      // and `resolve` discards everything before an absolute segment — it would
      // check the filesystem root, find nothing, and turn this into a check that
      // fails for a reason having nothing to do with the icons. `join` treats
      // the leading slash as an ordinary separator, which is what is wanted.
      expect(existsSync(join(repoRoot, "public", src as string))).toBe(true);
    },
  );

  // Next emits the apple-touch-icon link from this file convention, and iOS
  // reads nothing from the manifest's icon list. It is the only icon a
  // manifest-only check would miss entirely.
  it("ships the apple-icon that iOS uses instead of the manifest icons", () => {
    expect(existsSync(join(repoRoot, "src/app/apple-icon.png"))).toBe(true);
  });
});
