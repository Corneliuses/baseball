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
import { listReturningCandidates } from "@/lib/roster";
import { sortReturningCandidates } from "@/lib/returning-players";

import { addReturningPlayerAction } from "./actions";

export const metadata = {
  title: "Add returning player — Youth Baseball Team Manager",
};

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-jersey": "Jersey number must be a whole number between 0 and 99.",
  "jersey-taken": "That jersey number is already in use on this team.",
  "already-rostered": "That player is already on this team's roster.",
  "not-a-candidate": "That player is no longer available to add.",
  access: "You no longer have access to make this change.",
};

function teamLabel(team: { name: string; season: string | null; archivedAt: Date | null }) {
  const season = team.season ? ` (${team.season})` : "";
  const archived = team.archivedAt ? " — archived" : "";
  return `${team.name}${season}${archived}`;
}

/// Owner-only, both to view and to write — this is the one global Player
/// read in the app (Decision 13), and picking a returning player grants
/// access to guardians who never asked to be on this team.
export default async function ReturningPlayersPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ error?: string; q?: string }>;
}) {
  const { teamId } = await params;
  const { error, q } = await searchParams;

  try {
    await requireTeamAccess(teamId, { intent: "read", minRole: "OWNER" });
  } catch (caught) {
    if (caught instanceof TeamAccessError) {
      notFound();
    }
    throw caught;
  }

  const allCandidates = sortReturningCandidates(await listReturningCandidates(teamId));
  const filter = q?.trim().toLowerCase() ?? "";
  const candidates = filter
    ? allCandidates.filter((candidate) => candidate.name.toLowerCase().includes(filter))
    : allCandidates;

  const errorMessage = error ? (ERROR_MESSAGES[error] ?? "Something went wrong.") : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-xl font-semibold text-foreground">Add returning player</h3>
        <Button asChild variant="outline" size="sm">
          <Link href={`/t/${teamId}/roster`}>Back to roster</Link>
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Picking a player from another team adds them to this roster and gives their
        guardians access to this team as parents. Guardians who already have access keep
        their existing role.
      </p>

      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      <form method="get" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Filter by name"
          aria-label="Filter by name"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {allCandidates.length === 0
            ? "No past players are available to add."
            : "No players match that filter."}
        </p>
      ) : (
        <ul className="space-y-2">
          {candidates.map((candidate) => (
            <li key={candidate.playerId}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{candidate.name}</CardTitle>
                  <CardDescription>
                    {candidate.teams.map(teamLabel).join(", ")} ·{" "}
                    {candidate.guardianCount === 1
                      ? "1 guardian"
                      : `${candidate.guardianCount} guardians`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    action={addReturningPlayerAction}
                    className="flex items-end gap-2"
                  >
                    <input type="hidden" name="teamId" value={teamId} />
                    <input type="hidden" name="playerId" value={candidate.playerId} />
                    <div className="space-y-1">
                      <label
                        htmlFor={`jersey-${candidate.playerId}`}
                        className="block text-xs font-medium text-foreground"
                      >
                        Jersey number
                      </label>
                      <input
                        id={`jersey-${candidate.playerId}`}
                        name="jerseyNumber"
                        type="number"
                        min={0}
                        max={99}
                        className="w-24 rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <Button type="submit" variant="outline">
                      Add to roster
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
