import { describe, it, expect } from "vitest";

import {
  DIAMOND_GEOMETRY,
  POSITION_COORDS,
  outfieldZoneCoords,
} from "@/components/diamond-geometry";
import {
  ALL_PLAY_INFIELD_POSITIONS,
  ALL_POSITIONS,
  OUTFIELD_POSITIONS,
} from "@/lib/positions";

/// Big enough to cover any youth roster, and then some.
const ZONE_SIZES = Array.from({ length: 12 }, (_, index) => index + 1);

function apart(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/// Layout invariants for the diamond. These failures are otherwise silent:
/// an SVG child drawn outside the viewBox is simply clipped, and two markers
/// on top of each other still render — neither throws, and neither shows up
/// in a snapshot of the markup. The catcher's name was clipped exactly this
/// way before these tests existed.
const { width, height, markerRadius, tagOffset } = DIAMOND_GEOMETRY;

describe("diamond geometry", () => {
  it("places all nine positions", () => {
    for (const position of ALL_POSITIONS) {
      expect(POSITION_COORDS[position]).toBeDefined();
    }
    expect(Object.keys(POSITION_COORDS)).toHaveLength(9);
  });

  it("keeps every marker's lowest text inside the viewBox", () => {
    for (const position of ALL_POSITIONS) {
      const { y } = POSITION_COORDS[position];
      expect(y + tagOffset).toBeLessThanOrEqual(height);
    }
  });

  it("keeps every marker inside the viewBox on the other three sides", () => {
    for (const position of ALL_POSITIONS) {
      const { x, y } = POSITION_COORDS[position];
      expect(y - markerRadius).toBeGreaterThanOrEqual(0);
      expect(x - markerRadius).toBeGreaterThanOrEqual(0);
      expect(x + markerRadius).toBeLessThanOrEqual(width);
    }
  });

  it("never overlaps two position markers", () => {
    for (let i = 0; i < ALL_POSITIONS.length; i++) {
      for (let j = i + 1; j < ALL_POSITIONS.length; j++) {
        const a = POSITION_COORDS[ALL_POSITIONS[i]];
        const b = POSITION_COORDS[ALL_POSITIONS[j]];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);

        expect(distance).toBeGreaterThan(markerRadius * 2);
      }
    }
  });

  it("leaves a marker's text clear of the marker below it", () => {
    // Any marker whose text band would collide with a lower marker's circle
    // makes both unreadable. Compare only near-vertical neighbours.
    for (const upper of ALL_POSITIONS) {
      for (const lower of ALL_POSITIONS) {
        if (upper === lower) continue;
        const a = POSITION_COORDS[upper];
        const b = POSITION_COORDS[lower];

        const horizontallyClose = Math.abs(a.x - b.x) < markerRadius * 2;
        const isBelow = b.y > a.y;
        if (!horizontallyClose || !isBelow) continue;

        expect(a.y + tagOffset).toBeLessThan(b.y - markerRadius);
      }
    }
  });

  it("never overlaps two markers in the outfield zone", () => {
    for (const count of ZONE_SIZES) {
      const coords = outfieldZoneCoords(count);
      for (let i = 0; i < coords.length; i++) {
        for (let j = i + 1; j < coords.length; j++) {
          expect(apart(coords[i], coords[j])).toBeGreaterThan(markerRadius * 2);
        }
      }
    }
  });

  it("never overlaps an outfield zone marker with an infield one", () => {
    for (const count of ZONE_SIZES) {
      for (const coord of outfieldZoneCoords(count)) {
        for (const position of ALL_PLAY_INFIELD_POSITIONS) {
          expect(apart(coord, POSITION_COORDS[position])).toBeGreaterThan(
            markerRadius * 2,
          );
        }
      }
    }
  });

  it("puts the zone exactly on LF/CF/RF, so nothing may ever draw both", () => {
    // The coincidence is deliberate — three outfielders should read as the
    // standard diamond. It also means a board drawing a named outfield marker
    // AND a zone would stack two markers on one spot, with both names
    // unreadable and neither an error. `buildChartView` is what makes that
    // unreachable: under allPlay it pools anyone stored at a named outfield
    // spot, so `byPosition` cannot hold one while `outfield` is non-empty.
    expect(outfieldZoneCoords(3)).toEqual(
      OUTFIELD_POSITIONS.map((position) => POSITION_COORDS[position]).sort(
        (a, b) => a.x - b.x,
      ),
    );
  });
});
