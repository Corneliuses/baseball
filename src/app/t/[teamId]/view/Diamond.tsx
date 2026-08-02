import {
  DIAMOND_GEOMETRY,
  DIAMOND_POLYGON,
  POSITION_COORDS,
} from "@/components/diamond-geometry";
import { RSVP_STYLE } from "@/components/rsvp-style";
import type { Position } from "@/generated/prisma/enums";
import type { ChartViewPlayer } from "@/lib/chart-view";
import {
  INFIELD_POSITIONS,
  OUTFIELD_POSITIONS,
  POSITION_LABELS,
} from "@/lib/positions";

/// The labeled diamond, server-rendered as inline SVG — no image asset, no
/// client JS, crisp on any phone. Coordinates come from
/// `@/components/diamond-geometry`, shared with the drag editor (#11).

const MARKER_RADIUS = DIAMOND_GEOMETRY.markerRadius;
const NAME_OFFSET = DIAMOND_GEOMETRY.nameOffset;
const TAG_OFFSET = DIAMOND_GEOMETRY.tagOffset;
const VIEWBOX_HEIGHT = DIAMOND_GEOMETRY.height;

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

/**
 * On an allPlay team the outfield is one zone rather than three named spots,
 * so everyone not on the infield stands out there and persists as
 * `position = null` (#11, Decision 1). Drawing LF/CF/RF as "Open" would be
 * doubly wrong for those teams: the spots aren't open, and the kids filling
 * them would be missing from the diamond entirely — which is the one thing a
 * parent opens this page to see.
 *
 * A stale named-outfield row (hand-set during #9, or left over from before
 * allPlay was switched on) still draws its marker, so nothing silently
 * vanishes before the coach's next save collapses it.
 */
function outfieldPositionsToDraw(
  allPlay: boolean,
  byPosition: Map<Position, ChartViewPlayer>,
): readonly Position[] {
  return allPlay
    ? OUTFIELD_POSITIONS.filter((position) => byPosition.has(position))
    : OUTFIELD_POSITIONS;
}

export function Diamond({
  byPosition,
  allPlay,
  outfield = [],
}: {
  byPosition: Map<Position, ChartViewPlayer>;
  allPlay: boolean;
  /// Players with no position. Rendered as the outfield zone on an allPlay
  /// team, and ignored otherwise — a benched player belongs in neither.
  outfield?: readonly ChartViewPlayer[];
}) {
  const drawn = [
    ...INFIELD_POSITIONS,
    ...outfieldPositionsToDraw(allPlay, byPosition),
  ];
  const zone = allPlay ? outfield : [];

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
          points={DIAMOND_POLYGON}
          className="fill-none stroke-border"
          strokeWidth={2}
        />

        {drawn.map((position) => (
          <PositionMarker
            key={position}
            position={position}
            player={byPosition.get(position)}
          />
        ))}
      </svg>

      {zone.length > 0 ? (
        <div className="mx-auto mt-2 w-full max-w-sm">
          <h4 className="mb-1 text-center text-xs font-medium text-muted-foreground">
            Outfield
          </h4>
          <div className="flex flex-wrap justify-center gap-2">
            {zone.map((player) => {
              const style = RSVP_STYLE[player.rsvpState];
              return (
                <span
                  key={player.playerId}
                  className={`rounded border border-border px-2 py-1 text-xs font-medium ${style.nameClassName}`}
                >
                  {player.playerName}
                  <span className={`ml-1 ${style.tagClassName}`}>
                    {style.label}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      <ul className="sr-only">
        {drawn.map((position) => {
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
        {zone.length > 0 ? (
          <li>
            Outfield:{" "}
            {zone
              .map(
                (player) =>
                  `${player.playerName}, ${RSVP_STYLE[player.rsvpState].label}`,
              )
              .join("; ")}
          </li>
        ) : null}
      </ul>
    </>
  );
}
