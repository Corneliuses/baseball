import { CourtArt } from "@/components/CourtArt";
import {
  COURT_GEOMETRY,
  COURT_SPOT_COORDS,
} from "@/components/court-geometry";
import { DIAMOND_GEOMETRY } from "@/components/diamond-geometry";
import { GUARDED_STYLE } from "@/components/guarded-style";
import { heroViewBox } from "@/components/MiniDiamondHero";
import type { CourtPosition } from "@/generated/prisma/enums";
import { COURT_POSITION_LABELS } from "@/lib/court-positions";

/// How far above the kid the court hero's window is centred, in court units.
/// The diamond's spots all have chalk or dirt around them; a guard at the top
/// of the key does not, and a window centred on them is bare floorboards. Lifted
/// toward the basket, the three-point arc comes into frame and the strip reads
/// as a court. Bounded by the halo: 110 / 2 - 26.5 leaves 28.5 before the ring
/// would clip the window's bottom edge.
export const COURT_HERO_LIFT = 25;

/// The court hero's viewBox for a starting position.
export function courtHeroViewBox(position: CourtPosition): string {
  const { x, y } = COURT_SPOT_COORDS[position];
  return heroViewBox({ x, y: y - COURT_HERO_LIFT }, COURT_GEOMETRY);
}

/**
 * Basketball's player-card hero on team home: the reader's own kid standing
 * on the painted half court, cropped to their starting spot. The counterpart
 * of `MiniDiamondHero`, and built the same way — `CourtArt` and
 * `COURT_SPOT_COORDS`, the court Game Day draws, never a new illustration — so
 * the card is a close-up of the board the parent opens next.
 *
 * Only a starter gets one. A bench kid stands nowhere on the court, and the
 * close-up never draws a spot the chart didn't assign (the caller's decision,
 * as with the diamond).
 *
 * The marker is the field hero's at the field hero's scale — the jersey number
 * in the JerseyDot colours, the position label when no number is on file,
 * ringed by the guarded halo — so a family with a kid in each sport sees one
 * card, not two dialects of it. The rim draws in court-line white: the halo
 * and the marquee below are this card's one banana, as the chalk fence is on
 * the diamond's hero.
 *
 * Decoration only — aria-hidden, like `CourtArt` itself: the card's text says
 * every fact here in words.
 */
export function MiniCourtHero({
  position,
  jerseyNumber,
}: {
  position: CourtPosition;
  jerseyNumber: number | null;
}) {
  const center = COURT_SPOT_COORDS[position];

  return (
    <svg
      viewBox={courtHeroViewBox(position)}
      aria-hidden="true"
      focusable="false"
      className="block w-full"
    >
      <CourtArt rim="line" />

      {/* Positioning on the outer <g>, animation on the inner one: a CSS
          transform overrides an SVG transform attribute. */}
      <g transform={`translate(${center.x} ${center.y})`}>
        <g className="animate-step-up">
          <circle
            r={DIAMOND_GEOMETRY.haloRadius}
            className={GUARDED_STYLE.haloClassName}
            strokeWidth={DIAMOND_GEOMETRY.haloStrokeWidth}
          />
          <circle r={DIAMOND_GEOMETRY.markerRadius} className="fill-foreground" />
          {jerseyNumber !== null ? (
            <text
              textAnchor="middle"
              dy={6}
              className="fill-background font-mono text-[17px] font-bold"
            >
              {jerseyNumber}
            </text>
          ) : (
            // No number on file: the position label Game Day's court wears,
            // in the same foreground pill colours.
            <text
              textAnchor="middle"
              dy={4}
              className="fill-background font-mono text-[11px] font-bold"
            >
              {COURT_POSITION_LABELS[position]}
            </text>
          )}
        </g>
      </g>
    </svg>
  );
}
