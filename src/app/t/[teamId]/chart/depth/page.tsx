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
import { APP_NAME } from "@/lib/app-name";
import { loadDeclinedEntryIds } from "@/lib/chart-declines";
import { byJerseyThenName } from "@/lib/chart-view";
import { messageFor, messageTable } from "@/lib/error-messages";
import { getDepthChart } from "@/lib/roster";
import { nextGame } from "@/lib/schedule";
import { hasDepthChart } from "@/lib/sport";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getTeamById } from "@/lib/teams";

import { ClearDraftStash, DraftStash } from "../DraftStash";
import { DepthChartEditor } from "./DepthChartEditor";

export const metadata = {
  title: `Edit lineup: depth chart — ${APP_NAME}`,
};

const ERROR_MESSAGES = messageTable({
  "invalid-depth": "That depth chart couldn't be read. Reload and try again.",
  "invalid-position": "That depth chart couldn't be read. Reload and try again.",
  "unknown-entry":
    "The roster changed while you were editing. Reload and try again.",
  "duplicate-entry": "A player appeared twice. Reload and try again.",
  "roster-changed":
    "The roster changed while you were editing — nothing was saved. Reload and try again.",
  "depth-conflict": "The depth chart couldn't be saved. Reload and try again.",
  // Doesn't say "reload": the loader just re-ran, so the board below is
  // already the other coach's.
  "chart-changed":
    "Another coach changed the depth chart while you were editing — nothing was saved. The court below is theirs; make your changes again on top of it.",
  access: "You no longer have access to make this change.",
});

/// The coach-only depth chart editor for a basketball team. Calls
/// requireTeamAccess itself, like every page under /t/[teamId]; parents read
/// the same chart on Game Day.
export default async function DepthChartPage({
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
  if (!team || !hasDepthChart(team.sport)) {
    notFound();
  }

  const [rows, game] = await Promise.all([getDepthChart(teamId), nextGame(teamId)]);
  // Jersey-then-name, the roster's order: it is where a kid the coach hasn't
  // placed yet sits on the bench, and the action rebuilds its baseline from
  // the same order.
  const sorted = [...rows].sort(byJerseyThenName);
  const entries = sorted.map(
    ({ entryId, playerName, jerseyNumber, courtPosition, benchOrder }) => ({
      entryId,
      playerName,
      jerseyNumber,
      courtPosition,
      benchOrder,
    }),
  );

  // Decoration only, exactly as on the baseball editors: it badges chips and
  // reaches nothing that decides the board.
  const declinedEntryIds =
    team.archivedAt === null && entries.length > 0
      ? await loadDeclinedEntryIds(teamId, sorted, game)
      : [];

  const errorMessage = messageFor(ERROR_MESSAGES, error);

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <h3 className="text-xl font-semibold text-foreground">Depth chart</h3>

      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {saved && !errorMessage ? (
        <p role="status" className="text-sm text-muted-foreground">
          Depth chart saved.
        </p>
      ) : null}

      {team.archivedAt !== null ? (
        <Card>
          <CardHeader>
            <CardTitle>This team is archived</CardTitle>
            <CardDescription>
              Archived teams are read-only — the depth chart can&rsquo;t be
              changed. See it on Game Day.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href={`/t/${teamId}/view`}>Go to Game Day</Link>
            </Button>
          </CardContent>
        </Card>
      ) : entries.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No players yet</CardTitle>
            <CardDescription>
              Add players to the roster first — the court is filled from it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href={`/t/${teamId}/roster`}>Go to roster</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Hold and drag a player onto a spot on the court to start them —
            dropping onto a starter swaps the two. The bench is in order: drag a
            player onto someone on the bench to take their place in line.
          </p>
          <DepthChartEditor
            // Remount whenever the server data changes, so the draft never
            // sits on top of stale entries.
            key={JSON.stringify(entries)}
            teamId={teamId}
            entries={entries}
            declinedEntryIds={declinedEntryIds}
          />
          {saved ? <ClearDraftStash teamId={teamId} kind="depth" /> : null}
          {error === "chart-changed" ? (
            <DraftStash
              teamId={teamId}
              kind="depth"
              title="Your unsaved depth chart"
            />
          ) : null}
        </>
      )}
    </div>
  );
}
