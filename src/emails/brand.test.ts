import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { hslToHex } from "@/lib/hsl-to-hex";

import { EMAIL_COLOR, EMAIL_RSVP_COLOR } from "./brand";

/**
 * `EMAIL_COLOR` is a copy of the light theme, and a copy is a thing that rots.
 * A mail client gives an email no cascade, no `hsl(var(--x))`, and no reliable
 * `prefers-color-scheme`, so the palette has to be frozen hex — but nothing at
 * runtime would ever notice it drifting from `globals.css`, because a stale
 * colour is not an error. It is just an email that looks like a different app
 * than the one the link opens.
 *
 * So this redoes the conversion and compares, exactly as `app/manifest.test.ts`
 * does for the two colours a web app manifest freezes. Both use
 * `@/lib/hsl-to-hex` rather than each rolling their own.
 *
 * The contrast block is the other half. design-plan.md §10 asks for AA on the
 * page, and an email is the one surface read in a car park with the brightness
 * turned down — but it is also the surface where a well-meaning "make the
 * button pop" edit lands white text on Banana Yellow, which is the one pairing
 * the plan forbids outright.
 */

const repoRoot = process.cwd();
const globalsCss = readFileSync(join(repoRoot, "src/app/globals.css"), "utf8");

/// The light-theme value of one token. Reads the first match deliberately:
/// `:root` precedes the dark override in the file, so this is the light value
/// even though every token name appears twice.
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

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [
    relativeLuminance(foreground),
    relativeLuminance(background),
  ].sort((a, b) => b - a);

  return (lighter + 0.05) / (darker + 0.05);
}

/// Every entry in `EMAIL_COLOR`, paired with the token it was copied from.
/// Written out rather than derived, because the mapping is the claim: the
/// names differ on purpose (`stub` is `--secondary` used for one thing) and a
/// clever derivation would only be able to check the names that already match.
const COPIED_FROM: Record<keyof typeof EMAIL_COLOR, string> = {
  page: "background",
  card: "card",
  ink: "foreground",
  quietInk: "muted-foreground",
  border: "border",
  muted: "muted",
  stub: "secondary",
  green: "primary",
  onGreen: "primary-foreground",
  banana: "banana",
  stitch: "destructive",
  scoreboard: "scoreboard",
  onScoreboard: "scoreboard-foreground",
  floodlight: "scoreboard-accent",
};

describe("the email palette", () => {
  it("covers every colour the emails are allowed to use", () => {
    // A guard against the check below going vacuous: a new colour added to
    // EMAIL_COLOR without a row in COPIED_FROM would otherwise be untested,
    // which is precisely how an unverified hex gets in.
    expect(Object.keys(COPIED_FROM).sort()).toEqual(
      Object.keys(EMAIL_COLOR).sort(),
    );
  });

  it.each(Object.entries(COPIED_FROM))(
    "EMAIL_COLOR.%s is the light --%s from globals.css",
    (name, token) => {
      expect(EMAIL_COLOR[name as keyof typeof EMAIL_COLOR]).toBe(
        hslToHex(lightToken(token)),
      );
    },
  );
});

describe("email contrast", () => {
  it.each([
    ["ink on the page", EMAIL_COLOR.ink, EMAIL_COLOR.page],
    ["ink on card stock", EMAIL_COLOR.ink, EMAIL_COLOR.card],
    // The pairing design-plan.md §3 ends on: "Banana Yellow never carries
    // white text, ever." Navy on banana is the button, and this is the number
    // that makes it allowed.
    ["ink on the banana button", EMAIL_COLOR.ink, EMAIL_COLOR.banana],
    ["cream on field green", EMAIL_COLOR.onGreen, EMAIL_COLOR.green],
    ["green links on card stock", EMAIL_COLOR.green, EMAIL_COLOR.card],
    ["seam red on card stock", EMAIL_COLOR.stitch, EMAIL_COLOR.card],
    ["the footer on the page", EMAIL_COLOR.quietInk, EMAIL_COLOR.page],
    ["chalk on the scoreboard", EMAIL_COLOR.onScoreboard, EMAIL_COLOR.scoreboard],
    ["the sign-in code on the scoreboard", EMAIL_COLOR.floodlight, EMAIL_COLOR.scoreboard],
    ["the header wordmark", EMAIL_COLOR.onScoreboard, EMAIL_COLOR.scoreboard],
  ])("clears AA for %s", (_label, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps white off the banana", () => {
    // Stated as its own failure rather than left implicit in the row above:
    // this is the edit the plan expects someone to try.
    expect(contrast("#FFFFFF", EMAIL_COLOR.banana)).toBeLessThan(4.5);
  });

  it.each(Object.entries(EMAIL_RSVP_COLOR))(
    "reads %s on card stock",
    (_state, color) => {
      expect(contrast(color, EMAIL_COLOR.card)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
