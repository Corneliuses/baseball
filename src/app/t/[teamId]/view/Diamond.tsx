import { RSVP_STYLE } from "@/components/rsvp-style";
import type { Position } from "@/generated/prisma/enums";
import type { ChartViewPlayer } from "@/lib/chart-view";
import { ALL_POSITIONS, POSITION_LABELS } from "@/lib/positions";

/// The labeled diamond, server-rendered as inline SVG — no image asset, no
/// client JS, crisp on any phone.
///
/// Marker coordinates mirror where each position actually stands, and the
/// **catcher sits below home plate at y=452, which is why the viewBox is 520
/// tall**: each marker draws a name at y+34 and an RSVP tag at y+47, so a
/// shorter viewBox silently clips the catcher's name and state off the bottom.
/// Check the lowest marker's y+47 against the viewBox height before moving
/// anything.
/// Exported so Diamond.test.tsx can assert the layout invariants directly.
/// The clipping this guards against is silent — an off-canvas name renders
/// without error and simply cannot be seen.
export const DIAMOND_GEOMETRY = {
  width: 400,
  height: 520,
  markerRadius: 20,
  nameOffset: 34,
  tagOffset: 47,
} as const;

const MARKER_RADIUS = DIAMOND_GEOMETRY.markerRadius;
const NAME_OFFSET = DIAMOND_GEOMETRY.nameOffset;
const TAG_OFFSET = DIAMOND_GEOMETRY.tagOffset;
const VIEWBOX_HEIGHT = DIAMOND_GEOMETRY.height;

export const POSITION_COORDS: Record<Position, { x: number; y: number }> = {
  CATCHER: { x: 200, y: 452 },
  PITCHER: { x: 200, y: 338 },
  FIRST_BASE: { x: 292, y: 300 },
  SECOND_BASE: { x: 232, y: 252 },
  SHORTSTOP: { x: 168, y: 252 },
  THIRD_BASE: { x: 108, y: 300 },
  LEFT_FIELD: { x: 75, y: 130 },
  CENTER_FIELD: { x: 200, y: 75 },
  RIGHT_FIELD: { x: 325, y: 130 },
};

/// Only the first name goes on the diamond. Markers sit as little as 60px
/// apart, so a full name overruns its neighbour; the batting order list
/// alongside carries the full name. Falls back to the whole string for a
/// single-token name.
function shortName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

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
      <circle
        r={MARKER_RADIUS}
        className={style ? style.markerClassName : "fill-card stroke-border"}
        strokeWidth={style ? style.markerStrokeWidth : 1.5}
        strokeDasharray={player ? undefined : "4 3"}
      />

      {/* Position abbreviation sits inside the marker — POSITION_LABELS is the
          only source for these, per AGENTS.md. */}
      <text
        textAnchor="middle"
        dy={4}
        className="fill-foreground text-[11px] font-bold"
      >
        {POSITION_LABELS[position]}
      </text>

      <text
        y={NAME_OFFSET}
        textAnchor="middle"
        fill="currentColor"
        className={
          style
            ? `text-[11px] font-medium ${style.nameClassName}`
            : "fill-muted-foreground text-[11px] italic"
        }
      >
        {player ? shortName(player.playerName) : "Open"}
      </text>

      {style ? (
        <text
          y={TAG_OFFSET}
          textAnchor="middle"
          fill="currentColor"
          className={`text-[9px] ${style.tagClassName}`}
        >
          {style.label}
        </text>
      ) : null}
    </g>
  );
}

export function Diamond({
  byPosition,
}: {
  byPosition: Map<Position, ChartViewPlayer>;
}) {
  return (
    <>
      {/* aria-hidden with an sr-only list below: screen readers announce an
          SVG's aria-label and nothing inside it, so the assignments would
          otherwise be unreachable without sight. */}
      <svg
        viewBox={`0 0 400 ${VIEWBOX_HEIGHT}`}
        aria-hidden="true"
        focusable="false"
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

      <ul className="sr-only">
        {ALL_POSITIONS.map((position) => {
          const player = byPosition.get(position);
          return (
            <li key={position}>
              {POSITION_LABELS[position]}:{" "}
              {player
                ? `${player.playerName}, ${RSVP_STYLE[player.rsvpState].label}`
                : "Open"}
            </li>
          );
        })}
      </ul>
    </>
  );
}
