import Link from "next/link";
import { notFound } from "next/navigation";

import { GUARDED_STYLE, YOUR_PLAYER_TEXT } from "@/components/guarded-style";
import { JerseyDot } from "@/components/JerseyDot";
import { RSVP_STYLE } from "@/components/rsvp-style";
import { StitchDivider } from "@/components/StitchDivider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buildChartView, type ChartViewPlayer } from "@/lib/chart-view";
import { formatEventDateTime } from "@/lib/calendar";
import { mapsUrl } from "@/lib/maps";
import { getChart } from "@/lib/roster";
import { buildRsvpStateMap } from "@/lib/rsvp";
import { guardedRosteredPlayerIds, listEventRsvps } from "@/lib/rsvps";
import { nextGame } from "@/lib/schedule";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getTeamById } from "@/lib/teams";

import { Diamond } from "./Diamond";
import { Reveal } from "./Reveal";

export const metadata = {
  title: "Lineup — Youth Baseball Team Manager",
};

/// One dugout roster row, shared by the batting order and the bench so the two
/// cannot drift into different dialects of the same list. The batting order
/// passes the slot number; the bench passes nothing, because a benched player
/// has no slot — an empty jersey dot is the honest answer, not a zero.
///
/// The guarded row gets weight and a text badge and keeps the `animate-rise`
/// it already had. No second animation, deliberately: the list has finished
/// rising by the time one would fire, and a row that moves again afterwards
/// reads as a glitch rather than as emphasis (#49).
function ChartRow({
  player,
  slot,
  index,
  showRsvp,
  isGuarded,
}: {
  player: ChartViewPlayer;
  slot: number | string;
  index: number;
  showRsvp: boolean;
  isGuarded: boolean;
}) {
  const style = RSVP_STYLE[player.rsvpState];

  return (
    <li
      className={`animate-rise flex items-center justify-between gap-4 rounded-md border p-3 ${
        isGuarded
          ? GUARDED_STYLE.rowClassName
          : "border-border bg-background/60"
      }`}
      // Rows rise in batting order, like a lineup being announced.
      // Translate-only and reduced-motion-gated (see animate-rise in
      // globals.css).
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex min-w-0 items-center gap-3">
        {/* The slot number wears a jersey (design-plan.md §7); the shirt
            number rides along in mono. */}
        <JerseyDot number={slot} />
        <span
          className={`truncate text-sm ${
            isGuarded ? "font-bold" : "font-medium"
          } ${style.nameClassName}`}
        >
          {player.playerName}
          {player.jerseyNumber !== null ? (
            <span className="ml-1 font-mono text-xs text-muted-foreground">
              #{player.jerseyNumber}
            </span>
          ) : null}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* The halo's counterpart in text. Colour is never the only carrier
            (design-plan.md §10), and this row has no field art to ring. */}
        {isGuarded ? (
          <span className={GUARDED_STYLE.badgeClassName}>
            {YOUR_PLAYER_TEXT}
          </span>
        ) : null}
        {showRsvp ? (
          <span className={`text-xs ${style.tagClassName}`}>{style.label}</span>
        ) : null}
      </div>
    </li>
  );
}

/// The parent-facing payoff (#8): the standing chart, read in the context of
/// the next game, with RSVP state as decoration only. Entirely read-only —
/// the chart columns are authored elsewhere (#10, #11); for the validation
/// weekend they're set by hand via `pnpm db:studio`.
///
/// Every member reads this page, matching the event page's own intent —
/// there is nothing here a role gates.
export default async function ViewPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;

  // `userId`, unlike on most read pages, is load-bearing here: it is the whole
  // difference between a diamond of twelve names and a diamond with the
  // reader's own kid ringed on it (#49).
  let userId: string;
  try {
    ({ userId } = await requireTeamAccess(teamId, { intent: "read" }));
  } catch (error) {
    if (error instanceof TeamAccessError) {
      notFound();
    }
    throw error;
  }

  // Deliberately NOT wrapped in try/catch — nextGame's contract is that a
  // database outage propagates rather than rendering the same "no upcoming
  // game" header a healthy team would show on a bye week.
  const game = await nextGame(teamId);

  // The chart is standing, not per-game (AGENTS.md rule 2), so it renders
  // with or without a game on the schedule — a parent between seasons still
  // sees where their kid plays. Only the RSVP decoration is per-game: with no
  // game there is nothing to respond to, so `showRsvp` strips the tags and
  // the legend rather than stamping "No response" on the whole team.
  const showRsvp = game !== null;

  const [team, chartEntries, rsvpRows, guardedPlayerIds] = await Promise.all([
    // Needed for allPlay alone: it decides whether an unplaced player is in
    // the outfield or on the bench, and the diamond has to say which. A null
    // return means the team was deleted between requireTeamAccess and here,
    // so the render falls back to the column's own default rather than
    // 404ing a page that already passed its access check.
    getTeamById(teamId),
    getChart(teamId),
    game ? listEventRsvps(teamId, game.id) : Promise.resolve([]),
    // Deliberately not caught, matching nextGame above: a swallowed outage
    // here renders a page that quietly tells a parent they guard nobody, which
    // is indistinguishable from the truth for a coach and wrong for everyone
    // else. Already intersected with this team's roster inside the helper, so
    // a kid the reader guards on another team cannot light up here.
    guardedRosteredPlayerIds(teamId, userId),
  ]);

  const rsvpStates = buildRsvpStateMap(
    chartEntries.map((entry) => entry.playerId),
    rsvpRows,
  );
  const allPlay = team?.allPlay ?? true;
  const chart = buildChartView(chartEntries, rsvpStates, allPlay);

  // The players this page would otherwise render *nowhere*, which is the gap
  // #49 closes: before it, a parent whose kid was in neither column opened the
  // payoff page and found nothing about their child on it.
  //
  // Two filters, both load-bearing. `allPlay` first, because `unassigned` means
  // two different things and buildChartView deliberately refuses to name it: on
  // an allPlay team those players are the outfield, already drawn as the
  // diamond's zone, and calling them benched would tell those parents their kid
  // is sitting when the diamond two inches above shows them playing. Then
  // `battingOrder === null`, because a kid batting third with no fielding spot
  // is already in the order — listing them again under "Bench" would both
  // duplicate them and misdescribe them.
  const bench = allPlay
    ? []
    : chart.unassigned.filter((player) => player.battingOrder === null);

  const heading = game?.opponent
    ? `Next game vs ${game.opponent}`
    : "Next game";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      {game ? (
        <Card>
          <CardHeader>
            <CardTitle>{heading}</CardTitle>
            <CardDescription>
              {formatEventDateTime(game.startsAt)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {game.location ? (
              <p className="text-sm text-foreground">
                <a
                  href={mapsUrl(game.location)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2 hover:text-primary"
                >
                  {game.location}
                </a>
              </p>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <Link href={`/t/${teamId}/schedule/${game.id}`}>
                Game details &amp; RSVP
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No upcoming game</CardTitle>
            <CardDescription>
              Nothing is on the schedule right now — this is the standing
              chart, ready for the next one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href={`/t/${teamId}/schedule`}>Go to schedule</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!chart.hasChart ? (
        <Card>
          <CardHeader>
            <CardTitle>No chart set yet</CardTitle>
            <CardDescription>
              The batting order and positions haven&rsquo;t been set for this team.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Reveal>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <Card className="lg:flex-1">
              <CardHeader>
                <CardTitle className="text-lg">Positions</CardTitle>
              </CardHeader>
              <CardContent>
                <Diamond
                  byPosition={chart.byPosition}
                  allPlay={allPlay}
                  outfield={chart.unassigned}
                  showRsvp={showRsvp}
                  guardedPlayerIds={guardedPlayerIds}
                />
              </CardContent>
            </Card>

            <Card className="lg:flex-1">
              <CardHeader>
                <CardTitle className="text-lg">Batting order</CardTitle>
              </CardHeader>
              <CardContent>
                {chart.lineup.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No one is in the batting order yet.
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {chart.lineup.map((player, index) => (
                      <ChartRow
                        key={player.playerId}
                        player={player}
                        slot={player.battingOrder ?? ""}
                        index={index}
                        showRsvp={showRsvp}
                        isGuarded={guardedPlayerIds.has(player.playerId)}
                      />
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>

          {bench.length > 0 ? (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-lg">Bench</CardTitle>
                <CardDescription>
                  Not in the batting order or the field chart right now.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {bench.map((player, index) => (
                    <ChartRow
                      key={player.playerId}
                      player={player}
                      // No slot number: a benched player has none, and a zero
                      // in a jersey dot would read as batting position zero.
                      slot=""
                      index={index}
                      showRsvp={showRsvp}
                      isGuarded={guardedPlayerIds.has(player.playerId)}
                    />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {showRsvp ? (
            <>
              <StitchDivider className="mt-6" />

              <p className="mt-3 text-xs text-muted-foreground">
                <span className={RSVP_STYLE.attending.tagClassName}>
                  {RSVP_STYLE.attending.label}
                </span>{" "}
                ·{" "}
                <span className={RSVP_STYLE.declined.tagClassName}>
                  {RSVP_STYLE.declined.label}
                </span>{" "}
                ·{" "}
                <span className={RSVP_STYLE["no-response"].tagClassName}>
                  {RSVP_STYLE["no-response"].label}
                </span>{" "}
                — RSVP is just for planning. Everyone stays in their slot
                either way.
              </p>
            </>
          ) : null}
        </Reveal>
      )}
    </div>
  );
}
