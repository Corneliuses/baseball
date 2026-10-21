import type { CourtPosition } from "@/generated/prisma/enums";

/// The five spots on the half court, in the order the depth chart lists them:
/// the 1 through the 5, guards to bigs. A plain array of the type rather than
/// the generated enum object, so a client component importing it keeps the
/// Prisma runtime out of the browser bundle.
export const COURT_POSITIONS: readonly CourtPosition[] = [
  "POINT_GUARD",
  "SHOOTING_GUARD",
  "SMALL_FORWARD",
  "POWER_FORWARD",
  "CENTER",
] as const;

/// Short labels, as drawn on the court. Use these rather than hand-writing
/// "PG" anywhere, the same rule `POSITION_LABELS` sets for the diamond.
export const COURT_POSITION_LABELS: Record<CourtPosition, string> = {
  POINT_GUARD: "PG",
  SHOOTING_GUARD: "SG",
  SMALL_FORWARD: "SF",
  POWER_FORWARD: "PF",
  CENTER: "C",
};

/// Full names, for screen readers and the list beside the court.
export const COURT_POSITION_NAMES: Record<CourtPosition, string> = {
  POINT_GUARD: "Point guard",
  SHOOTING_GUARD: "Shooting guard",
  SMALL_FORWARD: "Small forward",
  POWER_FORWARD: "Power forward",
  CENTER: "Center",
};

/// "1st", "2nd", "3rd", "4th" … — a bench slot as the lists print it.
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) {
    return `${n}th`;
  }
  const suffix = n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

export function isCourtPosition(value: string): value is CourtPosition {
  return (COURT_POSITIONS as readonly string[]).includes(value);
}
