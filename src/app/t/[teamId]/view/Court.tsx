import { CourtArt } from "@/components/CourtArt";
import {
  COURT_GEOMETRY,
  courtSpotPercent,
} from "@/components/court-geometry";
import { YOUR_PLAYER_SR_SUFFIX } from "@/components/guarded-style";
import { RSVP_STYLE } from "@/components/rsvp-style";
import type { CourtPosition } from "@/generated/prisma/enums";
import {
  COURT_POSITIONS,
  COURT_POSITION_LABELS,
  COURT_POSITION_NAMES,
} from "@/lib/court-positions";
import type { RsvpState } from "@/lib/rsvp";

export type CourtPlayer = {
  playerId: string;
  playerName: string;
  jerseyNumber: number | null;
  rsvpState: RsvpState;
};

/**
 * Game Day's half court: the starting five, each standing where their
 * position plays. Basketball's counterpart of `Diamond`.
 *
 * The markers are HTML laid over the SVG rather than SVG text, because a
 * stack of names wraps and sizes itself better as boxes than as hand-placed
 * `<text>`. `CourtArt` underneath is decoration; the sr-only list is the real
 * content for a screen reader.
 *
 * The banana budget follows `/view`'s rule: a reader with a kid on the team
 * gets the yellow on that kid, and the rim drops to court-line white; a reader
 * with none gets the banana rim, so the screen still has exactly one.
 */
export function Court({
  spots,
  names,
  showRsvp,
  guardedPlayerIds,
}: {
  spots: Record<CourtPosition, CourtPlayer | null>;
  /// Short names keyed on playerId, from `buildDiamondNames`.
  names: ReadonlyMap<string, string>;
  showRsvp: boolean;
  guardedPlayerIds: ReadonlySet<string>;
}) {
  // Any kid of the reader's on this team wears the banana somewhere on the
  // page — a chip here or a row in the lists below — because
  // `guardedRosteredPlayerIds` is already cut to this team's roster. So the
  // rim gives it back whenever the set is non-empty, not only when the kid is
  // starting: a bench kid's row is the screen's banana then.
  const readerHasKid = guardedPlayerIds.size > 0;

  return (
    <div>
      <div
        className="relative mx-auto w-full max-w-sm"
        style={{
          aspectRatio: `${COURT_GEOMETRY.width} / ${COURT_GEOMETRY.height}`,
        }}
        aria-hidden="true"
      >
        <svg
          viewBox={`0 0 ${COURT_GEOMETRY.width} ${COURT_GEOMETRY.height}`}
          focusable="false"
          className="absolute inset-0 h-full w-full"
        >
          <CourtArt rim={readerHasKid ? "line" : "banana"} />
        </svg>

        {COURT_POSITIONS.map((position) => {
          const { x, y } = courtSpotPercent(position);
          const player = spots[position];
          const isGuarded =
            player !== null && guardedPlayerIds.has(player.playerId);
          const style = player ? RSVP_STYLE[player.rsvpState] : null;
          return (
            <div
              key={position}
              data-court-position={position}
              style={{ left: `${x}%`, top: `${y}%` }}
              className="absolute flex w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 text-center"
            >
              <span className="rounded-full bg-foreground px-2 font-mono text-[11px] font-bold text-background">
                {COURT_POSITION_LABELS[position]}
              </span>
              {player === null || style === null ? (
                <span className="rounded bg-background/85 px-1 text-[11px] italic text-muted-foreground">
                  Open
                </span>
              ) : (
                <span
                  className={`flex max-w-full flex-col items-center rounded border bg-card px-1.5 py-0.5 ${
                    isGuarded
                      ? "border-banana font-bold ring-2 ring-banana"
                      : showRsvp && player.rsvpState === "declined"
                        ? "border-dashed border-muted-foreground"
                        : "border-border"
                  }`}
                >
                  <span
                    className={`max-w-full truncate text-xs font-semibold ${
                      showRsvp ? style.nameClassName : "text-foreground"
                    }`}
                  >
                    {names.get(player.playerId) ?? player.playerName}
                  </span>
                  {player.jerseyNumber !== null ? (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      #{player.jerseyNumber}
                    </span>
                  ) : null}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <ul className="sr-only">
        {COURT_POSITIONS.map((position) => (
          <li key={position}>
            {COURT_POSITION_NAMES[position]}:{" "}
            {(() => {
              const player = spots[position];
              if (player === null) {
                return "open";
              }
              return `${player.playerName}${
                guardedPlayerIds.has(player.playerId)
                  ? ` ${YOUR_PLAYER_SR_SUFFIX}`
                  : ""
              }${showRsvp ? `, ${RSVP_STYLE[player.rsvpState].label}` : ""}`;
            })()}
          </li>
        ))}
      </ul>
    </div>
  );
}
