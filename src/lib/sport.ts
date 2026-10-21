import type { Sport } from "@/generated/prisma/enums";

/// The sports a team can play, in the order a picker lists them.
export const SPORTS: readonly Sport[] = ["BASEBALL", "BASKETBALL"];

export const SPORT_LABELS: Record<Sport, string> = {
  BASEBALL: "Baseball",
  BASKETBALL: "Basketball",
};

/// Whether a team of this sport has the standing lineup chart (batting order
/// and positions). The chart is per-sport: baseball's lives in the RosterEntry
/// chart columns, and basketball has none yet. Every chart surface asks this
/// one function, so when basketball's playing-time model is designed it gets
/// its own module behind this same gate rather than a new set of checks.
export function hasLineupChart(sport: Sport): boolean {
  return sport === "BASEBALL";
}

/// The value of the `data-sport` attribute that switches a subtree to a
/// sport's own palette (globals.css), or undefined for baseball, which is the
/// app's default theme and needs no attribute. Every surface that themes by
/// sport — PageContainer inside a team, TeamCard — asks this, so a third sport
/// gets its palette by adding a CSS block and a case here.
export function sportTheme(sport: Sport): "basketball" | undefined {
  return sport === "BASKETBALL" ? "basketball" : undefined;
}
