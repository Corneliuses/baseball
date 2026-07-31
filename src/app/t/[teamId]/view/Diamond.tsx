import type { Position } from "@/generated/prisma/enums";
import type { ChartViewPlayer } from "@/lib/chart-view";
import { ALL_POSITIONS, POSITION_LABELS } from "@/lib/positions";
import { RSVP_STYLE } from "./rsvp-style";

/// The labeled diamond, server-rendered as inline SVG — no image asset, no
/// client JS, crisp on any phone. Marker layout mirrors where each position
/// actually stands on a field: infield tight around the bases, outfield
/// arced further out, catcher behind home plate.
const POSITION_COORDS: Record<Position, { x: number; y: number }> = {
  CATCHER: { x: 200, y: 402 },
  PITCHER: { x: 200, y: 296 },
  FIRST_BASE: { x: 276, y: 300 },
  SECOND_BASE: { x: 236, y: 246 },
  SHORTSTOP: { x: 164, y: 246 },
  THIRD_BASE: { x: 124, y: 300 },
  LEFT_FIELD: { x: 78, y: 128 },
  CENTER_FIELD: { x: 200, y: 68 },
  RIGHT_FIELD: { x: 322, y: 128 },
};

function PositionMarker({
  position,
  player,
}: {
  position: Position;
  player: ChartViewPlayer | undefined;
}) {
  const { x, y } = POSITION_COORDS[position];
  const style = player ? RSVP_STYLE[player.rsvpState] : null;

  return (
    <g transform={`translate(${x} ${y})`}>
      <text
        y={-32}
        textAnchor="middle"
        fill="currentColor"
        className="fill-muted-foreground text-[11px] font-semibold uppercase tracking-wide"
      >
        {POSITION_LABELS[position]}
      </text>

      <circle
        r={22}
        strokeWidth={2}
        className={
          player
            ? player.rsvpState === "declined"
              ? "fill-muted/40 stroke-border"
              : "fill-primary/15 stroke-primary"
            : "fill-card stroke-border"
        }
        strokeDasharray={player ? undefined : "4 3"}
      />

      <text
        textAnchor="middle"
        dy={5}
        fill="currentColor"
        className="text-xs font-bold fill-foreground"
      >
        {player ? (player.jerseyNumber ?? "•") : ""}
      </text>

      <text
        y={44}
        textAnchor="middle"
        fill="currentColor"
        className={
          player
            ? `text-[11px] font-medium ${style!.nameClassName}`
            : "text-[11px] italic fill-muted-foreground"
        }
      >
        {player ? player.playerName : "Open"}
      </text>

      {player ? (
        <text
          y={58}
          textAnchor="middle"
          fill="currentColor"
          className={`text-[10px] ${style!.tagClassName}`}
        >
          {style!.label}
        </text>
      ) : null}
    </g>
  );
}

export function Diamond({ byPosition }: { byPosition: Map<Position, ChartViewPlayer> }) {
  return (
    <svg
      viewBox="0 0 400 440"
      role="img"
      aria-label="Defensive positions chart"
      className="mx-auto w-full max-w-sm"
    >
      <polygon
        points="200,420 290,320 200,230 110,320"
        className="fill-none stroke-border"
        strokeWidth={2}
      />

      {ALL_POSITIONS.map((position) => (
        <PositionMarker
          key={position}
          position={position}
          player={byPosition.get(position)}
        />
      ))}
    </svg>
  );
}
