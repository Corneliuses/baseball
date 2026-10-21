import { GUARDED_STYLE, YOUR_PLAYER_TEXT } from "@/components/guarded-style";
import { JerseyDot } from "@/components/JerseyDot";
import { RSVP_STYLE } from "@/components/rsvp-style";
import { StitchDivider } from "@/components/StitchDivider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CourtPosition } from "@/generated/prisma/enums";
import { byJerseyThenName } from "@/lib/chart-view";
import {
  COURT_POSITIONS,
  COURT_POSITION_LABELS,
  COURT_POSITION_NAMES,
} from "@/lib/court-positions";
import { buildDepthDraft, hasDepthChartSet } from "@/lib/depth-chart";
import { buildDiamondNames } from "@/lib/diamond-names";
import type { DepthChartRow } from "@/lib/roster";
import type { RsvpState } from "@/lib/rsvp";

import { Court, type CourtPlayer } from "./Court";
import { Reveal } from "./Reveal";

function DepthRow({
  player,
  slot,
  index,
  showRsvp,
  isGuarded,
}: {
  player: CourtPlayer;
  slot: number | string;
  index: number;
  showRsvp: boolean;
  isGuarded: boolean;
}) {
  const style = RSVP_STYLE[player.rsvpState];
  return (
    <li
      className={`animate-rise flex items-center justify-between gap-4 rounded-md border p-3 ${
        isGuarded ? GUARDED_STYLE.rowClassName : "border-border bg-background/60"
      }`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <JerseyDot number={slot} />
        <span
          className={`truncate text-sm ${isGuarded ? "font-bold" : "font-medium"} ${style.nameClassName}`}
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
        {isGuarded ? (
          <span className={GUARDED_STYLE.badgeClassName}>{YOUR_PLAYER_TEXT}</span>
        ) : null}
        {showRsvp ? (
          <span className={`text-xs ${style.tagClassName}`}>{style.label}</span>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Basketball's Game Day body: the starting five drawn on a half court, the
 * same five as a list, and the bench in the order the coach sends players in.
 * Read-only, like the baseball page beside it,
 * and standing rather than per-game — RSVP state only decorates it, and a kid
 * who can't make Saturday keeps their spot on the chart.
 */
export function DepthChartGameDay({
  entries,
  rsvpStates,
  showRsvp,
  guardedPlayerIds,
}: {
  entries: readonly DepthChartRow[];
  rsvpStates: ReadonlyMap<string, RsvpState>;
  showRsvp: boolean;
  guardedPlayerIds: ReadonlySet<string>;
}) {
  // Sorted before anything reads it: `getDepthChart` has no orderBy, and a
  // kid the coach hasn't placed yet joins the bench in the order it is handed.
  const sorted = [...entries].sort(byJerseyThenName);
  const byEntryId = new Map(sorted.map((entry) => [entry.entryId, entry]));
  const draft = buildDepthDraft(sorted);

  const toPlayer = (entryId: string): CourtPlayer => {
    const entry = byEntryId.get(entryId)!;
    return {
      playerId: entry.playerId,
      playerName: entry.playerName,
      jerseyNumber: entry.jerseyNumber,
      rsvpState: rsvpStates.get(entry.playerId) ?? "no-response",
    };
  };

  const spots = Object.fromEntries(
    COURT_POSITIONS.map((position) => {
      const entryId = draft.starters[position];
      return [position, entryId === null ? null : toPlayer(entryId)];
    }),
  ) as Record<CourtPosition, CourtPlayer | null>;
  const bench = draft.bench.map(toPlayer);

  const names = buildDiamondNames(
    sorted.map((entry) => ({ id: entry.playerId, playerName: entry.playerName })),
  );

  if (!hasDepthChartSet(sorted)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No depth chart set yet</CardTitle>
          <CardDescription>
            The coach hasn&rsquo;t set the starting five or the bench for this
            team yet.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Reveal>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <Card className="lg:flex-1">
          <CardHeader>
            <CardTitle className="text-lg">On the court</CardTitle>
          </CardHeader>
          <CardContent>
            <Court
              spots={spots}
              names={names}
              showRsvp={showRsvp}
              guardedPlayerIds={guardedPlayerIds}
            />
          </CardContent>
        </Card>

        <Card className="lg:flex-1">
          <CardHeader>
            <CardTitle className="text-lg">Starting five</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {COURT_POSITIONS.map((position, index) => {
                const player = spots[position];
                return player === null ? (
                  <li
                    key={position}
                    className="flex items-center gap-3 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground"
                  >
                    <JerseyDot number={COURT_POSITION_LABELS[position]} />
                    {COURT_POSITION_NAMES[position]} — open
                  </li>
                ) : (
                  <DepthRow
                    key={position}
                    player={player}
                    slot={COURT_POSITION_LABELS[position]}
                    index={index}
                    showRsvp={showRsvp}
                    isGuarded={guardedPlayerIds.has(player.playerId)}
                  />
                );
              })}
            </ol>
          </CardContent>
        </Card>
      </div>

      {bench.length > 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Bench</CardTitle>
            <CardDescription>
              In the order they come off the bench.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {bench.map((player, index) => (
                <DepthRow
                  key={player.playerId}
                  player={player}
                  slot={index + 1}
                  index={index}
                  showRsvp={showRsvp}
                  isGuarded={guardedPlayerIds.has(player.playerId)}
                />
              ))}
            </ol>
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
            — RSVP is just for planning. Everyone keeps their spot either way.
          </p>
        </>
      ) : null}
    </Reveal>
  );
}
