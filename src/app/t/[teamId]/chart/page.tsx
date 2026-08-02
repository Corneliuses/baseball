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
import { getChart } from "@/lib/roster";
import { sortRoster } from "@/lib/roster-rules";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getTeamById } from "@/lib/teams";

import { BattingOrderEditor } from "./BattingOrderEditor";

export const metadata = {
  title: "Batting order — Youth Baseball Team Manager",
};

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-order": "That order couldn't be read. Reload and try again.",
  "unknown-entry":
    "The roster changed while you were editing. Reload and try again.",
  "duplicate-entry": "A player appeared twice. Reload and try again.",
  // Fires both when allPlay is toggled off (12 slots become 9) and when the
  // roster shrinks under an allPlay team, so it can't blame settings alone.
  "too-many-slots":
    "The roster or team settings changed while you were editing. Reload and try again.",
  "missing-players":
    "Every player needs a batting slot on this team. Reload and try again.",
  "roster-changed":
    "The roster changed while you were editing — nothing was saved. Reload and try again.",
  "order-conflict": "The order couldn't be saved. Reload and try again.",
  // Another coach saved a different order while this page sat open. Saving
  // would have replaced theirs wholesale, so nothing was written.
  //
  // Doesn't say "reload": the action redirected here, this loader just re-ran,
  // and the order rendered below is already theirs. The coach's own edits are
  // gone with the draft, so the useful instruction is to redo them.
  "chart-changed":
    "Another coach changed the batting order while you were editing — nothing was saved. The order below is theirs; make your changes again on top of it.",
  access: "You no longer have access to make this change.",
};

/// The coach-only batting order editor (#10). Calls requireTeamAccess itself,
/// independent of the layout — every page under /t/[teamId] does, since
/// layouts don't re-run on client navigation. Parents keep /t/[teamId]/view;
/// nothing links here for them and minRole turns a pasted URL into a 404.
export default async function ChartPage({
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
  // Jersey-then-name order (the roster page's order) decides how unassigned
  // players list in the pool and how never-ordered players fill allPlay
  // slots; buildBattingDraft keeps this order for everyone without a
  // battingOrder of their own.
  const entries = sortRoster(
    chart.map((entry) => ({
      entryId: entry.entryId,
      playerName: entry.playerName,
      jerseyNumber: entry.jerseyNumber,
      battingOrder: entry.battingOrder,
      player: { name: entry.playerName },
    })),
  ).map(({ entryId, playerName, jerseyNumber, battingOrder }) => ({
    entryId,
    playerName,
    jerseyNumber,
    battingOrder,
  }));

  const errorMessage = error
    ? (ERROR_MESSAGES[error] ?? "Something went wrong.")
    : null;

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-xl font-semibold text-foreground">Batting order</h3>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/t/${teamId}/chart/positions`}>Positions</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/t/${teamId}/view`}>View chart</Link>
          </Button>
        </div>
      </div>

      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {saved && !errorMessage ? (
        <p role="status" className="text-sm text-muted-foreground">
          Order saved.
        </p>
      ) : null}

      {team.archivedAt !== null ? (
        <Card>
          <CardHeader>
            <CardTitle>This team is archived</CardTitle>
            <CardDescription>
              Archived teams are read-only — the batting order can&rsquo;t be
              changed. See it on the chart view.
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
              Add players to the roster first — the batting order is built
              from it.
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
              ? "Everyone bats — hold and drag to reorder. Dropping onto a player swaps the two."
              : "Nine slots — hold and drag to reorder. Dropping onto a player swaps the two; drag someone below the line to take them out."}
          </p>
          <BattingOrderEditor
            // Remount whenever the server data changes (a save landed, an
            // error redirect reloaded fresh rows), so the draft never sits on
            // top of stale entries.
            key={JSON.stringify(entries)}
            teamId={teamId}
            allPlay={team.allPlay}
            entries={entries}
          />
        </>
      )}
    </div>
  );
}
