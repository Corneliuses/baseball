import { describe, it, expect } from "vitest";

import {
  DIAMOND_GEOMETRY,
  FIELD_ART,
  POSITION_COORDS,
  outfieldZoneCoords,
  positionPercent,
} from "./diamond-geometry";

/// The back point of the infield polygon. Nothing in the outfield zone may
/// reach it, or an outfielder's circle sits on top of the middle infielders.
const INFIELD_BACK = 230;

describe("DIAMOND_GEOMETRY", () => {
  it("is tall enough for the catcher's name and RSVP tag", () => {
    // The clipping this guards against is silent — an off-canvas name renders
    // without error and simply cannot be seen.
    expect(POSITION_COORDS.CATCHER.y + DIAMOND_GEOMETRY.tagOffset).toBeLessThan(
      DIAMOND_GEOMETRY.height,
    );
  });
});

describe("FIELD_ART", () => {
  it("seats the catcher's spot on the home dirt circle", () => {
    // The catcher stands below home plate, so the dirt has to reach past that
    // marker's bottom edge. Undersize it and the catcher — or, on an allPlay
    // board, the disc that stands in for one — hangs off the dirt onto bare
    // page, where a deliberate marker reads as a rendering artefact. Nothing
    // errors; it just looks broken.
    const catcherBottom =
      POSITION_COORDS.CATCHER.y +
      DIAMOND_GEOMETRY.markerRadius -
      FIELD_ART.homeCircle.y;

    expect(FIELD_ART.homeCircle.r).toBeGreaterThanOrEqual(catcherBottom);
  });

  it("keeps the deepest outfielder on grass, off the warning track", () => {
    // The track is a band centred on trackRadius, so its inner edge is what
    // the centre fielder must clear.
    const trackInnerEdge =
      FIELD_ART.homeCircle.y -
      (FIELD_ART.trackRadius - FIELD_ART.trackWidth / 2);
    const centreFielderTop =
      POSITION_COORDS.CENTER_FIELD.y - DIAMOND_GEOMETRY.markerRadius;

    expect(centreFielderTop).toBeGreaterThan(trackInnerEdge);
  });

  it("clips the park past the fence rather than through it", () => {
    // The green is clipped to parkRadius so grass stops at the wall. Clip
    // inside the fence stroke and the fence is shaved in half.
    expect(FIELD_ART.parkRadius).toBeGreaterThanOrEqual(
      FIELD_ART.fenceRadius + FIELD_ART.fenceWidth / 2,
    );
  });
});

describe("positionPercent", () => {
  it("scales the coordinates against the box", () => {
    expect(positionPercent("CATCHER")).toEqual({
      x: (POSITION_COORDS.CATCHER.x / DIAMOND_GEOMETRY.width) * 100,
      y: (POSITION_COORDS.CATCHER.y / DIAMOND_GEOMETRY.height) * 100,
    });
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

  it("packs its two rows fuller rather than opening a third", () => {
    // `perRowTarget` opens the second row, it does not cap either one: 12
    // outfielders is 6 and 6, not 5 and 5 with two players dropped. That needs
    // a 17-player allPlay roster to reach, but the alternative — a third row —
    // would land on the middle infielders at y=252.
    const coords = outfieldZoneCoords(12);

    expect(coords).toHaveLength(12);
    expect(new Set(coords.map((coord) => Math.round(coord.y))).size).toBeLessThanOrEqual(6);
    expect(Math.max(...coords.map((coord) => coord.y))).toBeLessThan(INFIELD_BACK);
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
