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
import { getRoster } from "@/lib/roster";
import { sortRoster } from "@/lib/roster-rules";

import { addPlayerAction } from "./actions";

export const metadata = {
  title: "Roster — Youth Baseball Team Manager",
};

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-name": "Player name is required.",
  "invalid-dob": "Enter a valid date, or leave it blank.",
  "invalid-jersey": "Jersey number must be a whole number between 0 and 99.",
  "jersey-taken": "That jersey number is already in use on this team.",
  "already-rostered": "That player is already on this team's roster.",
  "email-failed": "The player was added, but a notice email could not be sent.",
  access: "You no longer have access to make this change.",
};

/// Calls requireTeamAccess itself, independent of the layout — every page
/// under /t/[teamId] does, since layouts don't re-run on client navigation.
export default async function RosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ error?: string; added?: string }>;
}) {
  const { teamId } = await params;
  const { error, added } = await searchParams;

  let role;
  try {
    ({ role } = await requireTeamAccess(teamId, { intent: "read" }));
  } catch (caught) {
    if (caught instanceof TeamAccessError) {
      notFound();
    }
    throw caught;
  }

  const roster = sortRoster(await getRoster(teamId));
  const canEdit = role !== "PARENT";
  const isOwner = role === "OWNER";
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? "Something went wrong.") : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-xl font-semibold text-foreground">Roster</h3>
        {isOwner ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/t/${teamId}/roster/returning`}>Add returning player</Link>
          </Button>
        ) : null}
      </div>

      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {added && !errorMessage ? (
        <p role="status" className="text-sm text-muted-foreground">
          Player added.
        </p>
      ) : null}

      {roster.length === 0 ? (
        <p className="text-sm text-muted-foreground">No players yet.</p>
      ) : (
        <ul className="space-y-2">
          {roster.map((entry) => (
            <li key={entry.id}>
              <Card>
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
                      {entry.jerseyNumber ?? "—"}
                    </span>
                    <span className="font-medium text-foreground">
                      {entry.player.name}
                    </span>
                  </div>
                  {canEdit ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/t/${teamId}/roster/${entry.id}`}>Edit</Link>
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Add a player</CardTitle>
            <CardDescription>
              Only name is required — jersey number can be added later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={addPlayerAction} className="space-y-4">
              <input type="hidden" name="teamId" value={teamId} />

              <div className="space-y-2">
                <label htmlFor="name" className="block text-sm font-medium text-foreground">
                  Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="dateOfBirth" className="block text-sm font-medium text-foreground">
                  Date of birth (optional)
                </label>
                <input
                  id="dateOfBirth"
                  name="dateOfBirth"
                  type="date"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="jerseyNumber" className="block text-sm font-medium text-foreground">
                  Jersey number (optional)
                </label>
                <input
                  id="jerseyNumber"
                  name="jerseyNumber"
                  type="number"
                  min={0}
                  max={99}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <Button type="submit" className="w-full">
                Add player
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
