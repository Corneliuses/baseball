import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  DIAMOND_GEOMETRY,
  FIELD_ART,
  POSITION_COORDS,
} from "@/components/diamond-geometry";
import { GUARDED_STYLE } from "@/components/guarded-style";
import { HERO_CROP, heroViewBox, MiniDiamondHero } from "@/components/MiniDiamondHero";

describe("heroViewBox", () => {
  it("frames the window on the given spot", () => {
    // SECOND_BASE (232,252) sits far enough from every edge that no clamp
    // fires: the window is simply centred.
    const { x, y } = POSITION_COORDS.SECOND_BASE;

    expect(heroViewBox({ x, y })).toBe(
      `${x - HERO_CROP.width / 2} ${y - HERO_CROP.height / 2} ${HERO_CROP.width} ${HERO_CROP.height}`,
    );
  });

  it("clamps at the board's edges instead of panning into blank space", () => {
    // RIGHT_FIELD's centred window would run past x=400; LEFT_FIELD's past
    // x=0. Both stop at the edge, leaving the marker off-centre in frame.
    expect(heroViewBox(POSITION_COORDS.RIGHT_FIELD)).toBe(
      `${DIAMOND_GEOMETRY.width - HERO_CROP.width} 75 ${HERO_CROP.width} ${HERO_CROP.height}`,
    );
    expect(heroViewBox(POSITION_COORDS.LEFT_FIELD)).toBe(
      `0 75 ${HERO_CROP.width} ${HERO_CROP.height}`,
    );
  });

  it("keeps the catcher's window on the board", () => {
    // The deepest spot: y=452 centres to 397, still inside 520 - 110 = 410.
    // If either the crop height or the catcher's coordinate moves, this is
    // the case that silently pans past the bottom edge first.
    const box = heroViewBox(POSITION_COORDS.CATCHER);
    const [, y] = box.split(" ").map(Number);

    expect(y + HERO_CROP.height).toBeLessThanOrEqual(DIAMOND_GEOMETRY.height);
  });
});

describe("MiniDiamondHero", () => {
  it("draws the painted field cropped to the kid's position", () => {
    const html = renderToStaticMarkup(
      <MiniDiamondHero position="SECOND_BASE" jerseyNumber={12} />,
    );

    expect(html).toContain(`viewBox="${heroViewBox(POSITION_COORDS.SECOND_BASE)}"`);
    // The real field, not a new illustration.
    expect(html).toContain("fill-grass");
  });

  it("frames the allPlay outfield kid at the zone's centre", () => {
    const html = renderToStaticMarkup(
      <MiniDiamondHero position={null} jerseyNumber={12} />,
    );

    // outfieldZoneCoords(1) is CENTER_FIELD's spot by construction.
    expect(html).toContain(`viewBox="${heroViewBox(POSITION_COORDS.CENTER_FIELD)}"`);
  });

  it("wears the jersey number in the JerseyDot colours", () => {
    const html = renderToStaticMarkup(
      <MiniDiamondHero position="SECOND_BASE" jerseyNumber={12} />,
    );

    expect(html).toContain(">12</text>");
    expect(html).toContain("fill-foreground");
    expect(html).toContain("fill-background");
  });

  it("falls back to the position label when no number is on file", () => {
    const withPosition = renderToStaticMarkup(
      <MiniDiamondHero position="SHORTSTOP" jerseyNumber={null} />,
    );
    const inZone = renderToStaticMarkup(
      <MiniDiamondHero position={null} jerseyNumber={null} />,
    );

    expect(withPosition).toContain(">SS</text>");
    expect(inZone).toContain(">OF</text>");
  });

  // The halo and the fence share the class `fill-none stroke-banana` when the
  // fence is yellow, so — as FieldArt's own suite records — telling them apart
  // has to key on the radius. Here the fence must be chalk: the hero renders
  // only for a kid the chart seats, whose card already spends the banana.
  it("rings the kid in banana and keeps the fence chalk", () => {
    const html = renderToStaticMarkup(
      <MiniDiamondHero position="SECOND_BASE" jerseyNumber={12} />,
    );

    expect(html).toContain(
      `r="${DIAMOND_GEOMETRY.haloRadius}" class="${GUARDED_STYLE.haloClassName}"`,
    );
    expect(html).toContain(`r="${FIELD_ART.fenceRadius}" class="fill-none stroke-chalk"`);
    expect(html).not.toContain(`r="${FIELD_ART.fenceRadius}" class="fill-none stroke-banana"`);
  });

  // The documented SVG trap: a CSS transform overrides an SVG transform
  // attribute, so animating the positioning <g> renders the marker at the
  // field's origin — silently.
  it("animates an inner group, never the one carrying the position", () => {
    const { x, y } = POSITION_COORDS.SECOND_BASE;
    const html = renderToStaticMarkup(
      <MiniDiamondHero position="SECOND_BASE" jerseyNumber={12} />,
    );

    expect(html).toContain(`transform="translate(${x} ${y})"><g class="animate-step-up">`);
  });

  it("is decoration: hidden from assistive tech like FieldArt itself", () => {
    const html = renderToStaticMarkup(
      <MiniDiamondHero position="SECOND_BASE" jerseyNumber={12} />,
    );

    expect(html).toContain('aria-hidden="true"');
  });
});
