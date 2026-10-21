import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  COURT_ART,
  COURT_GEOMETRY,
  COURT_SPOT_COORDS,
} from "@/components/court-geometry";
import { DIAMOND_GEOMETRY } from "@/components/diamond-geometry";
import { GUARDED_STYLE } from "@/components/guarded-style";
import { courtHeroViewBox, MiniCourtHero } from "@/components/MiniCourtHero";
import { HERO_CROP } from "@/components/MiniDiamondHero";
import { COURT_POSITIONS } from "@/lib/court-positions";

describe("courtHeroViewBox", () => {
  it("keeps every starting spot's window on the court", () => {
    for (const position of COURT_POSITIONS) {
      const [x, y] = courtHeroViewBox(position).split(" ").map(Number);

      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + HERO_CROP.width).toBeLessThanOrEqual(COURT_GEOMETRY.width);
      expect(y + HERO_CROP.height).toBeLessThanOrEqual(COURT_GEOMETRY.height);
    }
  });

  // The lift moves the window toward the basket; it must never move it so far
  // that the kid's own halo is cut off at the bottom of the frame.
  it("keeps the whole halo in frame at every spot", () => {
    const reach = DIAMOND_GEOMETRY.haloRadius + DIAMOND_GEOMETRY.haloStrokeWidth / 2;
    for (const position of COURT_POSITIONS) {
      const [x, y] = courtHeroViewBox(position).split(" ").map(Number);
      const spot = COURT_SPOT_COORDS[position];

      expect(spot.x - reach).toBeGreaterThanOrEqual(x);
      expect(spot.x + reach).toBeLessThanOrEqual(x + HERO_CROP.width);
      expect(spot.y - reach).toBeGreaterThanOrEqual(y);
      expect(spot.y + reach).toBeLessThanOrEqual(y + HERO_CROP.height);
    }
  });
});

describe("MiniCourtHero", () => {
  it("draws the painted court cropped to the kid's starting spot", () => {
    const html = renderToStaticMarkup(
      <MiniCourtHero position="POINT_GUARD" jerseyNumber={4} />,
    );

    expect(html).toContain(
      `viewBox="${courtHeroViewBox("POINT_GUARD")}"`,
    );
    // The real court, not a new illustration.
    expect(html).toContain("fill-hardwood");
  });

  it("wears the jersey number, or the position label without one", () => {
    const numbered = renderToStaticMarkup(
      <MiniCourtHero position="CENTER" jerseyNumber={23} />,
    );
    const unnumbered = renderToStaticMarkup(
      <MiniCourtHero position="SHOOTING_GUARD" jerseyNumber={null} />,
    );

    expect(numbered).toContain(">23</text>");
    expect(unnumbered).toContain(">SG</text>");
  });

  // The card's banana is the halo and the marquee, so the rim stays white.
  it("rings the kid in banana and keeps the rim in court line", () => {
    const html = renderToStaticMarkup(
      <MiniCourtHero position="CENTER" jerseyNumber={23} />,
    );

    expect(html).toContain(
      `r="${DIAMOND_GEOMETRY.haloRadius}" class="${GUARDED_STYLE.haloClassName}"`,
    );
    expect(html).toContain(`r="${COURT_ART.rimRadius}" class="fill-none stroke-court-line"`);
    expect(html).not.toContain(`r="${COURT_ART.rimRadius}" class="fill-none stroke-banana"`);
  });

  it("animates an inner group, never the one carrying the position", () => {
    const { x, y } = COURT_SPOT_COORDS.CENTER;
    const html = renderToStaticMarkup(
      <MiniCourtHero position="CENTER" jerseyNumber={23} />,
    );

    expect(html).toContain(`transform="translate(${x} ${y})"><g class="animate-step-up">`);
  });

  it("is decoration, hidden from assistive tech", () => {
    const html = renderToStaticMarkup(
      <MiniCourtHero position="CENTER" jerseyNumber={23} />,
    );

    expect(html).toContain('aria-hidden="true"');
  });
});
