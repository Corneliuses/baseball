import { describe, it, expect } from "vitest";

import {
  DIAMOND_GEOMETRY,
  FIELD_ART,
  POSITION_COORDS,
  outfieldZoneCoords,
} from "@/components/diamond-geometry";
import { GUARDED_STYLE } from "@/components/guarded-style";
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
const { width, height, markerRadius, haloRadius, tagOffset } = DIAMOND_GEOMETRY;

/// How far the guarded-player halo actually reaches from a marker's centre:
/// a stroke straddles its radius, so half of it sits outside.
const haloReach = haloRadius + GUARDED_STYLE.haloStrokeWidth / 2;

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


/// The halo (#49) is the first thing this diamond draws *outside* a marker's
/// own radius, which makes it the first thing that can silently collide with
/// something. All three of these failures render without error: a halo past the
/// viewBox is clipped, a halo over its neighbour just looks like a smudge on a
/// green field, and a halo on the tan warning track loses the contrast that
/// makes it findable at all — which is the entire feature.
describe("guarded-player halo geometry", () => {
  it("draws outside the marker it rings, not under it", () => {
    expect(haloRadius).toBeGreaterThan(markerRadius);
  });

  it("stays inside the viewBox on every side, for every position", () => {
    for (const position of ALL_POSITIONS) {
      const { x, y } = POSITION_COORDS[position];
      expect(y - haloReach).toBeGreaterThanOrEqual(0);
      expect(x - haloReach).toBeGreaterThanOrEqual(0);
      expect(x + haloReach).toBeLessThanOrEqual(width);
      expect(y + haloReach).toBeLessThanOrEqual(height);
    }
  });

  it("never touches a neighbouring marker", () => {
    // The binding pair is SHORTSTOP/SECOND_BASE at 64px. A halo on one must
    // stop short of the other's circle, or the ring reads as belonging to
    // both kids.
    for (let i = 0; i < ALL_POSITIONS.length; i++) {
      for (let j = i + 1; j < ALL_POSITIONS.length; j++) {
        const a = POSITION_COORDS[ALL_POSITIONS[i]];
        const b = POSITION_COORDS[ALL_POSITIONS[j]];
        expect(apart(a, b)).toBeGreaterThan(haloReach + markerRadius);
      }
    }
  });

  it("never touches a neighbouring halo", () => {
    // Two guarded kids on one team is ordinary — siblings — so two halos can
    // be drawn at once.
    for (let i = 0; i < ALL_POSITIONS.length; i++) {
      for (let j = i + 1; j < ALL_POSITIONS.length; j++) {
        const a = POSITION_COORDS[ALL_POSITIONS[i]];
        const b = POSITION_COORDS[ALL_POSITIONS[j]];
        expect(apart(a, b)).toBeGreaterThan(haloReach * 2);
      }
    }
  });

  it("never touches a halo in the outfield zone", () => {
    for (const size of ZONE_SIZES) {
      for (const zoneCoord of outfieldZoneCoords(size)) {
        for (const position of ALL_PLAY_INFIELD_POSITIONS) {
          expect(apart(zoneCoord, POSITION_COORDS[position])).toBeGreaterThan(
            haloReach * 2,
          );
        }
      }
    }
  });

  it("keeps every halo on the grass, clear of the warning track", () => {
    // CENTER_FIELD is the deep one: 345px from the home circle against a track
    // whose inner edge is at 374. A yellow ring on tan is the contrast this
    // feature is made of, and losing it is invisible in any markup assertion.
    const trackInnerEdge = FIELD_ART.trackRadius - FIELD_ART.trackWidth / 2;
    const home = { x: FIELD_ART.homeCircle.x, y: FIELD_ART.homeCircle.y };

    for (const position of ALL_POSITIONS) {
      const reach = apart(POSITION_COORDS[position], home) + haloReach;
      expect(reach).toBeLessThan(trackInnerEdge);
    }
  });

  it("keeps every outfield-zone halo on the grass too", () => {
    const trackInnerEdge = FIELD_ART.trackRadius - FIELD_ART.trackWidth / 2;
    const home = { x: FIELD_ART.homeCircle.x, y: FIELD_ART.homeCircle.y };

    for (const size of ZONE_SIZES) {
      for (const zoneCoord of outfieldZoneCoords(size)) {
        expect(apart(zoneCoord, home) + haloReach).toBeLessThan(trackInnerEdge);
      }
    }
  });
});
