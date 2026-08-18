import { useId } from "react";

import { DIAMOND_POLYGON, FIELD_ART } from "@/components/diamond-geometry";

/**
 * The painted ballfield (design-plan.md §6): grass wedge with mowed stripes,
 * warning track, banana-yellow fence, dirt infield with a grass diamond inside
 * the basepaths, chalk lines, bases, home plate, and the mound.
 *
 * Rendered by BOTH diamonds — the view page's and the drag editor's — inside
 * their existing 400×520 SVG, *before* the markers/targets, so it is pure
 * background. It draws no positions and no players: every coordinate that
 * means something lives in POSITION_COORDS, and this component only paints
 * underneath them.
 *
 * All colors go through the field tokens in globals.css (`--grass`, `--dirt`,
 * `--chalk`, …), so dark mode renders the same field as a night game with no
 * extra code here.
 *
 * Decoration only: parents get the real content from the markers and the
 * sr-only list, both owned by the callers — nothing here may grow a label.
 */
export function FieldArt() {
  // Both diamonds can never be on one page today, but the clip ids must still
  // be unique per render tree — useId works in server and client components.
  // Two clips, nested, because the park is the *intersection* of fair
  // territory and the fence arc: the wedge alone runs grass out to the corners
  // of the box, which reads as a field with no outfield wall.
  const id = useId();
  const wedgeId = `${id}-wedge`;
  const parkId = `${id}-park`;

  return (
    <g aria-hidden="true">
      <defs>
        <clipPath id={wedgeId}>
          <path d={FIELD_ART.fairTerritory} />
        </clipPath>
        <clipPath id={parkId}>
          <circle
            cx={FIELD_ART.homeCircle.x}
            cy={FIELD_ART.homeCircle.y}
            r={FIELD_ART.parkRadius}
          />
        </clipPath>
      </defs>

      <g clipPath={`url(#${wedgeId})`}>
        <g clipPath={`url(#${parkId})`}>
          <path d={FIELD_ART.fairTerritory} className="fill-grass" />

          {FIELD_ART.stripes.map((radius) => (
            <circle
              key={radius}
              cx={FIELD_ART.homeCircle.x}
              cy={FIELD_ART.homeCircle.y}
              r={radius}
              className="fill-none stroke-grass-stripe"
              strokeWidth={FIELD_ART.stripeWidth}
            />
          ))}

          <circle
            cx={FIELD_ART.homeCircle.x}
            cy={FIELD_ART.homeCircle.y}
            r={FIELD_ART.trackRadius}
            className="fill-none stroke-track"
            strokeWidth={FIELD_ART.trackWidth}
          />
          <circle
            cx={FIELD_ART.homeCircle.x}
            cy={FIELD_ART.homeCircle.y}
            r={FIELD_ART.fenceRadius}
            className="fill-none stroke-banana"
            strokeWidth={FIELD_ART.fenceWidth}
          />
        </g>
      </g>

      <path d={FIELD_ART.infieldDirt} className="fill-dirt" />
      <circle
        cx={FIELD_ART.homeCircle.x}
        cy={FIELD_ART.homeCircle.y}
        r={FIELD_ART.homeCircle.r}
        className="fill-dirt"
      />
      <path d={FIELD_ART.infieldGrass} className="fill-infield-grass" />
      <circle
        cx={FIELD_ART.mound.x}
        cy={FIELD_ART.mound.y}
        r={FIELD_ART.mound.r}
        className="fill-dirt"
      />

      <polygon
        points={DIAMOND_POLYGON}
        className="fill-none stroke-chalk"
        strokeWidth={2.5}
        strokeLinecap="round"
        opacity={0.9}
      />

      {FIELD_ART.foulLines.map((line) => (
        <path
          key={line}
          d={line}
          className="fill-none stroke-chalk"
          strokeWidth={3}
          strokeLinecap="round"
        />
      ))}

      {FIELD_ART.bases.map(({ x, y }) => (
        <rect
          key={`${x},${y}`}
          x={-FIELD_ART.baseSize / 2}
          y={-FIELD_ART.baseSize / 2}
          width={FIELD_ART.baseSize}
          height={FIELD_ART.baseSize}
          transform={`translate(${x} ${y}) rotate(45)`}
          className="fill-chalk stroke-dirt"
          strokeWidth={1}
        />
      ))}
      <path d={FIELD_ART.homePlate} className="fill-chalk stroke-dirt" strokeWidth={1} />
      <rect
        x={FIELD_ART.pitchingRubber.x}
        y={FIELD_ART.pitchingRubber.y}
        width={FIELD_ART.pitchingRubber.width}
        height={FIELD_ART.pitchingRubber.height}
        rx={1}
        className="fill-chalk"
      />
    </g>
  );
}
