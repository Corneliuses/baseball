"use client";

import * as React from "react";

/**
 * The clock and the controls shared by basketball's looping diagrams —
 * `PlayAnimation` (a play on the half court) and `SkillAnimation` (an at-home
 * drill). Each diagram owns a pure snapshot function that says where
 * everything is `seconds` into its loop; this module only advances `seconds`
 * and draws Back / Play-Pause / Next.
 *
 * - **Readable before any JS.** The server renders second 0, paused; the
 *   clock only starts after hydration.
 * - **Reduced motion is honoured.** For a reader whose OS asks for it the
 *   loop starts paused, and Back / Next step through it frame by frame.
 * - **Off-screen loops sleep.** A page can hold five of these, so each stops
 *   its clock when scrolled out of view.
 */

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

/// The server can't know, so it renders as if motion were reduced: frame 0,
/// paused. The clock starts once the client reads the real preference.
function reducedMotionServerSnapshot(): boolean {
  return true;
}

export type LoopClock = {
  seconds: number;
  playing: boolean;
  /// Attach to the diagram's outermost element, so the clock can sleep while
  /// it is off-screen.
  containerRef: React.RefObject<HTMLDivElement | null>;
  togglePlaying: () => void;
  /// Pause and jump to a moment — what the step buttons do.
  seekPaused: (seconds: number) => void;
};

/// A requestAnimationFrame clock that wraps every `loopSeconds`. `resetKey`
/// names what is looping, so a new loop restarts the effect.
export function useLoopClock(loopSeconds: number, resetKey: string): LoopClock {
  const [seconds, setSeconds] = React.useState(0);
  const reducedMotion = React.useSyncExternalStore(
    subscribeReducedMotion,
    reducedMotionSnapshot,
    reducedMotionServerSnapshot,
  );
  // null until the reader presses Play, Pause or a step button; until then
  // the loop runs unless their OS asks for less motion.
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
    const tick = (now: number) => {
      if (last !== null) {
        const delta = (now - last) / 1000;
        setSeconds((current) => (current + delta) % loopSeconds);
      }
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, visible, loopSeconds, resetKey]);

  return {
    seconds,
    playing,
    containerRef,
    togglePlaying: () => setChoice(!playing),
    seekPaused: (next) => {
      setChoice(false);
      setSeconds(next);
    },
  };
}

const STEP_BUTTON =
  "rounded-full border-2 border-border bg-card px-3 py-1 text-sm font-semibold text-foreground ring-offset-background hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50";

/// "Step 2 of 4" and the caption, then Back / Play-Pause / Next, then every
/// caption in order for a screen reader — the drawing above is decoration and
/// this list is the diagram's real content.
export function StepCaptionAndControls({
  playing,
  onTogglePlaying,
  frameIndex,
  captions,
  onStep,
}: {
  playing: boolean;
  onTogglePlaying: () => void;
  frameIndex: number;
  captions: readonly string[];
  onStep: (index: number) => void;
}) {
  const frameCount = captions.length;
  return (
    <>
      <p className="min-h-[2.5rem] text-sm text-foreground">
        <span className="font-mono text-xs font-bold text-muted-foreground">
          Step {frameIndex + 1} of {frameCount}
        </span>{" "}
        {captions[frameIndex]}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onStep(frameIndex - 1)}
          disabled={frameIndex === 0}
          className={STEP_BUTTON}
        >
          Back
        </button>
        <button
          type="button"
          onClick={onTogglePlaying}
          aria-pressed={playing}
          className="rounded-full border-2 border-primary bg-primary px-3.5 py-1 text-sm font-semibold text-primary-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => onStep(frameIndex + 1)}
          disabled={frameIndex === frameCount - 1}
          className={STEP_BUTTON}
        >
          Next
        </button>
      </div>

      <ol className="sr-only">
        {captions.map((caption, index) => (
          <li key={index}>{caption}</li>
        ))}
      </ol>
    </>
  );
}
