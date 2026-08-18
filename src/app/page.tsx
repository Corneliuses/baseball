import Link from "next/link";

import { PageContainer } from "@/components/layout/PageContainer";
import { TeamSelector } from "@/components/TeamSelector";
import { Button } from "@/components/ui/button";
import { isOwnerEmail } from "@/lib/owner";
import { getCurrentUser } from "@/lib/session";
import { getAllTeams, getMemberTeams } from "@/lib/teams";

/// Signed-out visitors see no team data at all — no query even runs. The
/// previous version of this page (#1) called getPublicTeams() unconditionally,
/// showing every team's name and season to anyone; that directly contradicted
/// this issue's requirement that non-owners see only teams they belong to.
/// See design-doc.md #3 Decision 1.
export default async function Home() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <PageContainer>
        <div className="space-y-6 py-12 text-center">
          <div>
            <h2 className="font-display text-3xl text-foreground mb-2">
              Welcome to Youth Baseball Team Manager
            </h2>
            <p className="text-lg text-muted-foreground">
              Sign in to see your team&apos;s roster, schedule, and lineup.
            </p>
          </div>
          <Button asChild>
            <Link href="/signin">Sign in</Link>
          </Button>
        </div>
      </PageContainer>
    );
  }

  const owner = isOwnerEmail(user.email, process.env.OWNER_EMAIL);
  const memberTeams = await getMemberTeams(user.id);
  const teams = owner ? await getAllTeams() : memberTeams;
  const userTeamIds = memberTeams.map((team) => team.id);

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl text-foreground mb-2">
              {user.name ? `Welcome back, ${user.name}` : "Welcome back"}
            </h2>
            <p className="text-lg text-muted-foreground">
              Your teams are below.
            </p>
          </div>
          {owner && (
            <Button asChild>
              <Link href="/t/new">Create a team</Link>
            </Button>
          )}
        </div>

        <TeamSelector teams={teams} userTeamIds={userTeamIds} />
      </div>
    </PageContainer>
  );
}
