import { describe, it, expect } from "vitest";

import {
  DIAMOND_GEOMETRY,
  FIELD_ART,
  POSITION_COORDS,
  outfieldSpotCoords,
  outfieldZoneCoords,
  zoneHaloRadius,
} from "@/components/diamond-geometry";
import {
  ALL_PLAY_INFIELD_POSITIONS,
  ALL_POSITIONS,
  OUTFIELD_POSITIONS,
} from "@/lib/positions";

/// Big enough to cover any youth roster, and then some.
const ZONE_SIZES = Array.from({ length: 12 }, (_, index) => index + 1);

/// Past what any youth roster holds, deliberately. The halo assertions below
/// used ZONE_SIZES and passed — because 12 is the last count at which a
/// constant 25px ring still fits. At 13 two siblings' rings merged and at 15 a
/// ring overlapped the next kid's marker, and nothing failed. A bound that
/// stops exactly where the failure starts is worse than no bound: it reads as
/// coverage.
const CROWDED_ZONE_SIZES = Array.from({ length: 24 }, (_, index) => index + 1);

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
const haloReach = haloRadius + DIAMOND_GEOMETRY.haloStrokeWidth / 2;

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

  it("puts the zone exactly on LF/CF/RF, so nothing may ever draw both shallow", () => {
    // The coincidence is deliberate — three unpinned outfielders should read
    // as the standard diamond. It also means a board drawing a named outfield
    // marker AND a shallow zone would stack two markers on one spot, with
    // both names unreadable and neither an error. The Diamond's `deep` switch
    // is what makes that unreachable: the moment any named spot has players,
    // the zone moves to its deep row (`outfieldZoneCoords(..., {deep})`).
    expect(outfieldZoneCoords(3)).toEqual(
      OUTFIELD_POSITIONS.map((position) => POSITION_COORDS[position]).sort(
        (a, b) => a.x - b.x,
      ),
    );
  });

  it("keeps every fanned spot halo on the grass, clear of the warning track", () => {
    // The named-spot counterpart of the zone checks below: a corner trio's
    // outermost marker is the deepest thing the outfield can draw.
    const trackInnerEdge = FIELD_ART.trackRadius - FIELD_ART.trackWidth / 2;
    const home = { x: FIELD_ART.homeCircle.x, y: FIELD_ART.homeCircle.y };

    for (const position of OUTFIELD_POSITIONS) {
      for (const count of [1, 2, 3]) {
        for (const coord of outfieldSpotCoords(position, count)) {
          expect(apart(coord, home) + haloReach).toBeLessThan(trackInnerEdge);
        }
      }
    }
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

  it("never touches a halo in the outfield zone, at any zone size", () => {
    for (const size of CROWDED_ZONE_SIZES) {
      const radius = zoneHaloRadius(size);
      if (radius === null) continue;
      const reach = radius + DIAMOND_GEOMETRY.haloStrokeWidth / 2;

      for (const zoneCoord of outfieldZoneCoords(size)) {
        for (const position of ALL_PLAY_INFIELD_POSITIONS) {
          expect(apart(zoneCoord, POSITION_COORDS[position])).toBeGreaterThan(
            reach + markerRadius,
          );
        }
      }
    }
  });

  it("never merges two halos inside the outfield zone", () => {
    // The gap the old suite never looked at: it compared zone markers to
    // infield ones and to each other at *marker* distance, but never two zone
    // halos. Two guarded siblings both in the outfield is an ordinary board.
    for (const size of CROWDED_ZONE_SIZES) {
      const radius = zoneHaloRadius(size);
      if (radius === null) continue;
      const reach = radius + DIAMOND_GEOMETRY.haloStrokeWidth / 2;
      const coords = outfieldZoneCoords(size);

      for (let i = 0; i < coords.length; i += 1) {
        for (let j = i + 1; j < coords.length; j += 1) {
          expect(apart(coords[i], coords[j])).toBeGreaterThan(reach * 2);
        }
      }
    }
  });

  it("never paints a zone halo over a neighbouring marker", () => {
    // The failure that actually lies to a parent: at 15 in the zone a constant
    // ring reached the *next* kid's circle, so the highlight appeared to point
    // at the wrong child.
    for (const size of CROWDED_ZONE_SIZES) {
      const radius = zoneHaloRadius(size);
      if (radius === null) continue;
      const reach = radius + DIAMOND_GEOMETRY.haloStrokeWidth / 2;
      const coords = outfieldZoneCoords(size);

      for (let i = 0; i < coords.length; i += 1) {
        for (let j = 0; j < coords.length; j += 1) {
          if (i === j) continue;
          expect(apart(coords[i], coords[j])).toBeGreaterThan(
            reach + markerRadius,
          );
        }
      }
    }
  });

  it("drops the ring rather than shrinking it into a border", () => {
    // Below a few pixels of clear air the circle stops reading as a halo. The
    // marker keeps its bold name, its step-up and its sr-only "(your player)".
    for (const size of CROWDED_ZONE_SIZES) {
      const radius = zoneHaloRadius(size);
      if (radius === null) continue;
      expect(radius).toBeGreaterThanOrEqual(markerRadius + 3);
      expect(radius).toBeLessThanOrEqual(haloRadius);
    }
  });

  it("still gives an ordinary-sized zone the full ring", () => {
    // The adaptive radius must not quietly shrink the common case: a youth
    // outfield is a handful of kids, and those boards looked right.
    for (const size of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(zoneHaloRadius(size)).toBe(haloRadius);
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
