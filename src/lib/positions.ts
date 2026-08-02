import { Position } from "@/generated/prisma/enums";

/// Short labels as they appear on the diamond and the view page.
/// Note C is Catcher and CF is Center Field — an earlier draft of the brief had
/// these confused, so prefer this map over hand-writing labels anywhere.
export const POSITION_LABELS: Record<Position, string> = {
  PITCHER: "P",
  CATCHER: "C",
  FIRST_BASE: "1B",
  SECOND_BASE: "2B",
  THIRD_BASE: "3B",
  SHORTSTOP: "SS",
  LEFT_FIELD: "LF",
  CENTER_FIELD: "CF",
  RIGHT_FIELD: "RF",
};

export const INFIELD_POSITIONS: readonly Position[] = [
  "PITCHER",
  "CATCHER",
  "FIRST_BASE",
  "SECOND_BASE",
  "THIRD_BASE",
  "SHORTSTOP",
] as const;

/**
 * The infield an allPlay team actually fields: no catcher.
 *
 * allPlay is the coach-pitch end of youth baseball, where the coach pitches and
 * nobody crouches behind the plate — so C is not a spot a coach can fill, the
 * same way LF/CF/RF aren't (the outfield is one zone there). Drawing it as
 * "Open" would show every parent a hole in the lineup that cannot be filled.
 *
 * Filtered rather than relisted so it can't drift out of scorebook order, or
 * out of sync with INFIELD_POSITIONS.
 */
export const ALL_PLAY_INFIELD_POSITIONS: readonly Position[] =
  INFIELD_POSITIONS.filter((position) => position !== "CATCHER");

export const OUTFIELD_POSITIONS: readonly Position[] = [
  "LEFT_FIELD",
  "CENTER_FIELD",
  "RIGHT_FIELD",
] as const;

/**
 * The label inside an outfielder's marker on an allPlay diamond.
 *
 * Not a `Position`: the allPlay outfield is one zone holding however many
 * players the infield leaves over, and every one of them persists as
 * `position = null`. It lives here anyway because it is drawn in the same
 * circles as the position abbreviations, and AGENTS.md's rule is that diamond
 * labels come from this module rather than being written by hand.
 */
export const OUTFIELD_ZONE_LABEL = "OF";

/// All nine, in scorebook order.
export const ALL_POSITIONS: readonly Position[] = [
  ...INFIELD_POSITIONS,
  ...OUTFIELD_POSITIONS,
] as const;

export function positionLabel(position: Position): string {
  return POSITION_LABELS[position];
}
