import {
  DIAMOND_GEOMETRY,
  DIAMOND_POLYGON,
  POSITION_COORDS,
  diamondHeight,
  outfieldZoneCoords,
} from "@/components/diamond-geometry";
import { RSVP_STYLE } from "@/components/rsvp-style";
import type { Position } from "@/generated/prisma/enums";
import type { ChartViewPlayer } from "@/lib/chart-view";
import {
  ALL_PLAY_INFIELD_POSITIONS,
  ALL_POSITIONS,
  OUTFIELD_ZONE_LABEL,
  POSITION_LABELS,
} from "@/lib/positions";

/// The labeled diamond, server-rendered as inline SVG — no image asset, no
/// client JS, crisp on any phone. Coordinates come from
/// `@/components/diamond-geometry`, shared with the drag editor (#11).

const MARKER_RADIUS = DIAMOND_GEOMETRY.markerRadius;
const NAME_OFFSET = DIAMOND_GEOMETRY.nameOffset;
const TAG_OFFSET = DIAMOND_GEOMETRY.tagOffset;

/// Only the first name goes on the diamond. Markers sit as little as 60px
/// apart, so a full name overruns its neighbour; the batting order list
/// alongside carries the full name. Falls back to the whole string for a
/// single-token name.
function shortName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/// One circle on the grass: an abbreviation inside, the player's first name
/// under it, their RSVP state under that. Takes coordinates and a label rather
/// than a `Position`, because the allPlay outfield draws the same marker for
/// players who hold no position at all.
function Marker({
  x,
  y,
  label,
  player,
}: {
  x: number;
  y: number;
  label: string;
  player: ChartViewPlayer | undefined;
}) {
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
        {label}
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
 * Which named spots the diamond draws.
 *
 * An allPlay team fields neither a catcher nor three named outfielders: the
 * coach pitches, and the outfield is one zone holding everyone the infield
 * leaves over, persisting as `position = null` (#11, Decision 1). Drawing C or
 * LF/CF/RF as "Open" would be doubly wrong for those teams — the spots aren't
 * open, they don't exist, and the kids playing out there would be missing from
 * the diamond entirely, which is the one thing a parent opens this page to see.
 * `Diamond` draws them from the `outfield` prop instead.
 *
 * A stale row on one of those positions (hand-set during #9, or left over from
 * before allPlay was switched on) still draws its marker, so nothing silently
 * vanishes before the coach's next save collapses it.
 */
function positionsToDraw(
  allPlay: boolean,
  byPosition: Map<Position, ChartViewPlayer>,
): readonly Position[] {
  if (!allPlay) {
    return ALL_POSITIONS;
  }
  return ALL_POSITIONS.filter(
    (position) =>
      ALL_PLAY_INFIELD_POSITIONS.includes(position) || byPosition.has(position),
  );
}

export function Diamond({
  byPosition,
  allPlay,
  outfield = [],
}: {
  byPosition: Map<Position, ChartViewPlayer>;
  allPlay: boolean;
  /// Players with no position. Drawn as the outfield zone on an allPlay team,
  /// and ignored otherwise — a benched player belongs on neither.
  outfield?: readonly ChartViewPlayer[];
}) {
  const drawn = positionsToDraw(allPlay, byPosition);
  const zone = allPlay ? outfield : [];
  const zoneCoords = outfieldZoneCoords(zone.length);

  // Keyed on the marker, not on allPlay: a stale CATCHER row still draws one at
  // y=452 and still needs the taller box, or its name clips off the bottom.
  const height = diamondHeight(drawn.includes("CATCHER"));

  return (
    <>
      {/* aria-hidden with an sr-only list below: screen readers announce an
          SVG's aria-label and nothing inside it, so the assignments would
          otherwise be unreachable without sight. */}
      <svg
        viewBox={`0 0 ${DIAMOND_GEOMETRY.width} ${height}`}
        aria-hidden="true"
        focusable="false"
        className="mx-auto w-full max-w-sm"
      >
        <polygon
          points={DIAMOND_POLYGON}
          className="fill-none stroke-border"
          strokeWidth={2}
        />

        {drawn.map((position) => {
          const { x, y } = POSITION_COORDS[position];
          return (
            <Marker
              key={position}
              x={x}
              y={y}
              label={POSITION_LABELS[position]}
              player={byPosition.get(position)}
            />
          );
        })}

        {zone.map((player, index) => (
          <Marker
            key={player.playerId}
            x={zoneCoords[index].x}
            y={zoneCoords[index].y}
            label={OUTFIELD_ZONE_LABEL}
            player={player}
          />
        ))}
      </svg>

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
