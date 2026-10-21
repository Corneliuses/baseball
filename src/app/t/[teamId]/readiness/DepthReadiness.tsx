import Link from "next/link";

import { JerseyDot } from "@/components/JerseyDot";
import { RSVP_STYLE } from "@/components/rsvp-style";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { COURT_POSITION_LABELS, COURT_POSITION_NAMES, ordinal } from "@/lib/court-positions";
import {
  PLAYERS_ON_COURT,
  type DepthReadiness as DepthReadinessResult,
  type RotationSpot,
} from "@/lib/depth-readiness";
import type { DepthChartRow } from "@/lib/roster";

/// Where a kid sits in the rotation, as the line beside their name.
function rotationRole(spot: RotationSpot<DepthChartRow>): string {
  return spot.kind === "starter"
    ? `Starts at ${COURT_POSITION_LABELS[spot.position]}`
    : `${ordinal(spot.benchSlot)} off the bench`;
}

function RotationList({
  spots,
  tagClassName,
}: {
  spots: RotationSpot<DepthChartRow>[];
  tagClassName: string;
}) {
  return (
    <ul className="space-y-2">
      {spots.map((spot) => (
        <li
          key={spot.entry.entryId}
          className="flex items-center justify-between gap-4 rounded-md border border-border p-3"
        >
          <span className="text-sm font-medium text-foreground">
            {spot.entry.playerName}
            {spot.entry.jerseyNumber !== null ? ` #${spot.entry.jerseyNumber}` : ""}
          </span>
          <span className={`text-xs ${tagClassName}`}>{rotationRole(spot)}</span>
        </li>
      ))}
    </ul>
  );
}

/// The scoreboard's one-line summary under the headline.
function summary(readiness: DepthReadinessResult<DepthChartRow>): string {
  const out = readiness.declined.length;
  const parts: string[] = [];
  if (out === 0) {
    parts.push("Nobody on the roster has said they can't make it.");
  } else {
    parts.push(`${out} ${out === 1 ? "player is" : "players are"} out.`);
  }
  if (readiness.shortHanded) {
    parts.push(`That leaves fewer than ${PLAYERS_ON_COURT} to take the floor.`);
  }
  if (readiness.awaiting.length > 0) {
    parts.push(
      `${readiness.awaiting.length} still to answer — that doesn't hold up the lineup.`,
    );
  }
  return parts.join(" ");
}

/**
 * Basketball's readiness body, below the game card: the depth chart checked
 * against the next game's RSVPs. The baseball page's layout in the court's
 * vocabulary — starters and the bench instead of slots and positions — and
 * just as read-only: it says who is out and links to the depth chart editor,
 * and nothing on it writes.
 *
 * The scoreboard keeps the charcoal panel every sport shares (globals.css
 * leaves the scoreboard tokens alone under `data-sport`), and adds the number
 * a basketball coach counts first: how many are left to put on the floor.
 */
export function DepthReadiness({
  teamId,
  gameId,
  readiness,
  hasChart,
}: {
  teamId: string;
  gameId: string;
  readiness: DepthReadinessResult<DepthChartRow>;
  hasChart: boolean;
}) {
  const editHref = `/t/${teamId}/chart/depth`;

  if (!hasChart) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No depth chart set yet</CardTitle>
          <CardDescription>
            Set the starting five and the bench and this page will check them
            against who&rsquo;s coming.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href={editHref}>Edit depth chart</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Shown only when a bench decline moved somebody up. A declined starter
  // leaves the bench exactly as it was, already on Game Day one link away.
  const benchMoved = readiness.declined.some((spot) => spot.kind === "bench");

  return (
    <>
      <Card className="border-2 border-scoreboard-accent/40 bg-scoreboard text-scoreboard-foreground shadow-md">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle className="font-mono text-lg font-bold uppercase tracking-widest text-scoreboard-accent">
              {readiness.ready
                ? "Ready for tip-off"
                : readiness.shortHanded
                  ? "Short-handed"
                  : "Needs attention"}
            </CardTitle>
            <CardDescription className="font-mono text-scoreboard-foreground/85">
              {summary(readiness)}
            </CardDescription>
          </div>
          <div className="shrink-0 text-right font-mono" aria-label={`${readiness.available} available`}>
            <p className="text-3xl font-bold tabular-nums text-scoreboard-accent">
              {String(readiness.available).padStart(2, "0")}
            </p>
            <p className="text-[10px] uppercase tracking-widest text-scoreboard-foreground/70">
              Available
            </p>
          </div>
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
            <RotationList
              spots={readiness.declined}
              tagClassName={RSVP_STYLE.declined.tagClassName}
            />
          </CardContent>
        </Card>
      ) : null}

      {readiness.uncoveredPositions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Starting spots open</CardTitle>
            <CardDescription>
              These starters are out. Changing the depth chart is permanent — it
              becomes the standing chart, not a one-game patch.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="flex flex-wrap gap-2">
              {readiness.uncoveredPositions.map((position) => (
                <li
                  key={position}
                  title={COURT_POSITION_NAMES[position]}
                  className="rounded-md border-2 border-destructive bg-destructive/10 px-3 py-1 font-mono text-sm font-bold text-destructive"
                >
                  {COURT_POSITION_LABELS[position]}
                </li>
              ))}
            </ul>
            <Button asChild variant="outline">
              <Link href={editHref}>Edit depth chart</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {benchMoved ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">The bench as it stands</CardTitle>
            <CardDescription>
              With the players above out, this is the order they come off the
              bench for this game. Nothing here is saved — it&rsquo;s worked out
              fresh each time you look, and the standing chart is untouched.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {readiness.effectiveBench.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nobody is left on the bench for this game.
              </p>
            ) : (
              <ol className="space-y-2">
                {readiness.effectiveBench.map((entry, index) => (
                  <li
                    key={entry.entryId}
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
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {readiness.awaiting.length === 0
              ? "Everyone has answered"
              : RSVP_STYLE["no-response"].label}
          </CardTitle>
          <CardDescription>
            {readiness.awaiting.length === 0
              ? "Every player on the roster has an RSVP for this game."
              : "Nothing to do — these families just haven't answered yet, and they're still in the rotation."}
          </CardDescription>
        </CardHeader>
        {readiness.awaiting.length > 0 ? (
          <CardContent>
            <RotationList
              spots={readiness.awaiting}
              tagClassName={RSVP_STYLE["no-response"].tagClassName}
            />
          </CardContent>
        ) : null}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={editHref}>Edit depth chart</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/t/${teamId}/schedule/${gameId}`}>Game details</Link>
        </Button>
      </div>
    </>
  );
}
