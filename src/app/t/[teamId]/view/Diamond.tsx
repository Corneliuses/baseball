import {
  DIAMOND_GEOMETRY,
  POSITION_COORDS,
  outfieldZoneCoords,
} from "@/components/diamond-geometry";
import { FieldArt } from "@/components/FieldArt";
import {
  NO_CATCHER_TEXT,
  NoCatcherMarker,
} from "@/components/NoCatcherMarker";
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
  showRsvp,
}: {
  x: number;
  y: number;
  label: string;
  player: ChartViewPlayer | undefined;
  showRsvp: boolean;
}) {
  const style = player ? RSVP_STYLE[player.rsvpState] : null;

  return (
    <g transform={`translate(${x} ${y})`}>
      <circle
        r={MARKER_RADIUS}
        className={
          // Markers now sit on grass and dirt, so every circle carries an
          // opaque card fill — a tinted or transparent fill reads as a hole
          // in the field instead of a badge on it.
          style ? style.markerClassName : "fill-card/80 stroke-muted-foreground"
        }
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

      {/* text-halo paints a background-colored stroke behind the glyphs so
          names and tags stay readable on the grass (design-plan.md §6). */}
      <text
        y={NAME_OFFSET}
        textAnchor="middle"
        fill="currentColor"
        className={
          style
            ? `text-halo text-[11px] font-medium ${style.markerNameClassName}`
            : "text-halo fill-muted-foreground text-[11px] italic"
        }
      >
        {player ? shortName(player.playerName) : "Open"}
      </text>

      {style && showRsvp ? (
        <text
          y={TAG_OFFSET}
          textAnchor="middle"
          fill="currentColor"
          className={`text-halo text-[9px] font-semibold ${style.tagClassName}`}
        >
          {style.label}
        </text>
      ) : null}
    </g>
  );
}

export function Diamond({
  byPosition,
  allPlay,
  outfield = [],
  showRsvp = true,
}: {
  /// Seated players, keyed by position. Only ever holds spots this team
  /// fields — `buildChartView` pools the rest, including an allPlay team's
  /// stale LF/CF/RF or CATCHER row, so the markers below cannot collide with
  /// the zone drawn at those same coordinates.
  byPosition: Map<Position, ChartViewPlayer>;
  allPlay: boolean;
  /// Everyone the diamond doesn't seat. Drawn as the outfield zone on an
  /// allPlay team, and ignored otherwise — a benched player belongs on neither.
  outfield?: readonly ChartViewPlayer[];
  /// False when there is no upcoming game to respond to: the chart still
  /// draws, but the per-player RSVP tags come off — "No response" against no
  /// game would read as a team-wide silence rather than a bye week.
  showRsvp?: boolean;
}) {
  // An allPlay team fields neither a catcher nor three named outfielders: the
  // coach pitches, and the outfield is one zone holding everyone the infield
  // leaves over (#11, Decision 1). Drawing C or LF/CF/RF as "Open" would be
  // doubly wrong for them — the spots aren't open, they don't exist — so those
  // players come from `outfield` instead, and C gets the disc.
  const drawn = allPlay ? ALL_PLAY_INFIELD_POSITIONS : ALL_POSITIONS;
  const zone = allPlay ? outfield : [];
  const zoneCoords = outfieldZoneCoords(zone.length);

  return (
    <>
      {/* aria-hidden with an sr-only list below: screen readers announce an
          SVG's aria-label and nothing inside it, so the assignments would
          otherwise be unreachable without sight. */}
      <svg
        viewBox={`0 0 ${DIAMOND_GEOMETRY.width} ${DIAMOND_GEOMETRY.height}`}
        aria-hidden="true"
        focusable="false"
        className="mx-auto w-full max-w-sm"
      >
        {/* The painted field sits under every marker — FieldArt draws the
            chalk basepaths that the bare polygon used to be. */}
        <FieldArt />

        {allPlay ? <NoCatcherMarker /> : null}

        {drawn.map((position) => {
          const { x, y } = POSITION_COORDS[position];
          return (
            <Marker
              key={position}
              x={x}
              y={y}
              label={POSITION_LABELS[position]}
              player={byPosition.get(position)}
              showRsvp={showRsvp}
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
            showRsvp={showRsvp}
          />
        ))}
      </svg>

      <ul className="sr-only">
        {allPlay ? <li>{NO_CATCHER_TEXT}</li> : null}
        {drawn.map((position) => {
          const player = byPosition.get(position);
          return (
            <li key={position}>
              {POSITION_LABELS[position]}:{" "}
              {player
                ? showRsvp
                  ? `${player.playerName}, ${RSVP_STYLE[player.rsvpState].label}`
                  : player.playerName
                : "Open"}
            </li>
          );
        })}
        {zone.length > 0 ? (
          <li>
            Outfield:{" "}
            {zone
              .map((player) =>
                showRsvp
                  ? `${player.playerName}, ${RSVP_STYLE[player.rsvpState].label}`
                  : player.playerName,
              )
              .join("; ")}
          </li>
        ) : null}
      </ul>
    </>
  );
}
