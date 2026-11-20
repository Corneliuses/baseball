"use client";

import { useId } from "react";

import {
  StepCaptionAndControls,
  useLoopClock,
} from "@/components/animation-playback";
import {
  BALL_RADIUS_FT,
  WALL_DEPTH,
  sceneHeight,
  skillDurationSeconds,
  skillFrameHoldSeconds,
  skillSnapshot,
  type FloorPoint,
  type Hand,
  type Skill,
} from "@/lib/skills";

/// Every scene is drawn into the same box, so every card is the same shape;
/// a wider patch of floor just means fewer SVG units to the foot.
const VIEW_WIDTH = 400;
const PLANK = 14;

/// The kid, in feet before `figureScale`: shoulders, head, feet and how far
/// out from the middle an arm starts.
const SHOULDER_RX = 0.62;
const SHOULDER_RY = 0.32;
const HEAD_R = 0.33;
const SHOULDER_X = 0.52;
const FOOT_X = 0.42;
const ARM_REACH = 2.6;

/**
 * One at-home skill running, seen from above: the kid, their ball, and the
 * cones or wall the skill uses, on a patch of floor. The drill counterpart of
 * `PlayAnimation`, sharing its clock and controls (`animation-playback.tsx`).
 *
 * Every position comes from `skillSnapshot` (src/lib/skills.ts), which is
 * pure and tested. Arms are drawn from the kid's shoulders to the ball for
 * each hand the snapshot says is on it, which is what lets a parent see
 * "right hand only" versus "both hands" from above.
 *
 * Spends **no banana**, like the playbook: the ball is the team's primary and
 * the tape mark court-line white, because a skills page holds up to five of
 * these and design-plan §2's budget is one per screen.
 *
 * The SVG is decoration for a screen reader; the ordered list of captions
 * under it is the skill's real content.
 */
export function SkillAnimation({ skill }: { skill: Skill }) {
  const clipId = `${useId()}-floor`;
  const { seconds, playing, containerRef, togglePlaying, seekPaused } =
    useLoopClock(skillDurationSeconds(skill), skill.id);
  const snapshot = skillSnapshot(skill, seconds);
  const { frameIndex } = snapshot;
  const { scene } = skill;

  const ft = VIEW_WIDTH / scene.width;
  const viewHeight = sceneHeight(scene) * ft;
  const figure = Math.max(1, scene.width / 10) * ft;
  const px = (point: FloorPoint) => ({ x: point.x * ft, y: point.y * ft });

  const planks: number[] = [];
  for (let x = PLANK; x < VIEW_WIDTH; x += PLANK * 2) {
    planks.push(x);
  }

  // The step being run (or just finished), traced the way the playbook traces
  // a cut: a dashed line where the kid travels, and another where a loose
  // ball flies (to the wall and back, or across on a crossover).
  const from = frameIndex > 0 ? skill.frames[frameIndex - 1] : null;
  const to = skill.frames[frameIndex];
  const kidMoved = from && (from.kid.x !== to.kid.x || from.kid.y !== to.kid.y);
  const ballFlew =
    from?.ball &&
    to.ball &&
    (from.hands.length === 0 || to.hands.length === 0);

  const kid = px(snapshot.kid);
  const ball = snapshot.ball ? px(snapshot.ball) : null;

  const arm = (hand: Hand) => {
    if (!ball) {
      return null;
    }
    const side = hand === "right" ? 1 : -1;
    const shoulder = { x: kid.x + side * SHOULDER_X * figure, y: kid.y };
    const dx = ball.x - shoulder.x;
    const dy = ball.y - shoulder.y;
    const length = Math.hypot(dx, dy);
    const reach = Math.min(1, (ARM_REACH * figure) / Math.max(length, 1));
    return (
      <line
        key={hand}
        x1={shoulder.x}
        y1={shoulder.y}
        x2={shoulder.x + dx * reach}
        y2={shoulder.y + dy * reach}
        className="stroke-foreground"
        strokeWidth={0.2 * figure}
        strokeLinecap="round"
        data-arm={hand}
      />
    );
  };

  return (
    <div ref={containerRef} className="space-y-3">
      <div
        className="relative mx-auto w-full max-w-sm"
        style={{ aspectRatio: `${VIEW_WIDTH} / ${viewHeight}` }}
        aria-hidden="true"
      >
        <svg
          viewBox={`0 0 ${VIEW_WIDTH} ${viewHeight}`}
          focusable="false"
          className="absolute inset-0 h-full w-full"
          data-skill-floor={skill.id}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={VIEW_WIDTH} height={viewHeight} rx={6} />
            </clipPath>
          </defs>

          <g clipPath={`url(#${clipId})`}>
            <rect
              x={0}
              y={0}
              width={VIEW_WIDTH}
              height={viewHeight}
              className="fill-hardwood"
            />
            {planks.map((x) => (
              <rect
                key={x}
                x={x}
                y={0}
                width={PLANK}
                height={viewHeight}
                className="fill-hardwood-grain"
              />
            ))}

            {scene.wall ? (
              <g data-wall="">
                <rect
                  x={0}
                  y={0}
                  width={VIEW_WIDTH}
                  height={WALL_DEPTH * ft}
                  className="fill-court-paint"
                />
                {/* The tape mark to aim at, on the face of the wall. */}
                <rect
                  x={(scene.wall.spotX - 0.45) * ft}
                  y={WALL_DEPTH * ft - 5}
                  width={0.9 * ft}
                  height={5}
                  className="fill-court-line"
                  data-spot=""
                />
              </g>
            ) : null}

            {(scene.cones ?? []).map((cone, index) => {
              const point = px(cone);
              return (
                <g
                  key={index}
                  transform={`translate(${point.x} ${point.y})`}
                  data-cone=""
                >
                  <circle
                    r={0.38 * figure}
                    className="fill-court-paint stroke-court-line"
                    strokeWidth={2}
                  />
                  <circle r={0.12 * figure} className="fill-court-line" />
                </g>
              );
            })}
          </g>

          {from && kidMoved ? (
            <line
              x1={from.kid.x * ft}
              y1={from.kid.y * ft}
              x2={to.kid.x * ft}
              y2={to.kid.y * ft}
              className="stroke-foreground/60"
              strokeWidth={3}
              strokeDasharray="10 8"
              strokeLinecap="round"
            />
          ) : null}
          {from?.ball && to.ball && ballFlew ? (
            <line
              x1={from.ball.x * ft}
              y1={from.ball.y * ft}
              x2={to.ball.x * ft}
              y2={to.ball.y * ft}
              className="stroke-primary"
              strokeWidth={3}
              strokeDasharray="4 6"
              strokeLinecap="round"
              data-ball-path=""
            />
          ) : null}

          <g data-kid="">
            {[-1, 1].map((side) => (
              <ellipse
                key={side}
                cx={kid.x + side * FOOT_X * figure}
                cy={kid.y - 0.12 * figure}
                rx={0.16 * figure}
                ry={0.3 * figure}
                className="fill-foreground/70"
              />
            ))}
            {snapshot.hands.map(arm)}
            <ellipse
              cx={kid.x}
              cy={kid.y}
              rx={SHOULDER_RX * figure}
              ry={SHOULDER_RY * figure}
              className="fill-foreground"
            />
            <circle
              cx={kid.x}
              cy={kid.y}
              r={HEAD_R * figure}
              className="fill-card stroke-foreground"
              strokeWidth={0.08 * figure}
            />
          </g>

          {ball ? (
            <circle
              cx={ball.x}
              cy={ball.y}
              r={BALL_RADIUS_FT * figure}
              className="fill-primary stroke-background"
              strokeWidth={2.5}
              data-ball=""
            />
          ) : null}
        </svg>
      </div>

      <StepCaptionAndControls
        playing={playing}
        onTogglePlaying={togglePlaying}
        frameIndex={frameIndex}
        captions={skill.frames.map((frame) => frame.caption)}
        onStep={(index) => seekPaused(skillFrameHoldSeconds(skill, index))}
      />
    </div>
  );
}
