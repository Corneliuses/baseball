import { useId } from "react";

import { COURT_ART, COURT_GEOMETRY } from "@/components/court-geometry";

/**
 * The painted half court (basketball's counterpart of `FieldArt`): maple
 * floorboards, a painted lane, the free-throw circle, the three-point arc, the
 * restricted area, backboard and rim, and half of the centre circle on the
 * bottom edge.
 *
 * Rendered by both depth-chart surfaces — Game Day and the editor — inside a
 * `COURT_GEOMETRY` viewBox, *before* the markers or drop targets, so it is pure
 * background. It draws no positions and no players; every coordinate that
 * means something lives in `COURT_SPOT_COORDS`.
 *
 * Colours go through the court tokens in globals.css (`--hardwood`,
 * `--court-paint`, `--court-line`), so dark mode is the same gym with the
 * lights down and no extra code here.
 *
 * The rim is the one loud element, and like `FieldArt`'s fence it is the
 * caller's banana to spend (design-plan.md §2): the editor keeps it, and Game
 * Day hands it back when the reader's own kid is wearing the halo instead.
 */
export function CourtArt({ rim = "banana" }: { rim?: "banana" | "line" } = {}) {
  const id = useId();
  const clipId = `${id}-court`;
  const { width, height } = COURT_GEOMETRY;
  const { basket, lane, backboard } = COURT_ART;

  const planks: number[] = [];
  for (let x = COURT_ART.plank; x < width; x += COURT_ART.plank * 2) {
    planks.push(x);
  }

  // The three-point line: straight down from the baseline at the arc's width,
  // then the arc around the basket. With a 19 ft 9 in radius the straight runs
  // are just the arc meeting the baseline square-on.
  const threeLeft = basket.x - COURT_ART.threeRadius;
  const threeRight = basket.x + COURT_ART.threeRadius;
  const threePath = `M ${threeLeft} 0 L ${threeLeft} ${basket.y} A ${COURT_ART.threeRadius} ${COURT_ART.threeRadius} 0 0 0 ${threeRight} ${basket.y} L ${threeRight} 0`;

  const ftY = lane.y + lane.height;
  const ftR = COURT_ART.freeThrowRadius;
  const restricted = COURT_ART.restrictedRadius;

  return (
    <g aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={width} height={height} rx={6} />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        <rect x={0} y={0} width={width} height={height} className="fill-hardwood" />
        {planks.map((x) => (
          <rect
            key={x}
            x={x}
            y={0}
            width={COURT_ART.plank}
            height={height}
            className="fill-hardwood-grain"
          />
        ))}

        <rect
          x={lane.x}
          y={lane.y}
          width={lane.width}
          height={lane.height}
          className="fill-court-paint stroke-court-line"
          strokeWidth={3}
        />

        {/* Free-throw circle: the half away from the basket solid, the half
            inside the lane dashed, as it is painted. */}
        <path
          d={`M ${basket.x - ftR} ${ftY} A ${ftR} ${ftR} 0 0 0 ${basket.x + ftR} ${ftY}`}
          className="fill-none stroke-court-line"
          strokeWidth={3}
        />
        <path
          d={`M ${basket.x - ftR} ${ftY} A ${ftR} ${ftR} 0 0 1 ${basket.x + ftR} ${ftY}`}
          className="fill-none stroke-court-line"
          strokeWidth={2}
          strokeDasharray="8 8"
          opacity={0.8}
        />

        <path d={threePath} className="fill-none stroke-court-line" strokeWidth={3} />

        <path
          d={`M ${basket.x - restricted} ${basket.y} A ${restricted} ${restricted} 0 0 0 ${basket.x + restricted} ${basket.y}`}
          className="fill-none stroke-court-line"
          strokeWidth={2}
        />

        <circle
          cx={width / 2}
          cy={height}
          r={COURT_ART.centerCircleRadius}
          className="fill-court-paint stroke-court-line"
          strokeWidth={3}
        />

        {/* Boundary: the baseline, both sidelines and the half-court line. */}
        <rect
          x={1.5}
          y={1.5}
          width={width - 3}
          height={height - 3}
          className="fill-none stroke-court-line"
          strokeWidth={3}
        />

        <line
          x1={backboard.x1}
          x2={backboard.x2}
          y1={backboard.y}
          y2={backboard.y}
          className="stroke-court-line"
          strokeWidth={4}
          strokeLinecap="round"
        />
        <circle
          cx={basket.x}
          cy={basket.y}
          r={COURT_ART.rimRadius}
          className={
            rim === "banana"
              ? "fill-none stroke-banana"
              : "fill-none stroke-court-line"
          }
          strokeWidth={3}
        />
      </g>
    </g>
  );
}
