import Link from "next/link";
import { notFound } from "next/navigation";

import { JerseyDot } from "@/components/JerseyDot";
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
import { chartRole } from "@/lib/chart-role";
import { POSITION_LABELS } from "@/lib/positions";
import { computeReadiness, type Readiness } from "@/lib/readiness";
import { getChart } from "@/lib/roster";
import {
  hasChartSet,
  seatedEntryIds,
  type ChartViewEntry,
} from "@/lib/chart-view";
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
///
/// `chartRole` — the "Bats 3rd · SS" line beside each name — lives in
/// src/lib/chart-role.ts now, shared with team home (#48). It is called here
/// without a bench label, which is this page's existing behavior: a coach
/// reading a list of who is out already knows the chart.

function PlayerList({
  entries,
  allPlay,
  seated,
  tagClassName,
}: {
  entries: ChartViewEntry[];
  allPlay: boolean;
  /// Roster spots the diamond actually seats (`seatedEntryIds`). A stored
  /// position is no longer enough to print one: a spot has a capacity, and a
  /// board can hold more rows than it, so a kid this set omits plays the
  /// outfield whatever their `position` column still says — which is exactly
  /// what /view draws for them.
  seated: ReadonlySet<string>;
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
          <span className={`text-xs ${tagClassName}`}>
            {chartRole(
              seated.has(entry.entryId) ? entry : { ...entry, position: null },
              allPlay,
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/// The next game's batting order with the declined players lifted out and the
/// ranks closed up — `computeReadiness`'s `effectiveOrder`, computed since #12
/// and rendered nowhere until #55.
///
/// The number in the jersey dot is the *closed-up* rank (`index + 1`), never
/// the player's stored `battingOrder`. That is the whole point of the card:
/// this is what gets read out at the plate on Saturday, and printing the
/// standing slots would only be /view with gaps in it.
///
/// No RSVP tags, unlike `PlayerList` above. Everyone on this list either said
/// yes or hasn't answered, and the awaiting card already accounts for silence —
/// stamping "No response" beside a name here would read as a doubt about
/// whether they are really batting third, which is not what it means.
function EffectiveOrderList({ entries }: { entries: ChartViewEntry[] }) {
  return (
    <ol className="space-y-2">
      {entries.map((entry, index) => (
        <li
          key={entry.playerId}
          className="flex items-center gap-3 rounded-md border border-border p-3"
        >
          <JerseyDot number={index + 1} />
          <span className="text-sm font-medium text-foreground">
            {entry.playerName}
            {entry.jerseyNumber !== null ? (
              <span className="ml-1 font-mono text-xs text-muted-foreground">
                #{entry.jerseyNumber}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
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
  const allPlay = team?.allPlay ?? true;
  const readiness: Readiness<ChartViewEntry> = computeReadiness(
    chartEntries,
    rsvpStates,
    allPlay,
  );

  // The spots the diamond actually seats, from /view's own rule — see
  // `PlayerList`'s `seated` prop for why the position column alone won't do.
  const seated = seatedEntryIds(chartEntries, allPlay);

  const hasChart = hasChartSet(chartEntries);

  // Whether a decline actually moved the batting order, which is not the same
  // question as `ready`. A player who fields without batting (selective teams)
  // empties a position and changes nothing about the card, and on a team where
  // nobody declined the effective order *is* the standing order — already on
  // /view, one link away. Either way, rendering it would be repetition dressed
  // as news, so the card appears only when it has something new to say.
  const orderDisrupted = readiness.declined.some(
    (entry) => entry.battingOrder !== null,
  );

  const heading = game.opponent ? `Next game vs ${game.opponent}` : "Next game";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-xl font-semibold text-foreground">Readiness</h3>
        <Button asChild variant="outline" size="sm">
          <Link href={`/t/${teamId}/view`}>See Game Day view</Link>
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
          {/* The scoreboard (design-plan.md §7): charcoal in both themes — a
              scoreboard is dark; light mode just means it's daytime around
              it. Mono type overrides the card's slab title via cn/twMerge. */}
          <Card className="border-2 border-scoreboard-accent/40 bg-scoreboard text-scoreboard-foreground shadow-md">
            <CardHeader>
              <CardTitle className="font-mono text-lg font-bold uppercase tracking-widest text-scoreboard-accent">
                {readiness.ready ? "Ready for game day" : "Needs attention"}
              </CardTitle>
              <CardDescription className="font-mono text-scoreboard-foreground/85">
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
                  allPlay={allPlay}
                  seated={seated}
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
                      className="rounded-md border-2 border-destructive bg-destructive/10 px-3 py-1 font-mono text-sm font-bold text-destructive"
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

          {orderDisrupted ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  The order as it stands
                </CardTitle>
                <CardDescription>
                  With the players above out, this is how the batting order
                  comes out for this game, slots closed up. Nothing here is
                  saved — it&rsquo;s worked out fresh each time you look, and
                  the standing order is untouched. Edit the batting order to
                  change it for good.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {readiness.effectiveOrder.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Everyone in the batting order is out for this game.
                  </p>
                ) : (
                  <EffectiveOrderList entries={readiness.effectiveOrder} />
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              {/* The heading has to track the state, not name the section: a
                  card titled "No response" that reads "everyone answered"
                  denies itself, and this is the one card that renders either
                  way — it stays visible when empty so silence is always
                  accounted for, never merely absent from the page. */}
              <CardTitle className="text-lg">
                {readiness.awaiting.length === 0
                  ? "Everyone has answered"
                  : RSVP_STYLE["no-response"].label}
              </CardTitle>
              <CardDescription>
                {readiness.awaiting.length === 0
                  ? "Every player in the chart has an RSVP for this game."
                  : "Nothing to do — these families just haven't answered yet, and they're still in the lineup."}
              </CardDescription>
            </CardHeader>
            {readiness.awaiting.length > 0 ? (
              <CardContent>
                <PlayerList
                  entries={readiness.awaiting}
                  allPlay={allPlay}
                  seated={seated}
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
