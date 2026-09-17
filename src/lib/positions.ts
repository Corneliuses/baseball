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

/**
 * How many players may stand at one position on this team's board.
 *
 * One everywhere, except the named outfield spots on an allPlay team, which
 * stack to `OUTFIELD_SPOT_CAPACITY`. This is the ONLY way a team's setting
 * changes the positions board: every team fields all nine spots, so "is this
 * position on the board" is never a question — only "how many stand there".
 * (The catcher used to be the exception, unfieldable under allPlay because the
 * coach pitched; revised 2026-09-17 when the league turned out to put a kid
 * behind the plate. Don't reintroduce a fielded-positions set for one board.)
 */
export function positionCapacity(position: Position, allPlay: boolean): number {
  return allPlay && OUTFIELD_POSITIONS.includes(position)
    ? OUTFIELD_SPOT_CAPACITY
    : 1;
}

/// All nine, in scorebook order — and the board every team fields, allPlay or
/// not. Composed rather than relisted so it can't drift out of order.
export const ALL_POSITIONS: readonly Position[] = [
  ...INFIELD_POSITIONS,
  ...OUTFIELD_POSITIONS,
] as const;

export function positionLabel(position: Position): string {
  return POSITION_LABELS[position];
}
