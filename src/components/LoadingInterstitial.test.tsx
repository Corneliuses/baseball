import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { LOADING_LABEL, LoadingInterstitial } from "./LoadingInterstitial";

describe("LoadingInterstitial", () => {
  it("spins the same ball the submit buttons use", () => {
    const html = renderToStaticMarkup(<LoadingInterstitial />);

    expect(html).toContain("animate-spin-ball");
    expect(html).toContain('aria-hidden="true"');
    // The seams are stitched in seam red so a 56px ball reads as a baseball
    // and not as a ring; inside a button the spinner keeps one colour.
    expect(html).toContain("stroke-destructive");
  });

  it("says it is loading in words, not only in motion", () => {
    // globals.css holds the ball still under prefers-reduced-motion, so the
    // text is the entire signal for that reader.
    const html = renderToStaticMarkup(<LoadingInterstitial />);

    expect(html).toContain('role="status"');
    expect(html).toContain(LOADING_LABEL);
  });

  it("spends no banana", () => {
    // design-plan.md §2: one Banana Yellow element per screen. The page that
    // replaces this fallback brings its own, so the interstitial carries none.
    const html = renderToStaticMarkup(<LoadingInterstitial />);

    expect(html).not.toMatch(/banana|floodlight/);
  });

  it("is legible from the raw markup", () => {
    // Same rule as Reveal and animate-rise: nothing here may depend on a
    // bundle arriving to become visible.
    const html = renderToStaticMarkup(<LoadingInterstitial />);

    expect(html).not.toContain("opacity:0");
    expect(html).not.toContain("display:none");
  });

  it("takes a caller's className", () => {
    const html = renderToStaticMarkup(<LoadingInterstitial className="pt-2" />);

    expect(html).toContain("pt-2");
  });
});
