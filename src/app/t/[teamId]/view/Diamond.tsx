import {
  DIAMOND_GEOMETRY,
  POSITION_COORDS,
  outfieldZoneCoords,
  zoneHaloRadius,
} from "@/components/diamond-geometry";
import { FieldArt } from "@/components/FieldArt";
import {
  NO_CATCHER_TEXT,
  NoCatcherMarker,
} from "@/components/NoCatcherMarker";
import {
  GUARDED_STYLE,
  YOUR_PLAYER_SR_SUFFIX,
} from "@/components/guarded-style";
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

const EMPTY_GUARDED: ReadonlySet<string> = new Set();

const MARKER_RADIUS = DIAMOND_GEOMETRY.markerRadius;
const NAME_OFFSET = DIAMOND_GEOMETRY.nameOffset;
const TAG_OFFSET = DIAMOND_GEOMETRY.tagOffset;

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
  isGuarded = false,
  haloRadius = DIAMOND_GEOMETRY.haloRadius,
}: {
  x: number;
  y: number;
  label: string;
  player: ChartViewPlayer | undefined;
  showRsvp: boolean;
  /// True when the viewer is one of this player's guardians — the page's whole
  /// point (#49). Purely a property of who is reading, never of the roster
  /// spot, so nothing here is stored.
  isGuarded?: boolean;
  /// The ring's radius, or null when the board is too crowded for one to fit.
  /// Fixed positions always get `DIAMOND_GEOMETRY.haloRadius`; the outfield
  /// zone's shrinks with the count (`zoneHaloRadius`), because that zone packs
  /// its markers closer as the roster grows.
  haloRadius?: number | null;
}) {
  const style = player ? RSVP_STYLE[player.rsvpState] : null;

  return (
    // The outer <g> owns the positioning transform and must keep owning it:
    // a CSS transform overrides an SVG transform attribute, so the reveal
    // animation goes on the inner <g> below. Putting `animate-step-up` here
    // would drop every guarded marker at the origin.
    <g transform={`translate(${x} ${y})`}>
      <g className={isGuarded ? "animate-step-up" : undefined}>
        {isGuarded && haloRadius !== null ? (
          // Behind the marker, so the opaque fill covers its inner edge and it
          // reads as a ring rather than a second circle. This is /view's one
          // banana — FieldArt draws a chalk fence here to pay for it.
          <circle
            r={haloRadius}
            className={GUARDED_STYLE.haloClassName}
            strokeWidth={DIAMOND_GEOMETRY.haloStrokeWidth}
          />
        ) : null}

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
              ? `text-halo text-[11px] ${
                  isGuarded
                    ? GUARDED_STYLE.markerNameClassName
                    : "font-medium"
                } ${style.markerNameClassName}`
              : "text-halo fill-muted-foreground text-[11px] italic"
          }
        >
          {player ? player.diamondName : "Open"}
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
    </g>
  );
}

/// One player as a screen reader hears them: name, RSVP state when there is a
/// game to respond to, and — for the reader's own child — the plain-text
/// counterpart of the halo. The full name, not `diamondName`: the abbreviation
/// exists only because a marker is 40px wide, and a screen reader has no such
/// constraint.
function announce(
  player: ChartViewPlayer,
  showRsvp: boolean,
  guardedPlayerIds: ReadonlySet<string>,
): string {
  const state = showRsvp ? `, ${RSVP_STYLE[player.rsvpState].label}` : "";
  const guarded = guardedPlayerIds.has(player.playerId)
    ? ` ${YOUR_PLAYER_SR_SUFFIX}`
    : "";

  return `${player.playerName}${state}${guarded}`;
}

export function Diamond({
  byPosition,
  allPlay,
  outfield = [],
  showRsvp = true,
  guardedPlayerIds = EMPTY_GUARDED,
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
  /// The players this viewer is a guardian of, already intersected with this
  /// team's roster upstream (`guardedRosteredPlayerIds`). Empty for a coach
  /// with no kid on the team, which is what makes their diamond identical to
  /// the one they saw before #49.
  guardedPlayerIds?: ReadonlySet<string>;
}) {
  // An allPlay team fields neither a catcher nor three named outfielders: the
  // coach pitches, and the outfield is one zone holding everyone the infield
  // leaves over (#11, Decision 1). Drawing C or LF/CF/RF as "Open" would be
  // doubly wrong for them — the spots aren't open, they don't exist — so those
  // players come from `outfield` instead, and C gets the disc.
  const drawn = allPlay ? ALL_PLAY_INFIELD_POSITIONS : ALL_POSITIONS;
  const zone = allPlay ? outfield : [];
  const zoneCoords = outfieldZoneCoords(zone.length);
  // One radius for the whole zone: it is a function of how many markers share
  // those two rows, not of which marker is guarded.
  const zoneHalo = zoneHaloRadius(zone.length);

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
            chalk basepaths that the bare polygon used to be.

            The fence is where this page pays for the guarded-player halo, and
            it pays only when there is a halo to pay for. design-plan.md §2 asks
            for *exactly* one banana per screen, which cuts both ways: on the
            page whose whole job is "where is my kid" that banana belongs to the
            kid rather than the outfield wall, but a reader with no kid on this
            team has no halo, and handing back the fence too would leave them
            looking at a screen with none at all. So the budget follows the
            child, and where there is no child to follow it stays on the wall —
            which is also what keeps that reader's page unchanged (#49 AC5). */}
        <FieldArt fence={guardedPlayerIds.size > 0 ? "chalk" : "banana"} />

        {allPlay ? <NoCatcherMarker /> : null}

        {drawn.map((position) => {
          const { x, y } = POSITION_COORDS[position];
          const player = byPosition.get(position);
          return (
            <Marker
              key={position}
              x={x}
              y={y}
              label={POSITION_LABELS[position]}
              player={player}
              showRsvp={showRsvp}
              isGuarded={player ? guardedPlayerIds.has(player.playerId) : false}
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
            isGuarded={guardedPlayerIds.has(player.playerId)}
            haloRadius={zoneHalo}
          />
        ))}
      </svg>

      {/* The halo is decoration; this is where the same fact exists as words.
          A screen reader gets no benefit from a yellow ring, and design-plan.md
          §10's rule is that state is always colour *plus* a label. */}
      <ul className="sr-only">
        {allPlay ? <li>{NO_CATCHER_TEXT}</li> : null}
        {drawn.map((position) => {
          const player = byPosition.get(position);
          return (
            <li key={position}>
              {POSITION_LABELS[position]}:{" "}
              {player ? announce(player, showRsvp, guardedPlayerIds) : "Open"}
            </li>
          );
        })}
        {zone.length > 0 ? (
          <li>
            Outfield:{" "}
            {zone
              .map((player) => announce(player, showRsvp, guardedPlayerIds))
              .join("; ")}
          </li>
        ) : null}
      </ul>
    </>
  );
}
