import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/SubmitButton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getTeamById } from "@/lib/teams";

import { archiveTeamAction, unarchiveTeamAction } from "./actions";
import { TeamDetailsForm } from "./TeamDetailsForm";

export const metadata = {
  title: "Team settings — Youth Baseball Team Manager",
};

/// Viewing this page requires OWNER, but the intent is "read" — an archived
/// team must still let its owner reach this page to unarchive it. The
/// individual actions in ./actions.ts choose "read" vs "write" per operation.
export default async function TeamSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ error?: string; saved?: string; confirm?: string }>;
}) {
  const { teamId } = await params;
  const { error, saved, confirm } = await searchParams;

  try {
    await requireTeamAccess(teamId, { intent: "read", minRole: "OWNER" });
  } catch (caught) {
    if (caught instanceof TeamAccessError) {
      notFound();
    }
    throw caught;
  }

  const team = await getTeamById(teamId);
  if (!team) {
    notFound();
  }

  const confirmingArchive = confirm === "archive" && !team.archivedAt;

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <Button asChild variant="outline" size="sm">
        <Link href={`/t/${teamId}/members`}>Members &amp; invitations</Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Team settings</CardTitle>
          <CardDescription>
            Name, season, team chat, and lineup settings.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {/* A client form on `useActionState`, not a bare
              `<form action={...}>`: this is a form people type into, so a
              rejected value comes back as state with everything they typed
              intact. See AGENTS.md and ./actions.ts. */}
          <TeamDetailsForm
            teamId={teamId}
            name={team.name}
            season={team.season ?? ""}
            allPlay={team.allPlay}
            groupMeUrl={team.groupMeUrl ?? ""}
            saved={Boolean(saved)}
            redirectErrorCode={error}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {team.archivedAt ? "Archived" : "Archive this team"}
          </CardTitle>
          <CardDescription>
            {team.archivedAt
              ? "This team is read-only. Unarchive it to make changes again."
              : "An archived team stays visible but becomes read-only for everyone, owner included."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Archiving locks out every write for every role, so it confirms
              like event deletion does. Unarchiving undoes exactly that and
              needs no ceremony. */}
          {team.archivedAt ? (
            <form action={unarchiveTeamAction}>
              <input type="hidden" name="teamId" value={teamId} />
              <SubmitButton pendingLabel="Unarchiving…">Unarchive team</SubmitButton>
            </form>
          ) : confirmingArchive ? (
            <div className="space-y-3">
              <p role="alert" className="text-sm text-destructive">
                Archive this team? It becomes read-only for everyone — you
                included — until it&rsquo;s unarchived.
              </p>
              <div className="flex gap-2">
                <form action={archiveTeamAction}>
                  <input type="hidden" name="teamId" value={teamId} />
                  <SubmitButton variant="destructive" pendingLabel="Archiving…">
                    Yes, archive it
                  </SubmitButton>
                </form>
                <Button asChild variant="outline">
                  <Link href={`/t/${teamId}/settings`}>Cancel</Link>
                </Button>
              </div>
            </div>
          ) : (
            <Button asChild variant="destructive">
              <Link href={`/t/${teamId}/settings?confirm=archive`}>
                Archive team
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
