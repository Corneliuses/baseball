import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import * as icons from "./icons";

/// The set's shared contract, checked across every glyph rather than on
/// whichever one a future test happens to name.
///
/// The important half is accessibility. These are decoration: an icon in this
/// app always sits beside its own text label (design-plan.md §10 — state, and
/// wayfinding, is never carried by colour or shape alone), so a glyph that
/// announced itself would read the nav twice. `aria-hidden` plus
/// `focusable="false"` is the same contract FieldArt and StitchDivider keep,
/// and the `focusable` half is not redundant: IE-era SVG defaults still put
/// focusable SVGs in the tab order in some engines, which would tab a coach
/// through twelve nothings on the way across the nav.
const ALL_ICONS = Object.entries(icons).filter(
  ([name]) => name.endsWith("Icon"),
) as [string, (props: { className?: string }) => React.ReactElement][];

describe("the dugout icon set", () => {
  it("exports the glyphs the nav and the buttons ask for", () => {
    // Without a floor here, a rename that emptied the list would turn every
    // it.each below into a vacuous pass — the way a drift guard stops guarding.
    expect(ALL_ICONS.length).toBeGreaterThanOrEqual(12);
  });

  it.each(ALL_ICONS)("%s is hidden from assistive tech", (_name, Icon) => {
    const html = renderToStaticMarkup(<Icon />);

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('focusable="false"');
  });

  it.each(ALL_ICONS)("%s shares the set's 24-unit grid", (_name, Icon) => {
    const html = renderToStaticMarkup(<Icon />);

    expect(html).toContain('viewBox="0 0 24 24"');
  });

  it.each(ALL_ICONS)("%s inherits its colour from the text", (_name, Icon) => {
    // Stroked in currentColor so one glyph works on card stock, on a Field
    // Green active pill, and in both themes. A hard-coded fill would need a
    // second copy per surface and would break dark mode silently.
    const html = renderToStaticMarkup(<Icon />);

    expect(html).toContain('stroke="currentColor"');
    expect(html).not.toMatch(/fill="(?!none)[^"]+"/);
  });

  it.each(ALL_ICONS)("%s passes its className through", (_name, Icon) => {
    const html = renderToStaticMarkup(<Icon className="size-5 text-primary" />);

    expect(html).toContain("size-5 text-primary");
  });
});

describe("CheckIcon", () => {
  it("draws its tick as a single path so animate-tick can sweep it", () => {
    // StatusBanner animates stroke-dashoffset along this polyline. Split the
    // tick into two <path>s and the animation draws both halves at once —
    // visually wrong, and silent, since nothing else would fail.
    const html = renderToStaticMarkup(<icons.CheckIcon />);

    expect(html.match(/<path/g)).toHaveLength(1);
  });
});
