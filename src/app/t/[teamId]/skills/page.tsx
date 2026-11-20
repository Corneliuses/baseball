import Link from "next/link";
import { notFound } from "next/navigation";

import { SkillAnimation } from "@/components/SkillAnimation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APP_NAME } from "@/lib/app-name";
import { resolveSkills } from "@/lib/skills";
import { hasSkills } from "@/lib/sport";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getTeamById, getTeamSkills } from "@/lib/teams";

export const metadata = {
  title: `Skills — ${APP_NAME}`,
};

/// The team's at-home skills, for every member: each drill the coach chose,
/// by name, with what it takes and an animation of it. Basketball only — a
/// baseball team 404s here, like the playbook.
export default async function SkillsPage({
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
  if (!team || !hasSkills(team.sport)) {
    notFound();
  }

  const skills = resolveSkills(await getTeamSkills(teamId));
  const canEdit = role !== "PARENT" && team.archivedAt === null;

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-semibold text-foreground">Skills</h3>
        {canEdit ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/t/${teamId}/skills/edit`}>Choose skills</Link>
          </Button>
        ) : null}
      </div>

      {skills.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No skills yet</CardTitle>
            <CardDescription>
              {canEdit
                ? "Pick up to five at-home skills from the library and they'll show up here for the whole team."
                : "The coach hasn't picked the team's skills yet. Check back soon."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Skills to practice at home — no hoop needed. Each one plays on a
            loop, seen from above: that&rsquo;s your player in the middle, and
            the orange dot is the ball. Tap Pause to stop, or Back and Next to
            go step by step.
          </p>
          <ol className="space-y-6">
            {skills.map((skill) => (
              <li key={skill.id}>
                <Card>
                  <CardHeader>
                    <CardTitle>{skill.name}</CardTitle>
                    <CardDescription>{skill.summary}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-foreground">
                      <span className="font-semibold">You need:</span>{" "}
                      {skill.equipment}
                    </p>
                    <SkillAnimation skill={skill} />
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
