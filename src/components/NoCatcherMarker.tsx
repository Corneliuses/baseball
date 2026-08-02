import { DIAMOND_GEOMETRY, POSITION_COORDS } from "@/components/diamond-geometry";

/**
 * The catcher's spot on an allPlay board, where nobody plays.
 *
 * An allPlay team has no catcher — the coach pitches — so the spot is neither a
 * drop target nor an "Open" marker (`ALL_PLAY_INFIELD_POSITIONS`). Leaving it
 * blank raised the very question it was meant to settle: a gap behind the plate
 * reads as something missing from the chart rather than as something the level
 * doesn't have. So the absence is drawn.
 *
 * A solid disc, deliberately unlike both the stroked circles that hold a player
 * and the dashed ones that mean "Open" — it is the one marker on the field that
 * is not a spot anyone can fill. It carries no label and no name because there
 * is nobody to name; the disc is the whole statement.
 *
 * Shared by the view page's diamond and the drag editor's for the same reason
 * their coordinates are: a spot one draws and the other doesn't is its own kind
 * of bug. Both render it inside an aria-hidden SVG, so both owe a screen reader
 * the same fact in their own text — `NO_CATCHER_TEXT`.
 */
export function NoCatcherMarker() {
  return (
    <circle
      cx={POSITION_COORDS.CATCHER.x}
      cy={POSITION_COORDS.CATCHER.y}
      r={DIAMOND_GEOMETRY.markerRadius}
      className="fill-muted-foreground/30"
    />
  );
}

/// What the disc says, for the readers who can't see it.
export const NO_CATCHER_TEXT = "Catcher: nobody — the coach pitches.";
