import { PageContainer } from "@/components/layout/PageContainer";
import { TeamSelector } from "@/components/TeamSelector";
import { getPublicTeams } from "@/lib/teams";

export default async function Home() {
  const teams = await getPublicTeams();

  return (
    <PageContainer>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground mb-2">
            Welcome to Youth Baseball Team Manager
          </h2>
          <p className="text-lg text-muted-foreground">
            Browse and manage youth baseball teams. Sign in to access your teams
            and update rosters and schedules.
          </p>
        </div>

        <TeamSelector teams={teams} />
      </div>
    </PageContainer>
  );
}
