import type { Position } from "@/generated/prisma/enums";

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
export const DIAMOND_GEOMETRY = {
  width: 400,
  height: 520,
  markerRadius: 20,
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
