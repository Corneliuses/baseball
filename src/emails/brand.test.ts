import { describe, expect, it } from "vitest";

import { RSVP_STYLE } from "@/components/rsvp-style";
import { lightThemeHex } from "@/lib/light-theme";

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
 * does for the two colours a web app manifest freezes. Both go through
 * `@/lib/light-theme`, which owns the one parser of the stylesheet.
 *
 * The contrast block is the other half. design-plan.md §10 asks for AA on the
 * page, and an email is the one surface read in a car park with the brightness
 * turned down — but it is also the surface where a well-meaning "make the
 * button pop" edit lands white text on Banana Yellow, which is the one pairing
 * the plan forbids outright.
 */

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
/// The `Record<keyof typeof EMAIL_COLOR, …>` type is what keeps this complete:
/// a colour added to the palette without a row here is a type error.
const COPIED_FROM: Record<keyof typeof EMAIL_COLOR, string> = {
  page: "background",
  card: "card",
  ink: "foreground",
  quietInk: "muted-foreground",
  border: "border",
  stub: "secondary",
  green: "primary",
  banana: "banana",
  stitch: "destructive",
  scoreboard: "scoreboard",
  onScoreboard: "scoreboard-foreground",
  floodlight: "scoreboard-accent",
};

describe("the email palette", () => {
  it.each(Object.entries(COPIED_FROM))(
    "EMAIL_COLOR.%s is the light --%s from globals.css",
    (name, token) => {
      expect(EMAIL_COLOR[name as keyof typeof EMAIL_COLOR]).toBe(
        lightThemeHex(token),
      );
    },
  );

  it.each(Object.keys(EMAIL_RSVP_COLOR) as (keyof typeof EMAIL_RSVP_COLOR)[])(
    "colours %s the way the app's RSVP_STYLE does",
    (state) => {
      // `rsvp-style.ts` carries the on-screen vocabulary as Tailwind classes
      // (`text-primary`, `text-destructive`, `text-muted-foreground`); the
      // token name is the part after `text-`. Its docstring exists because two
      // pages once drifted apart on exactly this, so the inbox does not get to
      // be a third opinion.
      const token = RSVP_STYLE[state].tagClassName.replace(/^text-/, "");
      expect(EMAIL_RSVP_COLOR[state]).toBe(lightThemeHex(token));
    },
  );
});

describe("email contrast", () => {
  it.each([
    ["ink on the page", EMAIL_COLOR.ink, EMAIL_COLOR.page],
    ["ink on card stock", EMAIL_COLOR.ink, EMAIL_COLOR.card],
    // The button: banana lettering on a navy ground.
    ["banana on ink", EMAIL_COLOR.banana, EMAIL_COLOR.ink],
    ["green links on card stock", EMAIL_COLOR.green, EMAIL_COLOR.card],
    ["seam red on card stock", EMAIL_COLOR.stitch, EMAIL_COLOR.card],
    ["the footer on the page", EMAIL_COLOR.quietInk, EMAIL_COLOR.page],
    ["chalk on the scoreboard", EMAIL_COLOR.onScoreboard, EMAIL_COLOR.scoreboard],
    ["the sign-in code on the scoreboard", EMAIL_COLOR.floodlight, EMAIL_COLOR.scoreboard],
  ])("clears AA for %s", (_label, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps white off the banana", () => {
    // design-plan.md §3 ends on "Banana Yellow never carries white text,
    // ever." Stated as its own failure because this is the edit the plan
    // expects someone to try; `templates.test.tsx` checks the rendered side.
    expect(contrast("#FFFFFF", EMAIL_COLOR.banana)).toBeLessThan(4.5);
  });

  it.each(Object.entries(EMAIL_RSVP_COLOR))(
    "reads %s on card stock",
    (_state, color) => {
      expect(contrast(color, EMAIL_COLOR.card)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
