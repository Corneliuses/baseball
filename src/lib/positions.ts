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

/// All nine, in scorebook order.
export const ALL_POSITIONS: readonly Position[] = [
  ...INFIELD_POSITIONS,
  ...OUTFIELD_POSITIONS,
] as const;

export function positionLabel(position: Position): string {
  return POSITION_LABELS[position];
}
