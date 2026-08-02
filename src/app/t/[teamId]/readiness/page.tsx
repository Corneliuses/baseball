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
import { RSVP_STYLE } from "@/components/rsvp-style";
import { formatEventDateTime } from "@/lib/calendar";
import { POSITION_LABELS } from "@/lib/positions";
import { computeReadiness, type Readiness } from "@/lib/readiness";
import { getChart } from "@/lib/roster";
import type { ChartViewEntry } from "@/lib/chart-view";
import { buildRsvpStateMap } from "@/lib/rsvp";
import { listEventRsvps } from "@/lib/rsvps";
import { nextGame } from "@/lib/schedule";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getTeamById } from "@/lib/teams";

export const metadata = {
  title: "Next-game readiness — Youth Baseball Team Manager",
};

/// The coach-facing readiness panel (#12) — the one place attendance meets the
/// chart, for the team's **next game only**.
///
/// Strictly read-only, and deliberately so: it reports what is broken and links
/// to the editors that fix it. There is no write path here and none may be
/// added. A patch made from those editors is a normal chart edit and therefore
/// permanent, exactly like any other — this page must never grow its own
/// special-cased "fix it for this game" action, which is how per-game lineup
/// rows creep back in (Decision 16).
///
/// Coach-only, matching both chart editors: parents keep /t/[teamId]/view, and
/// nothing here is a parent's decision to make. Intent is "read", so a coach on
/// an archived team can still look at last season's chart.

function ordinal(n: number): string {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  const ones = n % 10;
  if (ones === 1) return `${n}st`;
  if (ones === 2) return `${n}nd`;
  if (ones === 3) return `${n}rd`;
  return `${n}th`;
}

/// Where this player sits in the chart, so a name in the list carries enough
/// context to act on without cross-referencing the editor.
function chartRole(entry: ChartViewEntry): string {
  const parts: string[] = [];
  if (entry.battingOrder !== null) parts.push(`Bats ${ordinal(entry.battingOrder)}`);
  if (entry.position !== null) parts.push(POSITION_LABELS[entry.position]);
  return parts.join(" · ");
}

function PlayerList({
  entries,
  tagClassName,
}: {
  entries: ChartViewEntry[];
  tagClassName: string;
}) {
  return (
    <ul className="space-y-2">
      {entries.map((entry) => (
        <li
          key={entry.playerId}
          className="flex items-center justify-between gap-4 rounded-md border border-border p-3"
        >
          <span className="text-sm font-medium text-foreground">
            {entry.playerName}
            {entry.jerseyNumber !== null ? ` #${entry.jerseyNumber}` : ""}
          </span>
          <span className={`text-xs ${tagClassName}`}>{chartRole(entry)}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function ReadinessPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;

  try {
    await requireTeamAccess(teamId, { intent: "read", minRole: "COACH" });
  } catch (caught) {
    if (caught instanceof TeamAccessError) {
      notFound();
    }
    throw caught;
  }

  // Deliberately NOT wrapped in try/catch — nextGame's contract is that a
  // database outage propagates rather than rendering the same "no upcoming
  // game" empty state a healthy team would show on a bye week. The same
  // argument covers getChart and listEventRsvps below: after this issue, "every
  // family is silent" is a calm, plausible-looking screen, so a swallowed
  // outage would quietly assert a clean bill of health.
  const game = await nextGame(teamId);

  if (!game) {
    return (
      <div className="mx-auto w-full max-w-md space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>No upcoming game</CardTitle>
            <CardDescription>
              Readiness shows up here once a game is on the schedule. Practices
              don&rsquo;t have a chart, so they aren&rsquo;t checked.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href={`/t/${teamId}/schedule`}>Go to schedule</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [team, chartEntries, rsvpRows] = await Promise.all([
    // Needed for allPlay alone: it decides which spots this team actually
    // fields, and a stale row at one it doesn't must not be reported as an
    // uncovered position. A null return means the team was deleted between
    // requireTeamAccess and here, so fall back to the column's own default.
    getTeamById(teamId),
    getChart(teamId),
    listEventRsvps(teamId, game.id),
  ]);

  const rsvpStates = buildRsvpStateMap(
    chartEntries.map((entry) => entry.playerId),
    rsvpRows,
  );
  const readiness: Readiness<ChartViewEntry> = computeReadiness(
    chartEntries,
    rsvpStates,
    team?.allPlay ?? true,
  );

  const hasChart = chartEntries.some(
    (entry) => entry.battingOrder !== null || entry.position !== null,
  );

  const heading = game.opponent ? `Next game vs ${game.opponent}` : "Next game";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-xl font-semibold text-foreground">Readiness</h3>
        <Button asChild variant="outline" size="sm">
          <Link href={`/t/${teamId}/view`}>View chart</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{heading}</CardTitle>
          <CardDescription>{formatEventDateTime(game.startsAt)}</CardDescription>
        </CardHeader>
        {game.location ? (
          <CardContent>
            <p className="text-sm text-foreground">{game.location}</p>
          </CardContent>
        ) : null}
      </Card>

      {!hasChart ? (
        <Card>
          <CardHeader>
            <CardTitle>No chart set yet</CardTitle>
            <CardDescription>
              Set the batting order and positions and this page will check them
              against who&rsquo;s coming.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/t/${teamId}/chart`}>Batting order</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/t/${teamId}/chart/positions`}>Positions</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                {readiness.ready ? "Ready for game day" : "Needs attention"}
              </CardTitle>
              <CardDescription>
                {readiness.ready
                  ? "Nobody in the chart has said they can't make it."
                  : `${readiness.declined.length} ${
                      readiness.declined.length === 1 ? "player is" : "players are"
                    } out.`}
                {readiness.awaiting.length > 0
                  ? ` ${readiness.awaiting.length} still to answer — that doesn't hold up the lineup.`
                  : ""}
              </CardDescription>
            </CardHeader>
          </Card>

          {readiness.declined.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Out</CardTitle>
                <CardDescription>
                  These families said they can&rsquo;t make this game.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PlayerList
                  entries={readiness.declined}
                  tagClassName={RSVP_STYLE.declined.tagClassName}
                />
              </CardContent>
            </Card>
          ) : null}

          {readiness.uncoveredPositions.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Positions uncovered</CardTitle>
                <CardDescription>
                  Nobody is on the chart for these spots once the players above
                  are out. Changing the chart here is permanent — it becomes the
                  standing chart, not a one-game patch.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="flex flex-wrap gap-2">
                  {readiness.uncoveredPositions.map((position) => (
                    <li
                      key={position}
                      className="rounded-md border border-destructive px-3 py-1 text-sm font-medium text-destructive"
                    >
                      {POSITION_LABELS[position]}
                    </li>
                  ))}
                </ul>
                <Button asChild variant="outline">
                  <Link href={`/t/${teamId}/chart/positions`}>Edit positions</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {RSVP_STYLE["no-response"].label}
              </CardTitle>
              <CardDescription>
                {readiness.awaiting.length === 0
                  ? "Everyone in the chart has answered."
                  : "Nothing to do — these families just haven't answered yet, and they're still in the lineup."}
              </CardDescription>
            </CardHeader>
            {readiness.awaiting.length > 0 ? (
              <CardContent>
                <PlayerList
                  entries={readiness.awaiting}
                  tagClassName={RSVP_STYLE["no-response"].tagClassName}
                />
              </CardContent>
            ) : null}
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/t/${teamId}/chart`}>Edit batting order</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/t/${teamId}/chart/positions`}>Edit positions</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/t/${teamId}/schedule/${game.id}`}>Game details</Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
