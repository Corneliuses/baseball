import {
  DIAMOND_GEOMETRY,
  POSITION_COORDS,
  outfieldZoneCoords,
} from "@/components/diamond-geometry";
import { FieldArt } from "@/components/FieldArt";
import { GUARDED_STYLE } from "@/components/guarded-style";
import type { Position } from "@/generated/prisma/enums";
import { OUTFIELD_ZONE_LABEL, POSITION_LABELS } from "@/lib/positions";

/// The crop window, in field units — a wide strip of the 400×520 board framed
/// around one spot. Sized so the marker and its halo dominate the frame with
/// enough grass, chalk and dirt around them to read as *the field*, not as an
/// abstract circle: the halo reaches haloRadius + haloStrokeWidth/2 = 26.5
/// from centre, so a 110-tall window leaves roughly a marker's height of
/// context above and below.
export const HERO_CROP = { width: 240, height: 110 } as const;

/// The SVG viewBox for a hero framed on `center`, clamped to the board so the
/// window never pans past the field's edge into blank space — a corner
/// outfielder sits off-centre in their frame instead, which is also how a
/// photographer would crop them.
export function heroViewBox(center: { x: number; y: number }): string {
  const x = clamp(center.x - HERO_CROP.width / 2, 0, DIAMOND_GEOMETRY.width - HERO_CROP.width);
  const y = clamp(center.y - HERO_CROP.height / 2, 0, DIAMOND_GEOMETRY.height - HERO_CROP.height);
  return `${x} ${y} ${HERO_CROP.width} ${HERO_CROP.height}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Team home's player-card hero (#48 follow-up): the reader's own kid standing
 * on the painted field, cropped to their spot. The whole point is that this is
 * the *same* field the lineup pages draw — `FieldArt` and `POSITION_COORDS`,
 * not a new illustration — so the card is a close-up of the board the parent
 * opens next, never a third diamond that could drift.
 *
 * Where the kid stands follows the diamonds' own rules: a fielded position at
 * its `POSITION_COORDS` spot, and everyone else on an allPlay team in the
 * outfield zone — framed at `outfieldZoneCoords(1)`, the zone's dead-centre,
 * because this kid has the hero's field to themselves. A player the chart
 * seats nowhere gets no hero at all (the caller's decision): the diamond
 * never draws a spot nobody assigned, and neither does its close-up.
 *
 * The marker wears the kid's **jersey number** in the JerseyDot colours rather
 * than the position abbreviation the big boards use — on a card celebrating
 * one child, the number is the identity and the marquee right below already
 * names the position. With no number on file it falls back to the position
 * label, from `POSITION_LABELS` as always. The halo is the guarded ring from
 * /view, banana by the same trade: this card's field keeps a chalk fence so
 * the yellow belongs to the kid.
 *
 * Decoration only — aria-hidden, like `FieldArt` itself: the card's text
 * (name, number, marquee) is where every fact here exists as words.
 */
export function MiniDiamondHero({
  position,
  jerseyNumber,
}: {
  /// The kid's fielded position, or null for the allPlay outfield zone. The
  /// caller — not this component — decides that a kid with no field spot on a
  /// selective team renders no hero rather than an invented one.
  position: Position | null;
  jerseyNumber: number | null;
}) {
  const center = position ? POSITION_COORDS[position] : outfieldZoneCoords(1)[0];
  const label = position ? POSITION_LABELS[position] : OUTFIELD_ZONE_LABEL;

  return (
    <svg
      viewBox={heroViewBox(center)}
      aria-hidden="true"
      focusable="false"
      className="block w-full"
    >
      {/* Chalk fence, unconditionally: this hero exists only for a kid the
          chart seats, so the card's banana is already spent on them — the
          halo here and the marquee below are one treatment of one child,
          the way /view's halo, row border and chip are. */}
      <FieldArt fence="chalk" />

      {/* The outer <g> owns the positioning transform and must keep owning
          it: a CSS transform overrides an SVG transform attribute, so the
          step-up animation goes on the inner <g> — on the outer one it would
          teleport the marker to the field's origin. */}
      <g transform={`translate(${center.x} ${center.y})`}>
        <g className="animate-step-up">
          <circle
            r={DIAMOND_GEOMETRY.haloRadius}
            className={GUARDED_STYLE.haloClassName}
            strokeWidth={DIAMOND_GEOMETRY.haloStrokeWidth}
          />
          {jerseyNumber !== null ? (
            <>
              {/* The JerseyDot motif, drawn in SVG at marker scale: a number
                  on this team looks like the back of a shirt everywhere,
                  including standing on the grass. */}
              <circle r={DIAMOND_GEOMETRY.markerRadius} className="fill-foreground" />
              <text
                textAnchor="middle"
                dy={6}
                className="fill-background font-mono text-[17px] font-bold"
              >
                {jerseyNumber}
              </text>
            </>
          ) : (
            <>
              {/* No number on file: the big boards' marker instead, so the
                  fallback is a vocabulary the parent has already seen. */}
              <circle
                r={DIAMOND_GEOMETRY.markerRadius}
                className="fill-card/80 stroke-muted-foreground"
                strokeWidth={1.5}
              />
              <text
                textAnchor="middle"
                dy={4}
                className="fill-foreground text-[11px] font-bold"
              >
                {label}
              </text>
            </>
          )}
        </g>
      </g>
    </svg>
  );
}
