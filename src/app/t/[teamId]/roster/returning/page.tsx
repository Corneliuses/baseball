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
import { messageFor, messageTable } from "@/lib/error-messages";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { listReturningCandidates } from "@/lib/roster";
import { sortReturningCandidates } from "@/lib/returning-players";

import { CheckCircleIcon } from "@/components/icons";
import { getRoster } from "@/lib/roster";

import { addReturningPlayerAction } from "./actions";

export const metadata = {
  title: "Add returning player — Youth Baseball Team Manager",
};

const ERROR_MESSAGES = messageTable({
  "invalid-jersey": "Jersey number must be a whole number between 0 and 99.",
  "jersey-taken": "That jersey number is already in use on this team.",
  "already-rostered": "That player is already on this team's roster.",
  "not-a-candidate": "That player is no longer available to add.",
  // The roster spot and the memberships have already committed by the time a
  // notice can fail, so this is a warning about an email, not about the add.
  "email-failed":
    "Added — but a notice email to their guardians could not be sent.",
  access: "You no longer have access to make this change.",
});

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
  searchParams: Promise<{ error?: string; q?: string; added?: string }>;
}) {
  const { teamId } = await params;
  const { error, q, added } = await searchParams;

  try {
    await requireTeamAccess(teamId, { intent: "read", minRole: "OWNER" });
  } catch (caught) {
    if (caught instanceof TeamAccessError) {
      notFound();
    }
    throw caught;
  }

  const allCandidates = sortReturningCandidates(await listReturningCandidates(teamId));

  // The player just added is, by then, on the roster — so they are gone from
  // the candidate list this page renders. Their name comes from the roster
  // instead, team-scoped like every other read here, so the row they acted on
  // can still be shown flipping to "Added" rather than simply vanishing.
  const justAdded = added
    ? ((await getRoster(teamId)).find((entry) => entry.player.id === added) ?? null)
    : null;
  const filter = q?.trim().toLowerCase() ?? "";
  const candidates = filter
    ? allCandidates.filter((candidate) => candidate.name.toLowerCase().includes(filter))
    : allCandidates;

  const errorMessage = messageFor(ERROR_MESSAGES, error);

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
      ) : null}

      {justAdded ? (
        // The row that was just acted on, flipped in place — the owner stays
        // in the list they were working down instead of being sent to the
        // roster and having to navigate back for the next player (C7).
        <Card className="border-primary/40 bg-primary/5 animate-rise">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircleIcon className="size-4 shrink-0 text-primary" />
              {justAdded.player.name}
            </CardTitle>
            <CardDescription>
              Added to the roster
              {justAdded.jerseyNumber !== null
                ? ` as #${justAdded.jerseyNumber}`
                : ""}
              . Keep going — the list below is where you left it.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {candidates.length > 0 ? (
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
                    {/* The filter the owner narrowed the list with, so the
                        add returns them to the same three names rather than
                        to all forty. */}
                    <input type="hidden" name="q" value={q ?? ""} />
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
                    <SubmitButton variant="outline" pendingLabel="Adding…">
                      Add to roster
                    </SubmitButton>
                  </form>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
