import type { Position } from "@/generated/prisma/enums";
import { ALL_PLAY_INFIELD_POSITIONS } from "@/lib/positions";

/// Where the nine positions sit on the diamond, shared by the read-only view
/// page (#8) and the drag editor (#11) so the two can never drift apart — a
/// coach dragging a kid to a spot the parents' diamond draws elsewhere would
/// be its own kind of bug.
///
/// Coordinates mirror where each position actually stands, and the **catcher
/// sits below home plate at y=452, which is why the viewBox is 520 tall**: the
/// view page draws a name at y+34 and an RSVP tag at y+47 under each marker, so
/// a shorter viewBox silently clips the catcher's name and state off the
/// bottom. Check the lowest marker's y+47 against the viewBox height before
/// moving anything. The clipping this guards against is silent — an off-canvas
/// name renders without error and simply cannot be seen.
///
/// One height for every board, including an allPlay team's — which has no
/// catcher (`ALL_PLAY_INFIELD_POSITIONS`) but still draws that spot, as the
/// solid disc in `NoCatcherMarker`.
export const DIAMOND_GEOMETRY = {
  width: 400,
  height: 520,
  markerRadius: 20,
  /// The ring drawn behind a guarded player's marker on the view page (#49).
  /// Two hard ceilings, both silent if broken, both pinned by Diamond.test.tsx:
  ///
  /// 1. **Neighbours.** SHORTSTOP (168,252) and SECOND_BASE (232,252) are the
  ///    closest pair at 64px, so 32px of budget each. A halo at 25 with a 3px
  ///    stroke reaches 26.5 and leaves 5.5px of air.
  /// 2. **The warning track.** CENTER_FIELD sits 345px from the home circle
  ///    and the track band's inner edge is at `trackRadius - trackWidth / 2` =
  ///    374, so the same 26.5 reach lands at 371.5 — on grass, by 2.5px. This
  ///    is the binding constraint, and it is why the reveal animation
  ///    translates rather than scales: a scale would push this ring onto the
  ///    track at the animation's peak.
  ///
  /// Both numbers move if the field radii or the position coordinates do.
  haloRadius: 25,
  /// The halo's stroke. Geometry, not styling, because it is half of what the
  /// ring actually reaches: `haloRadius + haloStrokeWidth / 2`. The colour
  /// lives in `guarded-style.ts`; this number is what the clearance tests and
  /// `zoneHaloRadius` do arithmetic on.
  haloStrokeWidth: 3,
  nameOffset: 34,
  tagOffset: 47,
} as const;

export const POSITION_COORDS: Record<Position, { x: number; y: number }> = {
  CATCHER: { x: 200, y: 452 },
  PITCHER: { x: 200, y: 338 },
  FIRST_BASE: { x: 292, y: 300 },
  SECOND_BASE: { x: 232, y: 252 },
  SHORTSTOP: { x: 168, y: 252 },
  THIRD_BASE: { x: 108, y: 300 },
  LEFT_FIELD: { x: 75, y: 130 },
  CENTER_FIELD: { x: 200, y: 75 },
  RIGHT_FIELD: { x: 325, y: 130 },
};

/// The infield polygon, in the same coordinate space.
export const DIAMOND_POLYGON = "200,420 290,320 200,230 110,320";

/// The painted field behind the markers (design-plan.md §6), in the same
/// coordinate space as POSITION_COORDS and consumed only by `FieldArt` — which
/// both the view page's diamond and the drag editor render, under the same
/// sharing rule as the coordinates themselves: a field one page paints and the
/// other doesn't is its own kind of bug.
///
/// Everything is derived from the geometry above rather than re-eyeballed:
/// home plate is the polygon's bottom vertex (200,420), the bases are its
/// other three, the mound sits between the pitcher marker and home, and the
/// home dirt circle's radius is what keeps the catcher marker at y=452
/// standing on dirt rather than on bare page.
export const FIELD_ART = {
  /// Fair territory: home plate out along both foul lines to the top corners.
  /// Grass, stripes, track, and fence are all clipped to this wedge.
  fairTerritory: "M200,420 L400,198 L400,0 L0,0 L0,198 Z",
  /// Mowed-stripe rings, centred on home plate: radius + strokeWidth pairs.
  stripes: [90, 170, 250, 330],
  stripeWidth: 40,
  /// Warning track band and fence arc, also centred on home plate. The fence's
  /// colour is the *caller's* choice, not this module's — see `FieldArt`'s
  /// `fence` prop. The positions editor draws it banana, as its one banana; the
  /// view page draws it chalk, having moved that budget onto the reader's own
  /// child (#49, design-plan.md §6.3).
  ///
  /// Pushed out far enough that the deepest outfielder (CENTER_FIELD at y=75,
  /// so a marker top edge of y=55) stands on grass rather than straddling the
  /// track. Check that gap before moving either radius.
  trackRadius: 392,
  trackWidth: 36,
  fenceRadius: 408,
  fenceWidth: 5,
  /// Everything green is clipped to this too, so the park ends at the fence
  /// instead of grass running out to the corners of the box. Sits just past
  /// the fence stroke (fenceRadius + fenceWidth/2) so the fence itself is not
  /// clipped in half.
  parkRadius: 411,
  /// Infield dirt: a diamond whose back edge bows behind second base.
  infieldDirt: "M200,444 L316,318 Q200,90 84,318 Z",
  /// The grass diamond inside the basepaths.
  infieldGrass: "M200,398 L272,322 L200,246 L128,322 Z",
  /// Home-plate dirt circle and pitcher's mound. The radius is not cosmetic:
  /// the catcher's spot sits at y=452 with a 20-radius marker, so anything
  /// under 52 leaves the catcher — and, on an allPlay board, the disc that
  /// stands in for the catcher — hanging off the dirt onto bare page.
  homeCircle: { x: 200, y: 420, r: 54 },
  mound: { x: 200, y: 330, r: 18 },
  pitchingRubber: { x: 193, y: 327, width: 14, height: 4 },
  /// Chalk foul lines, home plate to where each leaves the wedge.
  foulLines: ["M200,420 L14,213", "M200,420 L386,213"],
  /// Bases as rotated squares on the polygon's corners, plus the plate.
  baseSize: 14,
  bases: [
    { x: 290, y: 320 },
    { x: 200, y: 230 },
    { x: 110, y: 320 },
  ],
  homePlate: "M193,413 L207,413 L207,420 L200,427 L193,420 Z",
} as const;

/// The same coordinates as percentages, for the editor — its drop targets are
/// absolutely positioned HTML rather than SVG nodes, because dnd-kit measures
/// with `getBoundingClientRect` and drags HTML chips by writing `transform`.
/// Keeping targets and chips in the same coordinate system avoids fighting
/// SVG's.
export function positionPercent(position: Position): { x: number; y: number } {
  const { x, y } = POSITION_COORDS[position];
  return {
    x: (x / DIAMOND_GEOMETRY.width) * 100,
    y: (y / DIAMOND_GEOMETRY.height) * 100,
  };
}

/// The shape of the allPlay outfield zone, in the same coordinate space as
/// POSITION_COORDS. Tuned so a row of three reproduces LF/CF/RF exactly.
const OUTFIELD_ZONE = {
  /// Centre of the deepest row: CF's y.
  depth: 75,
  /// How much lower a row's outermost markers sit than its centre. 55 is what
  /// makes a row of three reproduce LF/CF/RF.
  arc: 55,
  /// Distance between rows, when one row isn't enough.
  rowGap: 78,
  /// Half-spread per gap between neighbours, so two outfielders stand shoulder
  /// to shoulder instead of straddling both foul lines.
  spreadPerGap: 62.5,
  /// Cap on that half-spread. Names are centred under their marker, so this is
  /// what keeps the outermost name inside the 400-wide box.
  maxSpread: 145,
  /// How many markers a row aims to hold: exceed it and a second row opens.
  /// Not a hard cap — past `perRowTarget * maxRows` outfielders the two rows
  /// simply get fuller, which is the intended degradation (see `maxRows`).
  perRowTarget: 5,
  /// A third row would reach the middle infielders at y=252, so a very deep
  /// roster packs its two rows tighter rather than growing downward.
  maxRows: 2,
} as const;

/**
 * Where an allPlay team's outfielders stand.
 *
 * That outfield is one zone rather than three named spots (#11), so the count
 * is whatever the infield leaves over — five on a twelve-player roster, but it
 * moves with the team. Markers are laid out in rows across the grass, each row
 * bowed the way an outfield actually plays: centre deepest, the ends drawn down
 * toward the foul lines.
 *
 * A row of three lands exactly on the LF/CF/RF coordinates above, which is the
 * point — a team that happens to field three outfielders reads as the standard
 * diamond rather than as some other chart.
 *
 * Returns one coordinate per player, in the order given.
 */
export function outfieldZoneCoords(
  count: number,
): { x: number; y: number }[] {
  if (count <= 0) {
    return [];
  }

  const rows = Math.min(
    OUTFIELD_ZONE.maxRows,
    Math.ceil(count / OUTFIELD_ZONE.perRowTarget),
  );
  const coords: { x: number; y: number }[] = [];
  let placed = 0;

  for (let row = 0; row < rows; row += 1) {
    // Spread the remainder over the rows that are left, so the deeper row takes
    // the extra player when the count doesn't divide evenly.
    const inRow = Math.ceil((count - placed) / (rows - row));
    const spread = Math.min(
      OUTFIELD_ZONE.maxSpread,
      OUTFIELD_ZONE.spreadPerGap * (inRow - 1),
    );
    const depth = OUTFIELD_ZONE.depth + row * OUTFIELD_ZONE.rowGap;

    for (let index = 0; index < inRow; index += 1) {
      // -1 at the left end of the row, +1 at the right, 0 dead centre.
      const offset = inRow === 1 ? 0 : (index / (inRow - 1)) * 2 - 1;
      coords.push({
        x: DIAMOND_GEOMETRY.width / 2 + offset * spread,
        y: depth + OUTFIELD_ZONE.arc * offset * offset,
      });
    }

    placed += inRow;
  }

  return coords;
}

/// How far a ring at `radius` reaches from its marker's centre — the stroke
/// straddles the radius, so half of it sits outside.
function haloReach(radius: number): number {
  return radius + DIAMOND_GEOMETRY.haloStrokeWidth / 2;
}

/// The largest halo that still fits around a marker in an outfield zone of
/// `count` players, or `null` when no visible ring fits at all.
///
/// `DIAMOND_GEOMETRY.haloRadius` was budgeted against the *fixed* positions,
/// whose tightest pair (SHORTSTOP/SECOND_BASE) stands 64px apart. The zone is
/// not fixed: `outfieldZoneCoords` packs more players into the same two rows as
/// the count grows, and neighbours close to 58px at 11–12, 48.7px at 13–14 and
/// 41.4px at 15–16. A constant 25 therefore merges two siblings' rings at 13,
/// and by 15 paints a ring that overlaps the *next kid's* marker — a highlight
/// that appears to point at the wrong child, which is worse than none.
///
/// Reachable without an unusual roster: an allPlay team whose coach has set a
/// batting order but no fielding positions puts every rostered player in the
/// zone at once.
///
/// Returns `null` rather than a ring too small to read: below a few pixels of
/// clear air around the marker the circle stops looking like a halo and starts
/// looking like a thick border. The marker still bolds the name and steps up,
/// and the `sr-only` mirror still says "(your player)" — the ring is the fast
/// path, never the only one.
export function zoneHaloRadius(count: number): number | null {
  const coords = outfieldZoneCoords(count);
  if (coords.length === 0) {
    return null;
  }

  let minGap = Infinity;
  for (let i = 0; i < coords.length; i += 1) {
    for (let j = i + 1; j < coords.length; j += 1) {
      minGap = Math.min(minGap, distance(coords[i], coords[j]));
    }
    // The zone shares a board with the allPlay infield. LF/CF/RF are excluded
    // by construction — the zone is drawn *at* those coordinates.
    for (const position of ALL_PLAY_INFIELD_POSITIONS) {
      minGap = Math.min(minGap, distance(coords[i], POSITION_COORDS[position]));
    }
  }

  if (minGap === Infinity) {
    return DIAMOND_GEOMETRY.haloRadius;
  }

  const stroke = DIAMOND_GEOMETRY.haloStrokeWidth / 2;
  const radius = Math.min(
    DIAMOND_GEOMETRY.haloRadius,
    // Two rings must not touch.
    minGap / 2 - stroke,
    // A ring must not reach a neighbouring marker's circle.
    minGap - DIAMOND_GEOMETRY.markerRadius - stroke,
  );

  return radius >= DIAMOND_GEOMETRY.markerRadius + MIN_HALO_AIR ? radius : null;
}

/// Clear air between the marker's edge and the ring, below which the halo
/// reads as a border rather than a highlight.
const MIN_HALO_AIR = 3;

function distance(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export { haloReach };
