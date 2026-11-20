import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusBanner } from "@/components/StatusBanner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APP_NAME } from "@/lib/app-name";
import { messageFor, messageTable } from "@/lib/error-messages";
import { MAX_TEAM_SKILLS, SKILL_LIBRARY, resolveSkills } from "@/lib/skills";
import { hasSkills } from "@/lib/sport";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getTeamById, getTeamSkills } from "@/lib/teams";

import { SkillsPicker } from "./SkillsPicker";

export const metadata = {
  title: `Edit skills — ${APP_NAME}`,
};

const ERROR_MESSAGES = messageTable({
  "invalid-skills": "That list of skills couldn't be read. Reload and try again.",
  "unknown-skill": "One of those skills isn't in the library any more. Reload and try again.",
  "duplicate-skill": "A skill appeared twice. Reload and try again.",
  "too-many-skills": `A team gets up to ${MAX_TEAM_SKILLS} skills — untick one and save again.`,
  // Doesn't say "reload": the page just re-ran, so the ticks below are
  // already the other coach's.
  "skills-changed":
    "Another coach changed the skills while you were choosing — nothing was saved. The ticks below are theirs; make your changes again on top of them.",
  access: "You no longer have access to make this change.",
});

/// The coach's skills picker for a basketball team: tick up to five at-home
/// skills from the library. Coach+, and 404 for any sport without them.
export default async function EditSkillsPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { teamId } = await params;
  const { error, saved } = await searchParams;

  try {
    await requireTeamAccess(teamId, { intent: "read", minRole: "COACH" });
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

  // The baseline is the stored column exactly as read, so the action's
  // fresh read compares equal on an untouched list; the ticks are the
  // skills that still resolve.
  const stored = await getTeamSkills(teamId);
  const chosen = resolveSkills(stored).map((skill) => skill.id);
  const errorMessage = messageFor(ERROR_MESSAGES, error);

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <h3 className="text-xl font-semibold text-foreground">Choose skills</h3>

      {errorMessage ? <StatusBanner tone="error">{errorMessage}</StatusBanner> : null}
      {saved && !errorMessage ? (
        <StatusBanner tone="success">
          Skills saved. The team sees them on the Skills tab.
        </StatusBanner>
      ) : null}

      {team.archivedAt !== null ? (
        <Card>
          <CardHeader>
            <CardTitle>This team is archived</CardTitle>
            <CardDescription>
              Archived teams are read-only — the skills can&rsquo;t be changed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href={`/t/${teamId}/skills`}>Go to the skills</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Tick up to {MAX_TEAM_SKILLS} skills for kids to practice at home —
            none of them need a hoop. Families see each one by name with an
            animation of how it&rsquo;s done.
          </p>
          <SkillsPicker
            // Remount whenever the stored list changes, so after a
            // `skills-changed` refusal the ticks really are the other
            // coach's — the same reason the chart editors key on their data.
            key={JSON.stringify(stored)}
            teamId={teamId}
            library={SKILL_LIBRARY}
            chosen={chosen}
            baseline={stored}
          />
        </>
      )}
    </div>
  );
}
