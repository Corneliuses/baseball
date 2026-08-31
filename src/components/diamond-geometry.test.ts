import { describe, it, expect } from "vitest";

import type { Position } from "@/generated/prisma/enums";
import { OUTFIELD_POSITIONS } from "@/lib/positions";

import {
  DIAMOND_GEOMETRY,
  FIELD_ART,
  POSITION_COORDS,
  deepZoneFits,
  outfieldHaloRadius,
  outfieldSpotCoords,
  outfieldZoneCoords,
  positionPercent,
  zoneHaloRadius,
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

  it("skips its shallow row in deep mode, leaving it to the named spots", () => {
    // The shallow row sits AT the LF/CF/RF coordinates; when a named spot has
    // players on it, a shallow zone marker would land on top of them.
    const shallowRow = Math.max(...outfieldZoneCoords(3).map((c) => c.y));
    for (let count = 1; count <= 16; count += 1) {
      const coords = outfieldZoneCoords(count, { deep: true });
      expect(coords).toHaveLength(count);
      for (const { y } of coords) {
        expect(y).toBeGreaterThan(shallowRow);
        expect(y + DIAMOND_GEOMETRY.markerRadius).toBeLessThanOrEqual(
          INFIELD_BACK,
        );
      }
    }
  });

  it("keeps deep-row markers apart only up to deepZoneFits, and says so", () => {
    // The deep row is one row — a third would reach the middle infielders — so
    // it runs out, and `deepZoneFits` is the honest boundary rather than a
    // count the caller has to know. Asserting BOTH directions is the point:
    // testing only up to the last passing count is the anti-pattern
    // CROWDED_ZONE_SIZES already warns about, and it is exactly how a 36px
    // deep row shipped.
    const minGap = (coords: { x: number; y: number }[]) => {
      let gap = Infinity;
      for (let i = 0; i < coords.length; i += 1) {
        for (let j = i + 1; j < coords.length; j += 1) {
          gap = Math.min(
            gap,
            Math.hypot(coords[i].x - coords[j].x, coords[i].y - coords[j].y),
          );
        }
      }
      return gap;
    };

    for (let count = 1; count <= 16; count += 1) {
      const gap = minGap(outfieldZoneCoords(count, { deep: true }));
      if (deepZoneFits(count)) {
        expect(gap).toBeGreaterThanOrEqual(2 * DIAMOND_GEOMETRY.markerRadius);
      } else {
        // Not a bug to fix here — it is why `Diamond` stops using this layout
        // and falls back to the ordinary two-row zone for the whole outfield.
        expect(gap).toBeLessThan(2 * DIAMOND_GEOMETRY.markerRadius);
      }
    }
  });

  it("holds the whole outfield without overlap in the layout deep mode falls back to", () => {
    // The crowded board's escape hatch: pinned and unpinned kids together in
    // the ordinary two-row zone. It must scale past any real roster, since
    // that is the case that reached it.
    for (let count = 1; count <= 16; count += 1) {
      const coords = outfieldZoneCoords(count);
      for (let i = 0; i < coords.length; i += 1) {
        for (let j = i + 1; j < coords.length; j += 1) {
          expect(
            Math.hypot(coords[i].x - coords[j].x, coords[i].y - coords[j].y),
          ).toBeGreaterThanOrEqual(2 * DIAMOND_GEOMETRY.markerRadius);
        }
      }
    }
  });
});

describe("outfieldSpotCoords", () => {
  const distance = (
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => Math.hypot(a.x - b.x, a.y - b.y);

  it("returns nothing for a non-outfield position or an empty spot", () => {
    expect(outfieldSpotCoords("PITCHER", 2)).toEqual([]);
    expect(outfieldSpotCoords("CENTER_FIELD", 0)).toEqual([]);
  });

  it("puts a lone kid exactly on the spot — indistinguishable from the fixed diamond", () => {
    for (const position of OUTFIELD_POSITIONS) {
      const [coord] = outfieldSpotCoords(position, 1);
      expect(coord.x).toBeCloseTo(POSITION_COORDS[position].x);
      expect(coord.y).toBeCloseTo(POSITION_COORDS[position].y);
    }
  });

  it("fans a pair wide enough to keep the full guarded halo", () => {
    // A pair 55px apart clears haloRadius 25 with the 3px stroke: the rings
    // neither touch each other nor reach the neighbouring marker.
    const reach =
      DIAMOND_GEOMETRY.haloRadius + DIAMOND_GEOMETRY.haloStrokeWidth / 2;
    for (const position of OUTFIELD_POSITIONS) {
      const [a, b] = outfieldSpotCoords(position, 2);
      const gap = distance(a, b);
      expect(gap).toBeGreaterThanOrEqual(2 * reach);
      expect(gap).toBeGreaterThanOrEqual(
        reach + DIAMOND_GEOMETRY.markerRadius,
      );
    }
  });

  it("keeps three full spots — nine markers — clear of each other", () => {
    // Neighbouring markers must never overlap: two 20px-radius circles need
    // 40px of separation. The tightest observed pair is a trio's own
    // neighbours at ~40.4px, the same crowded-zone floor the two-row zone
    // reaches at 15–16 players.
    const all = OUTFIELD_POSITIONS.flatMap((position) =>
      outfieldSpotCoords(position, 3),
    );
    expect(all).toHaveLength(9);
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        expect(distance(all[i], all[j])).toBeGreaterThanOrEqual(
          2 * DIAMOND_GEOMETRY.markerRadius,
        );
      }
    }
  });

  it("keeps every fanned marker inside the band that keeps its NAME on the box", () => {
    // The regression: a symmetric corner trio put its outer marker at x=35.
    // The 40px circle still fitted, so nothing looked broken — but names are
    // centred under their marker, and maxSpread exists precisely to stop one
    // running off the 400-wide box. The fan slides inward instead.
    // The band is `maxSpread` either side of the centre line, read off the
    // widest row the zone itself draws rather than restated as a number here.
    const widest = outfieldZoneCoords(9).map((coord) => coord.x);
    const left = Math.min(...widest);
    const right = Math.max(...widest);
    expect(left).toBeLessThan(POSITION_COORDS.LEFT_FIELD.x);

    for (const position of OUTFIELD_POSITIONS) {
      for (let count = 1; count <= 3; count += 1) {
        for (const { x } of outfieldSpotCoords(position, count)) {
          expect(x).toBeGreaterThanOrEqual(left);
          expect(x).toBeLessThanOrEqual(right);
        }
      }
    }
  });

  it("keeps every fanned marker inside the box and clear of the infield", () => {
    for (const position of OUTFIELD_POSITIONS) {
      for (let count = 1; count <= 3; count += 1) {
        for (const { x, y } of outfieldSpotCoords(position, count)) {
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
    }
  });

  it("stays clear of a deep zone row drawn below the spots", () => {
    // The mixed board: full named spots plus up to 8 unpinned kids in the one
    // remaining row. No marker pair may overlap across the two layouts.
    const spots = OUTFIELD_POSITIONS.flatMap((position) =>
      outfieldSpotCoords(position, 3),
    );
    for (let zoneCount = 1; zoneCount <= 8; zoneCount += 1) {
      const zone = outfieldZoneCoords(zoneCount, { deep: true });
      for (const spot of spots) {
        for (const marker of zone) {
          expect(distance(spot, marker)).toBeGreaterThanOrEqual(
            2 * DIAMOND_GEOMETRY.markerRadius,
          );
        }
      }
    }
  });
});

describe("outfieldHaloRadius", () => {
  it("gives a lone pinned outfielder the full halo", () => {
    expect(outfieldHaloRadius(outfieldSpotCoords("CENTER_FIELD", 1))).toBe(
      DIAMOND_GEOMETRY.haloRadius,
    );
  });

  it("keeps the full halo for a fanned pair", () => {
    expect(outfieldHaloRadius(outfieldSpotCoords("LEFT_FIELD", 2))).toBe(
      DIAMOND_GEOMETRY.haloRadius,
    );
  });

  it("returns null for a trio — the crowded-zone degradation", () => {
    // Three at one spot stand ~40px apart, which is markers touching: no ring
    // worth reading fits. The marker still bolds the name and steps up, and
    // the sr-only mirror still says "(your player)".
    for (const position of OUTFIELD_POSITIONS) {
      expect(outfieldHaloRadius(outfieldSpotCoords(position, 3))).toBeNull();
    }
  });

  it("sizes the ring around the guarded markers, not the whole outfield", () => {
    // The regression: one three-deep spot used to null the radius for every
    // marker on the board, so a parent whose kid stood ALONE at LF lost the
    // highlight to a cluster their child is nowhere near — on the page whose
    // entire job is "where is my kid".
    const loneLeft = outfieldSpotCoords("LEFT_FIELD", 1);
    const centreTrio = outfieldSpotCoords("CENTER_FIELD", 3);
    const board = [...loneLeft, ...centreTrio];

    expect(outfieldHaloRadius(board, loneLeft)).toBe(
      DIAMOND_GEOMETRY.haloRadius,
    );
    // A kid inside the crowd still gets no ring — there is genuinely no room.
    expect(outfieldHaloRadius(board, [centreTrio[0]])).toBeNull();
  });

  it("is what zoneHaloRadius computes for the plain zone", () => {
    for (const count of [1, 3, 5, 8, 12, 15]) {
      expect(outfieldHaloRadius(outfieldZoneCoords(count))).toEqual(
        zoneHaloRadius(count),
      );
    }
  });

  it("never lets a ring touch another outfield or infield marker, whatever the board", () => {
    // Every mixed board a real roster can produce: 0–3 kids per named spot,
    // the rest in the zone (deep when any spot is taken).
    const reachOf = (radius: number) =>
      radius + DIAMOND_GEOMETRY.haloStrokeWidth / 2;
    const infield = (
      ["PITCHER", "FIRST_BASE", "SECOND_BASE", "THIRD_BASE", "SHORTSTOP"] as Position[]
    ).map((position) => POSITION_COORDS[position]);

    for (const lf of [0, 1, 2, 3]) {
      for (const cf of [0, 1, 2, 3]) {
        for (const rf of [0, 1, 2, 3]) {
          for (const zoneCount of [0, 2, 5, 8]) {
            const coords = [
              ...outfieldSpotCoords("LEFT_FIELD", lf),
              ...outfieldSpotCoords("CENTER_FIELD", cf),
              ...outfieldSpotCoords("RIGHT_FIELD", rf),
              ...outfieldZoneCoords(zoneCount, {
                deep: lf + cf + rf > 0,
              }),
            ];
            const radius = outfieldHaloRadius(coords);
            if (radius === null) {
              continue;
            }
            const reach = reachOf(radius);
            for (let i = 0; i < coords.length; i += 1) {
              for (let j = i + 1; j < coords.length; j += 1) {
                const gap = Math.hypot(
                  coords[i].x - coords[j].x,
                  coords[i].y - coords[j].y,
                );
                expect(gap).toBeGreaterThanOrEqual(2 * reach);
              }
              for (const fielder of infield) {
                const gap = Math.hypot(
                  coords[i].x - fielder.x,
                  coords[i].y - fielder.y,
                );
                expect(gap).toBeGreaterThanOrEqual(
                  reach + DIAMOND_GEOMETRY.markerRadius,
                );
              }
            }
          }
        }
      }
    }
  });
});
