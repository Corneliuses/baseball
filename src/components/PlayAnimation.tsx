"use client";

import { CourtArt } from "@/components/CourtArt";
import {
  StepCaptionAndControls,
  useLoopClock,
} from "@/components/animation-playback";
import { COURT_GEOMETRY } from "@/components/court-geometry";
import {
  frameHoldSeconds,
  playDurationSeconds,
  playSnapshot,
  type Play,
} from "@/lib/plays";

/// court-geometry.ts draws eight SVG units to the foot; plays are in feet.
const FT = 8;
const PLAYER_RADIUS = 2.1 * FT;
const BALL_RADIUS = 1.1 * FT;
/// The ball sits off its holder's shoulder rather than under the number, so a
/// held ball and a pass in the air both stay visible.
const BALL_OFFSET = { x: 1.7 * FT, y: 1.7 * FT };

/**
 * One play running on the half court: five numbered players moving through
 * the play's frames, the ball riding with its holder or flying on a pass, and
 * dashed lines showing where each player is headed on the current step.
 *
 * Every position comes from `playSnapshot` (src/lib/plays.ts), which is pure
 * and tested; this component only advances a clock with requestAnimationFrame
 * and asks it where everyone is. Motion isn't used, because what moves is SVG
 * coordinates on a loop, not a transition between two layouts.
 *
 * The clock, the controls, reduced motion and off-screen sleep come from
 * `animation-playback.tsx`, shared with `SkillAnimation`.
 *
 * - **No banana.** The rim is drawn in court-line white and the ball in the
 *   team's own primary: a playbook page can hold five courts, and design-plan
 *   §2's one-banana budget can't be spent five times over.
 *
 * The SVG is decoration for a screen reader; the ordered list of captions
 * beside it is the play's real content.
 */
export function PlayAnimation({ play }: { play: Play }) {
  const { seconds, playing, containerRef, togglePlaying, seekPaused } =
    useLoopClock(playDurationSeconds(play), play.id);

  const snapshot = playSnapshot(play, seconds);
  const { frameIndex } = snapshot;

  // The step being run (or just finished): from the previous frame into this
  // one. Dashed lines trace each player who moves on it, and a pass gets its
  // own line between passer and receiver.
  const from = frameIndex > 0 ? play.frames[frameIndex - 1] : null;
  const to = play.frames[frameIndex];

  const stepTo = (index: number) => {
    seekPaused(frameHoldSeconds(play, index));
  };

  const { width, height } = COURT_GEOMETRY;

  return (
    <div ref={containerRef} className="space-y-3">
      <div
        className="relative mx-auto w-full max-w-sm"
        style={{ aspectRatio: `${width} / ${height}` }}
        aria-hidden="true"
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          focusable="false"
          className="absolute inset-0 h-full w-full"
          data-play-court={play.id}
        >
          <CourtArt rim="line" />

          {from
            ? to.players.map((target, index) => {
                const start = from.players[index];
                if (start.x === target.x && start.y === target.y) {
                  return null;
                }
                return (
                  <line
                    key={`cut-${index}`}
                    x1={start.x * FT}
                    y1={start.y * FT}
                    x2={target.x * FT}
                    y2={target.y * FT}
                    className="stroke-foreground/60"
                    strokeWidth={3}
                    strokeDasharray="10 8"
                    strokeLinecap="round"
                  />
                );
              })
            : null}
          {from && from.ball !== to.ball ? (
            <line
              x1={from.players[from.ball].x * FT}
              y1={from.players[from.ball].y * FT}
              x2={to.players[to.ball].x * FT}
              y2={to.players[to.ball].y * FT}
              className="stroke-primary"
              strokeWidth={3}
              strokeDasharray="4 6"
              strokeLinecap="round"
              data-pass-line=""
            />
          ) : null}

          {snapshot.players.map((point, index) => (
            <g
              key={index}
              transform={`translate(${point.x * FT} ${point.y * FT})`}
              data-player={index + 1}
            >
              <circle
                r={PLAYER_RADIUS}
                className="fill-foreground stroke-background"
                strokeWidth={3}
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-background font-mono text-[20px] font-bold"
              >
                {index + 1}
              </text>
            </g>
          ))}

          <circle
            cx={snapshot.ball.x * FT + BALL_OFFSET.x}
            cy={snapshot.ball.y * FT + BALL_OFFSET.y}
            r={BALL_RADIUS}
            className="fill-primary stroke-background"
            strokeWidth={2.5}
            data-ball=""
          />
        </svg>
      </div>

      <StepCaptionAndControls
        playing={playing}
        onTogglePlaying={togglePlaying}
        frameIndex={frameIndex}
        captions={play.frames.map((frame) => frame.caption)}
        onStep={stepTo}
      />
    </div>
  );
}
