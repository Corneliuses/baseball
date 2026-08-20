import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getTeamById } from "@/lib/teams";

import { archiveTeamAction, unarchiveTeamAction, updateTeamAction } from "./actions";

export const metadata = {
  title: "Team settings — Youth Baseball Team Manager",
};

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-name": "Team name is required.",
  access: "You no longer have access to make this change.",
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

  const errorMessage = error ? (ERROR_MESSAGES[error] ?? "Something went wrong.") : null;
  const confirmingArchive = confirm === "archive" && !team.archivedAt;

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <Button asChild variant="outline" size="sm">
        <Link href={`/t/${teamId}/members`}>Members &amp; invitations</Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Team settings</CardTitle>
          <CardDescription>Name, season, and lineup settings.</CardDescription>
        </CardHeader>

        <CardContent>
          <form action={updateTeamAction} className="space-y-4">
            <input type="hidden" name="teamId" value={teamId} />

            <div className="space-y-2">
              <label htmlFor="name" className="block text-sm font-medium text-foreground">
                Team name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                defaultValue={team.name}
                aria-describedby={errorMessage ? "settings-error" : undefined}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="season" className="block text-sm font-medium text-foreground">
                Season
              </label>
              <input
                id="season"
                name="season"
                type="text"
                defaultValue={team.season ?? ""}
                placeholder="2026"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="allPlay"
                name="allPlay"
                type="checkbox"
                defaultChecked={team.allPlay}
                className="h-4 w-4 rounded border-border"
              />
              <label htmlFor="allPlay" className="text-sm text-foreground">
                Every kid bats and fields (all-play)
              </label>
            </div>

            {errorMessage ? (
              <p id="settings-error" role="alert" className="text-sm text-destructive">
                {errorMessage}
              </p>
            ) : null}

            {saved && !errorMessage ? (
              <p role="status" className="text-sm text-muted-foreground">
                Saved.
              </p>
            ) : null}

            <Button type="submit" className="w-full">
              Save changes
            </Button>
          </form>
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
              <Button type="submit">Unarchive team</Button>
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
                  <Button type="submit" variant="destructive">
                    Yes, archive it
                  </Button>
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
