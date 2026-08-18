import { describe, it, expect } from "vitest";

import { RSVP_STYLE } from "./rsvp-style";

/// The three states must stay visually distinct, and the on-field variants
/// must stay legible over grass. Both are things the page-level tests cannot
/// see: they assert labels and class strings, not whether anyone could read
/// the result outdoors.
describe("RSVP_STYLE", () => {
  it("gives every state a text label, never colour alone", () => {
    for (const style of Object.values(RSVP_STYLE)) {
      expect(style.label.trim()).not.toBe("");
    }
  });

  it("styles no-response distinctly from declined", () => {
    // The two mean different things — hasn't answered vs. said no — and drifted
    // together once before.
    expect(RSVP_STYLE["no-response"].tagClassName).not.toBe(
      RSVP_STYLE.declined.tagClassName,
    );
    expect(RSVP_STYLE["no-response"].markerClassName).not.toBe(
      RSVP_STYLE.declined.markerClassName,
    );
  });

  it("dims the declined name on the field by colour, not opacity", () => {
    // `nameClassName` fades declined with `opacity-60`, which works on a card
    // and disappears over grass — the one surface this app is read on in
    // sunlight. The field variant has to dim by colour instead, so reusing the
    // card value here is the regression to catch.
    expect(RSVP_STYLE.declined.markerNameClassName).not.toContain("opacity-");
    expect(RSVP_STYLE.declined.markerNameClassName).not.toBe(
      RSVP_STYLE.declined.nameClassName,
    );
  });

  it("still ranks the declined name below the other two on the field", () => {
    expect(RSVP_STYLE.declined.markerNameClassName).not.toBe(
      RSVP_STYLE.attending.markerNameClassName,
    );
    expect(RSVP_STYLE.attending.markerNameClassName).toBe(
      RSVP_STYLE["no-response"].markerNameClassName,
    );
  });
});
