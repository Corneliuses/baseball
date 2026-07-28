import { type Team } from "@/lib/teams";
import { TeamCard } from "./TeamCard";

interface TeamSelectorProps {
  teams: Team[];
  userTeamIds?: string[];
}

export function TeamSelector({ teams, userTeamIds = [] }: TeamSelectorProps) {
  if (teams.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold text-foreground mb-2">
          No teams available
        </h2>
        <p className="text-muted-foreground">
          Teams will appear here once they are created.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {userTeamIds.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4 text-foreground">My Teams</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams
              .filter((t) => userTeamIds.includes(t.id))
              .map((team) => (
                <TeamCard
                  key={team.id}
                  {...team}
                  isClickable={true}
                />
              ))}
          </div>
        </div>
      )}

      {teams.some((t) => !userTeamIds.includes(t.id)) && (
        <div>
          <h2 className="text-xl font-bold mb-4 text-foreground">All Teams</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams
              .filter((t) => !userTeamIds.includes(t.id))
              .map((team) => (
                <TeamCard
                  key={team.id}
                  {...team}
                  isClickable={false}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
