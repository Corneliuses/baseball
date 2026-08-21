import { describe, it, expect } from "vitest";

import { GUARDED_STYLE, YOUR_PLAYER_SR_SUFFIX, YOUR_PLAYER_TEXT } from "./guarded-style";
import { RSVP_STYLE } from "./rsvp-style";

/// What the page-level tests cannot see: these assert the *shape* of the
/// vocabulary — that it carries text, that it spends the banana, and that it
/// does not quietly take over jobs RSVP_STYLE already owns.
describe("GUARDED_STYLE", () => {
  it("carries the emphasis as text, never as colour alone", () => {
    // design-plan.md §10. The halo is the fast path; these are the only path
    // for a colour-blind parent or a screen reader.
    expect(YOUR_PLAYER_TEXT.trim()).not.toBe("");
    expect(YOUR_PLAYER_SR_SUFFIX.trim()).not.toBe("");
  });

  it("spends the banana on the halo and the badge", () => {
    // The whole point of Decision 1 (#49): /view's one banana moved off
    // FieldArt's fence and onto the reader's own child. If these stop being
    // banana the page has quietly given the budget back to nothing.
    expect(GUARDED_STYLE.haloClassName).toContain("stroke-banana");
    expect(GUARDED_STYLE.badgeClassName).toContain("bg-banana");
  });

  it("leaves the halo unfilled", () => {
    // A filled halo reads as a second, larger circle behind an opaque marker
    // rather than as a ring around it.
    expect(GUARDED_STYLE.haloClassName).toContain("fill-none");
  });

  it("does not recolour the name RSVP_STYLE owns", () => {
    // Guarded is orthogonal to going/not going: a parent whose kid is marked
    // Not going still has to see that. Emphasis here is weight only, so the
    // two vocabularies compose instead of one erasing the other.
    expect(GUARDED_STYLE.markerNameClassName).not.toMatch(/(^|\s)(text|fill)-/);
    for (const style of Object.values(RSVP_STYLE)) {
      expect(GUARDED_STYLE.markerNameClassName).not.toBe(style.markerNameClassName);
    }
  });

  it("gives the badge a foreground that is not the banana it sits on", () => {
    expect(GUARDED_STYLE.badgeClassName).toContain("text-banana-foreground");
  });
});
