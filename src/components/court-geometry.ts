import type { CourtPosition } from "@/generated/prisma/enums";

/**
 * The half court the basketball depth chart is drawn on, in SVG user units.
 *
 * Eight units to the foot over a 50 × 47 ft half court (the real proportions),
 * with the basket at the top — the baseline is y = 0 and the half-court line is
 * the bottom edge, so a reader holds the phone the way a coach draws a play on
 * a whiteboard. Key and arcs are high-school sizes (12 ft lane, 19 ft 9 in
 * three), which is what youth gyms are painted with.
 *
 * Every coordinate that means something lives here; `CourtArt` only paints
 * underneath, the same split as `diamond-geometry.ts` and `FieldArt`.
 */
const FT = 8;

export const COURT_GEOMETRY = {
  width: 50 * FT,
  height: 47 * FT,
} as const;

const centerX = COURT_GEOMETRY.width / 2;

export const COURT_ART = {
  /// Centre of the rim, 5 ft 3 in off the baseline.
  basket: { x: centerX, y: 5.25 * FT },
  rimRadius: 0.75 * FT,
  /// Backboard: 6 ft wide, 4 ft in from the baseline.
  backboard: { x1: centerX - 3 * FT, x2: centerX + 3 * FT, y: 4 * FT },
  /// The lane ("the paint"): 12 ft wide, out to the free-throw line at 19 ft.
  lane: { x: centerX - 6 * FT, y: 0, width: 12 * FT, height: 19 * FT },
  freeThrowRadius: 6 * FT,
  /// Three-point arc radius about the basket, 19 ft 9 in.
  threeRadius: 19.75 * FT,
  /// No-charge semicircle, 4 ft.
  restrictedRadius: 4 * FT,
  /// Centre circle, of which only the half on this side is drawn.
  centerCircleRadius: 6 * FT,
  /// Floorboard width, for the hardwood's grain.
  plank: 2 * FT,
} as const;

/**
 * Where each position stands: the usual five-out-of-a-set picture a youth
 * coach draws. The point guard brings it up at the top of the arc, the wings
 * are the 2 and the 3, and the bigs work the blocks — the 4 at the high post
 * on the right, the 5 on the left block.
 */
export const COURT_SPOT_COORDS: Record<CourtPosition, { x: number; y: number }> =
  {
    POINT_GUARD: { x: centerX, y: 33 * FT },
    SHOOTING_GUARD: { x: 42 * FT, y: 23 * FT },
    SMALL_FORWARD: { x: 8 * FT, y: 23 * FT },
    POWER_FORWARD: { x: 34 * FT, y: 12 * FT },
    CENTER: { x: 15 * FT, y: 9 * FT },
  };

/// A spot's coordinates as percentages of the court box, for the HTML drop
/// targets and markers laid over the SVG.
export function courtSpotPercent(position: CourtPosition): {
  x: number;
  y: number;
} {
  const { x, y } = COURT_SPOT_COORDS[position];
  return {
    x: (x / COURT_GEOMETRY.width) * 100,
    y: (y / COURT_GEOMETRY.height) * 100,
  };
}
