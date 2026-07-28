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

  const activeTeams = teams.filter((t) => !t.archivedAt);
  const archivedTeams = teams.filter((t) => t.archivedAt);

  return (
    <div className="space-y-8">
      {userTeamIds.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4 text-foreground">My Teams</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeTeams
              .filter((t) => userTeamIds.includes(t.id))
              .map((team) => (
                <TeamCard key={team.id} {...team} isClickable={true} />
              ))}
          </div>
        </div>
      )}

      {activeTeams.some((t) => !userTeamIds.includes(t.id)) && (
        <div>
          <h2 className="text-xl font-bold mb-4 text-foreground">All Teams</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeTeams
              .filter((t) => !userTeamIds.includes(t.id))
              .map((team) => (
                <TeamCard key={team.id} {...team} isClickable={false} />
              ))}
          </div>
        </div>
      )}

      {archivedTeams.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4 text-foreground">Archived Teams</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {archivedTeams.map((team) => (
              <TeamCard
                key={team.id}
                {...team}
                isClickable={userTeamIds.includes(team.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
