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
 * nobody crouches behind the plate — so C is not a spot a coach can fill.
 * Drawing it as "Open" would show every parent a hole in the lineup that
 * cannot be filled. (LF/CF/RF used to be excluded the same way, as one
 * anonymous zone; they became placeable spots with the named-outfield
 * revision — see ALL_PLAY_POSITIONS.)
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
 * The label inside a general outfielder's marker on an allPlay diamond.
 *
 * Not a `Position`: an allPlay outfielder the coach hasn't pinned to LF/CF/RF
 * plays the general outfield zone and persists as `position = null`. It lives
 * here anyway because it is drawn in the same circles as the position
 * abbreviations, and AGENTS.md's rule is that diamond labels come from this
 * module rather than being written by hand.
 */
export const OUTFIELD_ZONE_LABEL = "OF";

/**
 * How many kids one named outfield spot holds on an allPlay team.
 *
 * At the coach-pitch level everyone fields, so a twelve-kid roster puts six
 * or seven in the outfield — three named spots at one kid each could never
 * seat them, which is why the outfield used to be a single anonymous zone.
 * Letting each spot stack to three keeps every kid placeable BY NAME on any
 * realistic roster (5 infield + 9 outfield = 14) while the general zone
 * (`position = null`) still catches whoever the coach leaves unpinned.
 *
 * Enforced in `validatePositions` (chart.ts), not by the database — the
 * unique index `[teamId, position, positionSlot]` guarantees one row per
 * slot, but nothing SQL-shaped caps the slot number itself.
 */
export const OUTFIELD_SPOT_CAPACITY = 3;

/// Everything an allPlay team fields: the coach-pitch infield (no catcher)
/// plus the three named outfield spots. Composed rather than relisted, same
/// as ALL_PLAY_INFIELD_POSITIONS, so it can't drift out of scorebook order.
export const ALL_PLAY_POSITIONS: readonly Position[] = [
  ...ALL_PLAY_INFIELD_POSITIONS,
  ...OUTFIELD_POSITIONS,
] as const;

/**
 * How many players may stand at one position on this team's board.
 *
 * One everywhere, except the named outfield spots on an allPlay team, which
 * stack to `OUTFIELD_SPOT_CAPACITY`. A capacity for a position the team
 * doesn't field at all (allPlay CATCHER) is still 1 — "is this position on
 * the board" is `fieldedPositions` / `droppablePositions`' question, not
 * this function's.
 */
export function positionCapacity(position: Position, allPlay: boolean): number {
  return allPlay && OUTFIELD_POSITIONS.includes(position)
    ? OUTFIELD_SPOT_CAPACITY
    : 1;
}

/// All nine, in scorebook order.
export const ALL_POSITIONS: readonly Position[] = [
  ...INFIELD_POSITIONS,
  ...OUTFIELD_POSITIONS,
] as const;

/**
 * The spots a team actually fields.
 *
 * The rule `buildChartView` and `buildPositionsDraft` both already apply, named
 * once so a third and fourth caller can't drift from it: an allPlay team fields
 * everything except the catcher (the coach pitches, nobody crouches behind the
 * plate), and a row stored at a position outside this set — a stale `CATCHER`
 * left behind when allPlay was switched on — is a spot that team has no way to
 * fill. LF/CF/RF joined the allPlay set when the named outfield spots became
 * placeable (each stacking to `OUTFIELD_SPOT_CAPACITY`); before that they were
 * one anonymous zone and a named-outfield row was itself stale.
 *
 * Anything deciding whether a position is real for a team, or *labelling* one,
 * has to ask this question. Reporting such a spot as uncovered invents a hole,
 * and printing its abbreviation next to a player's name tells the coach they
 * field a position the same screen refuses to check.
 */
export function fieldedPositions(allPlay: boolean): Set<Position> {
  return new Set(allPlay ? ALL_PLAY_POSITIONS : ALL_POSITIONS);
}

export function positionLabel(position: Position): string {
  return POSITION_LABELS[position];
}
