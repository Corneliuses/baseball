import Link from "next/link";
import { notFound } from "next/navigation";

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
import { buildChartView } from "@/lib/chart-view";
import { formatEventDateTime } from "@/lib/calendar";
import { getChart } from "@/lib/roster";
import { buildRsvpStateMap } from "@/lib/rsvp";
import { listEventRsvps } from "@/lib/rsvps";
import { nextGame } from "@/lib/schedule";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getTeamById } from "@/lib/teams";

import { Diamond } from "./Diamond";
import { Reveal } from "./Reveal";

export const metadata = {
  title: "Lineup — Youth Baseball Team Manager",
};

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

  try {
    await requireTeamAccess(teamId, { intent: "read" });
  } catch (error) {
    if (error instanceof TeamAccessError) {
      notFound();
    }
    throw error;
  }

  // Deliberately NOT wrapped in try/catch — nextGame's contract is that a
  // database outage propagates rather than rendering the same "no upcoming
  // game" empty state a healthy team would show on a bye week.
  const game = await nextGame(teamId);

  if (!game) {
    return (
      <div className="mx-auto w-full max-w-md space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>No upcoming game</CardTitle>
            <CardDescription>
              The lineup shows up here once a game is on the schedule. Enjoy
              the day off.
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
    // Needed for allPlay alone: it decides whether an unplaced player is in
    // the outfield or on the bench, and the diamond has to say which. A null
    // return means the team was deleted between requireTeamAccess and here,
    // so the render falls back to the column's own default rather than
    // 404ing a page that already passed its access check.
    getTeamById(teamId),
    getChart(teamId),
    listEventRsvps(teamId, game.id),
  ]);

  const rsvpStates = buildRsvpStateMap(
    chartEntries.map((entry) => entry.playerId),
    rsvpRows,
  );
  const chart = buildChartView(chartEntries, rsvpStates, team?.allPlay ?? true);

  const heading = game.opponent ? `Next game vs ${game.opponent}` : "Next game";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
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
                  allPlay={team?.allPlay ?? true}
                  outfield={chart.unassigned}
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
                    {chart.lineup.map((player, index) => {
                      const style = RSVP_STYLE[player.rsvpState];
                      return (
                        <li
                          key={player.playerId}
                          className="animate-rise flex items-center justify-between gap-4 rounded-md border border-border bg-background/60 p-3"
                          // Rows rise in batting order, like a lineup being
                          // announced. Translate-only and reduced-motion-gated
                          // (see animate-rise in globals.css).
                          style={{ animationDelay: `${index * 40}ms` }}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            {/* The slot number wears a jersey (design-plan.md
                                §7); the shirt number rides along in mono. */}
                            <JerseyDot number={player.battingOrder ?? ""} />
                            <span
                              className={`truncate text-sm font-medium ${style.nameClassName}`}
                            >
                              {player.playerName}
                              {player.jerseyNumber !== null ? (
                                <span className="ml-1 font-mono text-xs text-muted-foreground">
                                  #{player.jerseyNumber}
                                </span>
                              ) : null}
                            </span>
                          </div>
                          <span className={`text-xs ${style.tagClassName}`}>
                            {style.label}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>

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
            — RSVP is just for planning. Everyone stays in their slot either way.
          </p>
        </Reveal>
      )}
    </div>
  );
}
