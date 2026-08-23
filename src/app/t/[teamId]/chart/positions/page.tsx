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
import { messageFor, messageTable } from "@/lib/error-messages";
import { getChart } from "@/lib/roster";
import { sortRoster } from "@/lib/roster-rules";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getTeamById } from "@/lib/teams";

import { PositionsEditor } from "./PositionsEditor";
import { ClearDraftStash, DraftStash } from "../DraftStash";
import { EditorTabs } from "../EditorTabs";

export const metadata = {
  title: "Edit lineup: positions — Youth Baseball Team Manager",
};

const ERROR_MESSAGES = messageTable({
  "invalid-positions":
    "That diamond couldn't be read. Reload and try again.",
  "unknown-entry":
    "The roster changed while you were editing. Reload and try again.",
  "duplicate-entry": "A player appeared twice. Reload and try again.",
  // Only reachable when allPlay was switched on mid-edit: the outfield stops
  // being three named spots and becomes one zone.
  "invalid-position":
    "The team's settings changed while you were editing. Reload and try again.",
  "roster-changed":
    "The roster changed while you were editing — nothing was saved. Reload and try again.",
  "position-conflict":
    "The positions couldn't be saved. Reload and try again.",
  // Another coach saved a different diamond while this page sat open. Saving
  // would have replaced theirs wholesale, so nothing was written.
  //
  // Doesn't say "reload": the action redirected here, this loader just re-ran,
  // and the board rendered below is already theirs. The coach's own edits are
  // gone with the draft, so the useful instruction is to redo them.
  "chart-changed":
    "Another coach changed the positions while you were editing — nothing was saved. The diamond below is theirs; make your changes again on top of it.",
  access: "You no longer have access to make this change.",
});

/// The coach-only positions diamond (#11). Calls requireTeamAccess itself,
/// independent of the layout — every page under /t/[teamId] does, since
/// layouts don't re-run on client navigation. Parents keep /t/[teamId]/view;
/// nothing links here for them and minRole turns a pasted URL into a 404.
export default async function PositionsPage({
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
  if (!team) {
    notFound();
  }

  const chart = await getChart(teamId);
  // Jersey-then-name order (the roster page's order) decides how unplaced
  // players list in the zone; buildPositionsDraft keeps the order it's given.
  const entries = sortRoster(
    chart.map((entry) => ({
      entryId: entry.entryId,
      playerName: entry.playerName,
      jerseyNumber: entry.jerseyNumber,
      position: entry.position,
      player: { name: entry.playerName },
    })),
  ).map(({ entryId, playerName, jerseyNumber, position }) => ({
    entryId,
    playerName,
    jerseyNumber,
    position,
  }));

  const errorMessage = messageFor(ERROR_MESSAGES, error);

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <div className="space-y-3">
        <h3 className="text-xl font-semibold text-foreground">Edit lineup</h3>
        <EditorTabs teamId={teamId} active="positions" />
      </div>

      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {saved && !errorMessage ? (
        <p role="status" className="text-sm text-muted-foreground">
          Positions saved.
        </p>
      ) : null}

      {team.archivedAt !== null ? (
        <Card>
          <CardHeader>
            <CardTitle>This team is archived</CardTitle>
            <CardDescription>
              Archived teams are read-only — positions can&rsquo;t be changed.
              See them on the chart view.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href={`/t/${teamId}/view`}>Go to chart view</Link>
            </Button>
          </CardContent>
        </Card>
      ) : entries.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No players yet</CardTitle>
            <CardDescription>
              Add players to the roster first — the diamond is filled from it.
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
            {team.allPlay
              ? "Hold and drag a player onto a spot. Everyone not on the infield plays the outfield."
              : "Hold and drag a player onto a spot. Dropping onto a player swaps the two; anyone left over sits on the bench."}
          </p>
          <PositionsEditor
            // Remount whenever the server data changes (a save landed, an
            // error redirect reloaded fresh rows), so the draft never sits on
            // top of stale entries.
            key={JSON.stringify(entries)}
            teamId={teamId}
            allPlay={team.allPlay}
            entries={entries}
          />
          {/* The board this coach just lost, if another coach's save landed
              first. Read-only reference — see DraftStash. */}
          {/* A save landed, so whatever the submit stashed is provably stale. */}
          {saved ? <ClearDraftStash teamId={teamId} kind="positions" /> : null}
          {error === "chart-changed" ? (
            <DraftStash
              teamId={teamId}
              kind="positions"
              title="Your unsaved positions"
            />
          ) : null}
        </>
      )}
    </div>
  );
}
