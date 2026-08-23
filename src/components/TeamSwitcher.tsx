"use client";

import { useRouter } from "next/navigation";
import type { Team } from "@/lib/teams";

interface TeamSwitcherProps {
  teams: Team[];
  currentTeamId: string;
}

/// Lets a caller jump between teams from inside `/t/[teamId]` chrome, rather
/// than only from the `/` switcher. `teams` is whatever the layout already
/// resolved (every team for the owner, the caller's own memberships
/// otherwise) — this component renders, it does not query.
export function TeamSwitcher({ teams, currentTeamId }: TeamSwitcherProps) {
  const router = useRouter();

  if (teams.length <= 1) {
    return null;
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Team</span>
      <select
        value={currentTeamId}
        onChange={(event) => router.push(`/t/${event.target.value}`)}
        className="rounded-md border border-border bg-background px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {/* The season is what tells two same-named teams apart, and this app
            is built around coaching the same club across seasons — "Sharks"
            and "Sharks" in a dropdown is a coin flip, on a control whose whole
            job is picking the right one. `TEAM_SELECT` has always carried
            `season`; the switcher simply never printed it. The landing page's
            TeamCard already does. */}
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
            {team.season ? ` · ${team.season}` : ""}
            {team.archivedAt ? " (Archived)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
