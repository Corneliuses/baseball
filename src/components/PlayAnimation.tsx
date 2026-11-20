"use client";

import * as React from "react";

import { CourtArt } from "@/components/CourtArt";
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

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") {
    return () => {};
  }
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function reducedMotionSnapshot(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia(REDUCED_MOTION).matches
  );
}

/// The server can't know, so it renders as if motion were reduced: the set,
/// paused. The clock starts once the client reads the real preference.
function reducedMotionServerSnapshot(): boolean {
  return true;
}

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
 * - **Readable before any JS.** The server renders the set (frame 0) with its
 *   caption; the clock only starts after hydration.
 * - **Reduced motion is honoured.** For a reader whose OS asks for it the play
 *   starts paused, and Back / Next step through it frame by frame.
 * - **Off-screen plays sleep.** A playbook can hold five of these, so each
 *   stops its clock when scrolled out of view.
 * - **No banana.** The rim is drawn in court-line white and the ball in the
 *   team's own primary: a playbook page can hold five courts, and design-plan
 *   §2's one-banana budget can't be spent five times over.
 *
 * The SVG is decoration for a screen reader; the ordered list of captions
 * beside it is the play's real content.
 */
export function PlayAnimation({ play }: { play: Play }) {
  const [seconds, setSeconds] = React.useState(0);
  const reducedMotion = React.useSyncExternalStore(
    subscribeReducedMotion,
    reducedMotionSnapshot,
    reducedMotionServerSnapshot,
  );
  // null until the reader presses Play, Pause or a step button; until then
  // the play runs unless their OS asks for less motion.
  const [choice, setChoice] = React.useState<boolean | null>(null);
  const playing = choice ?? !reducedMotion;
  const [visible, setVisible] = React.useState(true);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!playing || !visible) {
      return;
    }
    let frame = 0;
    let last: number | null = null;
    const loop = playDurationSeconds(play);
    const tick = (now: number) => {
      if (last !== null) {
        const delta = (now - last) / 1000;
        setSeconds((current) => (current + delta) % loop);
      }
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, visible, play]);

  const snapshot = playSnapshot(play, seconds);
  const { frameIndex } = snapshot;
  const frameCount = play.frames.length;
  const caption = play.frames[frameIndex].caption;

  // The step being run (or just finished): from the previous frame into this
  // one. Dashed lines trace each player who moves on it, and a pass gets its
  // own line between passer and receiver.
  const from = frameIndex > 0 ? play.frames[frameIndex - 1] : null;
  const to = play.frames[frameIndex];

  const stepTo = (index: number) => {
    setChoice(false);
    setSeconds(frameHoldSeconds(play, index));
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

      <p className="min-h-[2.5rem] text-sm text-foreground">
        <span className="font-mono text-xs font-bold text-muted-foreground">
          Step {frameIndex + 1} of {frameCount}
        </span>{" "}
        {caption}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => stepTo(frameIndex - 1)}
          disabled={frameIndex === 0}
          className="rounded-full border-2 border-border bg-card px-3 py-1 text-sm font-semibold text-foreground ring-offset-background hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => setChoice(!playing)}
          aria-pressed={playing}
          className="rounded-full border-2 border-primary bg-primary px-3.5 py-1 text-sm font-semibold text-primary-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => stepTo(frameIndex + 1)}
          disabled={frameIndex === frameCount - 1}
          className="rounded-full border-2 border-border bg-card px-3 py-1 text-sm font-semibold text-foreground ring-offset-background hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
        >
          Next
        </button>
      </div>

      <ol className="sr-only">
        {play.frames.map((frame, index) => (
          <li key={index}>{frame.caption}</li>
        ))}
      </ol>
    </div>
  );
}
