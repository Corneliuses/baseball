import Link from "next/link";
import { notFound } from "next/navigation";

import { PlayAnimation } from "@/components/PlayAnimation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APP_NAME } from "@/lib/app-name";
import { resolvePlaybook } from "@/lib/plays";
import { hasPlaybook } from "@/lib/sport";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getTeamById, getTeamPlaybook } from "@/lib/teams";

export const metadata = {
  title: `Playbook — ${APP_NAME}`,
};

/// The team's playbook, for every member: each play the coach chose, by
/// name, with an animation of it running. Basketball only — a baseball team
/// 404s here, the same way the chart routes treat a sport without a chart.
export default async function PlaybookPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;

  let role;
  try {
    ({ role } = await requireTeamAccess(teamId, { intent: "read" }));
  } catch (caught) {
    if (caught instanceof TeamAccessError) {
      notFound();
    }
    throw caught;
  }

  const team = await getTeamById(teamId);
  if (!team || !hasPlaybook(team.sport)) {
    notFound();
  }

  const plays = resolvePlaybook(await getTeamPlaybook(teamId));
  const canEdit = role !== "PARENT" && team.archivedAt === null;

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-semibold text-foreground">Playbook</h3>
        {canEdit ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/t/${teamId}/playbook/edit`}>Choose plays</Link>
          </Button>
        ) : null}
      </div>

      {plays.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No plays yet</CardTitle>
            <CardDescription>
              {canEdit
                ? "Pick up to five plays from the library and they'll show up here for the whole team."
                : "The coach hasn't picked the team's plays yet. Check back soon."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            The plays we run. Each one plays on a loop — numbers are players 1
            through 5, and the orange dot is the ball. Tap Pause to stop, or
            Back and Next to go step by step.
          </p>
          <ol className="space-y-6">
            {plays.map((play) => (
              <li key={play.id}>
                <Card>
                  <CardHeader>
                    <CardTitle>{play.name}</CardTitle>
                    <CardDescription>{play.summary}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PlayAnimation play={play} />
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
