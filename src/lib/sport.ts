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

/// Whether a team of this sport has basketball's depth chart: a ranked list per
/// court position, drawn on a half court (src/lib/depth-chart.ts). The
/// counterpart of `hasLineupChart`, and never true for the same sport — the
/// two charts write different columns and each surface asks for the one it
/// draws.
export function hasDepthChart(sport: Sport): boolean {
  return sport === "BASKETBALL";
}

/// Whether the team has any standing chart at all, which is what the Game Day
/// and Edit Lineup tabs need. Readiness is still baseball's alone.
export function hasAnyChart(sport: Sport): boolean {
  return hasLineupChart(sport) || hasDepthChart(sport);
}
