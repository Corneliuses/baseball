import { describe, it, expect, vi } from "vitest";

// next/font/google runs a real font fetch at module load and is not usable
// under Vitest; the layout only needs the CSS variable names it hands back.
vi.mock("next/font/google", () => {
  const font = (variable: string) => () => ({ variable });
  return {
    Geist: font("--font-geist-sans"),
    Geist_Mono: font("--font-geist-mono"),
    Alfa_Slab_One: font("--font-alfa-slab"),
  };
});

import { metadata } from "./layout";

/**
 * This app stores children's first and last names, their jersey numbers, and
 * the phone numbers and email addresses of their guardians, behind an
 * invite-only door. It must never be indexed.
 *
 * The noindex directive is one four-line object in a file nobody edits often,
 * which is exactly how it gets dropped: by a metadata rewrite that keeps the
 * title and forgets the rest. Adding a web app manifest is the sort of change
 * that invites one, so the guarantee is pinned here rather than trusted to
 * review.
 */
describe("root metadata", () => {
  it("keeps the app out of search indexes", () => {
    expect(metadata.robots).toEqual(
      expect.objectContaining({ index: false, follow: false }),
    );
  });

  it("still names the app", () => {
    expect(metadata.title).toBe("Youth Baseball Team Manager");
  });

  // Declaring `icons` at all suppresses the apple-touch-icon link that
  // `src/app/apple-icon.png` would otherwise emit by file convention — the
  // `icon` entries merge, the apple one does not. Dropping this key therefore
  // costs the iOS home-screen icon and nothing else: no build error, no failing
  // page, just a screenshot of the app where the crest should be, visible only
  // on a real iPhone. Verified against a production build before it was pinned.
  it("declares the apple-touch-icon that the icons block would otherwise suppress", () => {
    // `Metadata["icons"]` also admits a bare URL and an array of icons; this
    // narrows to the descriptor object the layout actually uses, and fails
    // loudly rather than silently passing if that ever changes shape.
    const icons = metadata.icons;
    if (
      !icons ||
      typeof icons !== "object" ||
      Array.isArray(icons) ||
      icons instanceof URL
    ) {
      throw new Error("metadata.icons should be an icons descriptor object");
    }

    expect(icons.apple).toBeDefined();
  });
});
