import {
  DIAMOND_GEOMETRY,
  POSITION_COORDS,
  deepZoneFits,
  outfieldHaloRadius,
  outfieldSpotCoords,
  outfieldZoneCoords,
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
  OUTFIELD_POSITIONS,
  OUTFIELD_ZONE_LABEL,
  POSITION_LABELS,
} from "@/lib/positions";

/// The labeled diamond, server-rendered as inline SVG — no image asset, no
/// client JS, crisp on any phone. Coordinates come from
/// `@/components/diamond-geometry`, shared with the drag editor (#11).

const EMPTY_GUARDED: ReadonlySet<string> = new Set();

/// One outfielder as the SVG draws them: who, what abbreviation goes inside
/// their circle, and where they stand. The three layouts below all produce
/// this same shape, so the render and the halo measurement never have to know
/// which one ran.
type OutfieldMarker = {
  player: ChartViewPlayer;
  label: string;
  x: number;
  y: number;
};

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
  /// The ring's radius, or null when the guarded markers stand too close
  /// together for one to fit. Fixed positions always get
  /// `DIAMOND_GEOMETRY.haloRadius`; the outfield's shrinks as its markers pack
  /// closer (`outfieldHaloRadius`).
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
  /// Seated players, keyed by position — a list per spot, because an allPlay
  /// team's LF/CF/RF each stack to three. Only ever holds spots this team
  /// fields: `buildChartView` pools the rest, including an allPlay team's
  /// stale CATCHER row, so the markers below cannot collide with the zone.
  byPosition: Map<Position, ChartViewPlayer[]>;
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
  // An allPlay team fields no catcher — the coach pitches — so C is drawn as
  // the disc, never as "Open" (#11, Decision 1). Its LF/CF/RF are real spots
  // since the named-outfield revision, but they draw differently from the
  // fixed positions: a spot seats up to three (fanned around the coordinate
  // via `outfieldSpotCoords`), and an EMPTY one draws nothing at all — the
  // spots are optional, the general zone still covers the grass, and an
  // "Open" marker would both claim a hole nobody is required to fill and
  // collide with the zone drawn at those same coordinates.
  const drawn = allPlay ? ALL_PLAY_INFIELD_POSITIONS : ALL_POSITIONS;
  const spots: readonly [Position, ChartViewPlayer[]][] = allPlay
    ? OUTFIELD_POSITIONS.map(
        (position) => [position, byPosition.get(position) ?? []] as const,
      )
    : [];
  const pinned = spots.flatMap(([position, players]) =>
    players.map((player) => ({ position, player })),
  );
  const zone = allPlay ? outfield : [];

  // Three ways the outfield can be laid out, and the third one exists because
  // the second cannot always fit.
  //
  //   - Nothing pinned: the zone takes its own two rows, whose shallow row IS
  //     the LF/CF/RF coordinates. An all-unpinned outfield of three therefore
  //     reads as the standard diamond, which is the point.
  //   - Something pinned, and the rest fit below: pinned kids fan around their
  //     spot and the zone drops to its deep row, because a shallow zone marker
  //     would land on top of them.
  //   - Something pinned and the rest DON'T fit (`deepZoneFits`): one deep row
  //     is all there is, and nine in it overlap. So this board gives up the
  //     pinned coordinates and lays every outfielder — pinned and unpinned —
  //     out in the ordinary two-row zone, each keeping its own label. The
  //     assignment is still readable (the marker says LF, not OF); only the
  //     exact spot is spent, which is the right thing to spend when the
  //     alternative is two names drawn on one point.
  //
  // Reachable without an outlandish roster: pinning outfielders before placing
  // the infield leaves nine unpinned on a twelve-player team.
  const crowded = pinned.length > 0 && !deepZoneFits(zone.length);
  const outfieldMarkers: OutfieldMarker[] = crowded
    ? (() => {
        const everyone = [
          ...pinned.map(({ position, player }) => ({
            player,
            label: POSITION_LABELS[position],
          })),
          ...zone.map((player) => ({ player, label: OUTFIELD_ZONE_LABEL })),
        ];
        return outfieldZoneCoords(everyone.length).map((coord, index) => ({
          ...everyone[index],
          ...coord,
        }));
      })()
    : [
        ...spots.flatMap(([position, players]) =>
          outfieldSpotCoords(position, players.length).map((coord, index) => ({
            player: players[index],
            label: POSITION_LABELS[position],
            ...coord,
          })),
        ),
        ...outfieldZoneCoords(zone.length, { deep: pinned.length > 0 }).map(
          (coord, index) => ({
            player: zone[index],
            label: OUTFIELD_ZONE_LABEL,
            ...coord,
          }),
        ),
      ];

  // One radius for the whole outfield, measured around the guarded markers
  // themselves: a crowded cluster on the far side of the field must not erase
  // the ring around a kid standing alone at LF. Fixed positions keep the full
  // radius — they are budgeted for it in DIAMOND_GEOMETRY.
  const guardedMarkers = outfieldMarkers.filter((marker) =>
    guardedPlayerIds.has(marker.player.playerId),
  );
  const outfieldHalo = outfieldHaloRadius(outfieldMarkers, guardedMarkers);

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
          // A fixed position seats one player; the array is the outfield
          // spots' shape, which render through spotMarkers below.
          const player = byPosition.get(position)?.[0];
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

        {outfieldMarkers.map(({ player, label, x, y }) => (
          <Marker
            key={player.playerId}
            x={x}
            y={y}
            label={label}
            player={player}
            showRsvp={showRsvp}
            isGuarded={guardedPlayerIds.has(player.playerId)}
            haloRadius={outfieldHalo}
          />
        ))}
      </svg>

      {/* The halo is decoration; this is where the same fact exists as words.
          A screen reader gets no benefit from a yellow ring, and design-plan.md
          §10's rule is that state is always colour *plus* a label. */}
      <ul className="sr-only">
        {allPlay ? <li>{NO_CATCHER_TEXT}</li> : null}
        {drawn.map((position) => {
          const player = byPosition.get(position)?.[0];
          return (
            <li key={position}>
              {POSITION_LABELS[position]}:{" "}
              {player ? announce(player, showRsvp, guardedPlayerIds) : "Open"}
            </li>
          );
        })}
        {spots
          .filter(([, players]) => players.length > 0)
          .map(([position, players]) => (
            <li key={position}>
              {POSITION_LABELS[position]}:{" "}
              {players
                .map((player) => announce(player, showRsvp, guardedPlayerIds))
                .join("; ")}
            </li>
          ))}
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
