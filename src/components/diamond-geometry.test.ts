import { describe, it, expect } from "vitest";

import {
  DIAMOND_GEOMETRY,
  POSITION_COORDS,
  diamondHeight,
  outfieldZoneCoords,
  positionPercent,
} from "./diamond-geometry";

/// The back point of the infield polygon. Nothing in the outfield zone may
/// reach it, or an outfielder's circle sits on top of the middle infielders.
const INFIELD_BACK = 230;

describe("diamondHeight", () => {
  it("keeps the full box when a catcher is drawn", () => {
    // The catcher's RSVP tag lands at 452 + 47 = 499, and clipping it would be
    // silent — an off-canvas name renders without error.
    expect(diamondHeight(true)).toBe(DIAMOND_GEOMETRY.height);
    expect(POSITION_COORDS.CATCHER.y + DIAMOND_GEOMETRY.tagOffset).toBeLessThan(
      diamondHeight(true),
    );
  });

  it("drops the catcher's band when there is none", () => {
    const height = diamondHeight(false);
    expect(height).toBeLessThan(DIAMOND_GEOMETRY.height);
    // Still room for the pitcher's tag and the whole plate at y=420.
    expect(POSITION_COORDS.PITCHER.y + DIAMOND_GEOMETRY.tagOffset).toBeLessThan(
      height,
    );
    expect(height).toBeGreaterThan(420);
  });
});

describe("positionPercent", () => {
  it("scales against the box it will actually be placed in", () => {
    const tall = positionPercent("PITCHER", true);
    const short = positionPercent("PITCHER", false);

    expect(tall.x).toBe(short.x);
    // Same marker, shorter box — so it sits proportionally lower.
    expect(short.y).toBeGreaterThan(tall.y);
    expect(tall.y).toBeCloseTo(
      (POSITION_COORDS.PITCHER.y / DIAMOND_GEOMETRY.height) * 100,
    );
  });
});

describe("outfieldZoneCoords", () => {
  it("places nobody when the infield takes everyone", () => {
    expect(outfieldZoneCoords(0)).toEqual([]);
    expect(outfieldZoneCoords(-1)).toEqual([]);
  });

  it("returns one coordinate per player", () => {
    for (let count = 1; count <= 12; count += 1) {
      expect(outfieldZoneCoords(count)).toHaveLength(count);
    }
  });

  it("puts a lone outfielder in centre field", () => {
    expect(outfieldZoneCoords(1)).toEqual([
      { x: 200, y: POSITION_COORDS.CENTER_FIELD.y },
    ]);
  });

  it("lands three outfielders exactly on LF, CF and RF", () => {
    // A team that happens to field three should read as the standard diamond
    // rather than as some other chart.
    expect(outfieldZoneCoords(3)).toEqual([
      POSITION_COORDS.LEFT_FIELD,
      POSITION_COORDS.CENTER_FIELD,
      POSITION_COORDS.RIGHT_FIELD,
    ]);
  });

  it("bows each row: the ends play shallower than the middle", () => {
    const row = outfieldZoneCoords(5);

    expect(row[0].y).toBeGreaterThan(row[1].y);
    expect(row[1].y).toBeGreaterThan(row[2].y);
    expect(row[2].y).toBeLessThan(row[3].y);
    expect(row[3].y).toBeLessThan(row[4].y);
  });

  it("is symmetric about the centre line", () => {
    const row = outfieldZoneCoords(4);
    const centre = DIAMOND_GEOMETRY.width / 2;

    expect(row[0].x - centre).toBeCloseTo(centre - row[3].x);
    expect(row[0].y).toBeCloseTo(row[3].y);
  });

  it("adds a second row rather than crowding one", () => {
    const depths = new Set(outfieldZoneCoords(8).map((coord) => coord.y));
    expect(depths.size).toBeGreaterThan(3);
    expect(outfieldZoneCoords(8)[0].y).not.toBe(outfieldZoneCoords(8)[7].y);
  });

  it("keeps every marker inside the box and clear of the infield", () => {
    // A whole youth roster in the outfield is not a real team, but the layout
    // must not fall off the canvas or land on the middle infielders if one
    // shows up — an off-canvas marker fails silently.
    for (let count = 1; count <= 12; count += 1) {
      for (const { x, y } of outfieldZoneCoords(count)) {
        expect(x - DIAMOND_GEOMETRY.markerRadius).toBeGreaterThanOrEqual(0);
        expect(x + DIAMOND_GEOMETRY.markerRadius).toBeLessThanOrEqual(
          DIAMOND_GEOMETRY.width,
        );
        expect(y - DIAMOND_GEOMETRY.markerRadius).toBeGreaterThanOrEqual(0);
        expect(y + DIAMOND_GEOMETRY.markerRadius).toBeLessThanOrEqual(
          INFIELD_BACK,
        );
      }
    }
  });
});
