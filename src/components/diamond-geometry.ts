import type { Position } from "@/generated/prisma/enums";

/// Where the nine positions sit on the diamond, shared by the read-only view
/// page (#8) and the drag editor (#11) so the two can never drift apart — a
/// coach dragging a kid to a spot the parents' diamond draws elsewhere would
/// be its own kind of bug.
///
/// Coordinates mirror where each position actually stands, and the **catcher
/// sits below home plate at y=452, which is why the full viewBox is 520 tall**:
/// the view page draws a name at y+34 and an RSVP tag at y+47 under each
/// marker, so a shorter viewBox silently clips the catcher's name and state off
/// the bottom. Check the lowest marker's y+47 against the viewBox height before
/// moving anything. The clipping this guards against is silent — an off-canvas
/// name renders without error and simply cannot be seen.
///
/// `catcherlessHeight` is that same box with the catcher's band cut off, for an
/// allPlay team, which has no catcher (`ALL_PLAY_INFIELD_POSITIONS`). The
/// lowest thing left is the pitcher's RSVP tag at 338+47=385, then the plate at
/// y=420 — so 440 keeps the whole diamond and drops only dead space. Ask
/// `diamondHeight` for it rather than picking a number: the answer turns on
/// whether a catcher marker is actually drawn, and an allPlay team with a stale
/// CATCHER row still draws one.
export const DIAMOND_GEOMETRY = {
  width: 400,
  height: 520,
  catcherlessHeight: 440,
  markerRadius: 20,
  nameOffset: 34,
  tagOffset: 47,
} as const;

/// The viewBox height to draw at. Keyed on whether a catcher marker appears —
/// not on allPlay — because it is the marker at y=452 that needs the room, and
/// a stale CATCHER row draws one on an allPlay board too.
export function diamondHeight(withCatcher: boolean): number {
  return withCatcher
    ? DIAMOND_GEOMETRY.height
    : DIAMOND_GEOMETRY.catcherlessHeight;
}

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

/// The same coordinates as percentages, for the editor — its drop targets are
/// absolutely positioned HTML rather than SVG nodes, because dnd-kit measures
/// with `getBoundingClientRect` and drags HTML chips by writing `transform`.
/// Keeping targets and chips in the same coordinate system avoids fighting
/// SVG's.
///
/// `withCatcher` must match what the caller passed to `diamondHeight` for the
/// box it is positioning inside, or every marker lands at the wrong depth.
export function positionPercent(
  position: Position,
  withCatcher: boolean,
): { x: number; y: number } {
  const { x, y } = POSITION_COORDS[position];
  return {
    x: (x / DIAMOND_GEOMETRY.width) * 100,
    y: (y / diamondHeight(withCatcher)) * 100,
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
  /// Rows hold at most this many.
  perRow: 5,
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
    Math.ceil(count / OUTFIELD_ZONE.perRow),
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
