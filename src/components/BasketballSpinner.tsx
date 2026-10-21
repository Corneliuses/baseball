/// The pending indicator inside a basketball team: a basketball, dribbling.
///
/// The counterpart of `BaseballSpinner`, with the same props so a caller swaps
/// one for the other on the team's sport (`SubmitButton`,
/// `LoadingInterstitial`). Drawn rather than imported, like the rest of
/// `icons.tsx`, and stroked in `currentColor` so it reads on any button.
///
/// The motion is `animate-dribble` (globals.css): a translate-only bounce,
/// gated on `prefers-reduced-motion` exactly like `animate-spin-ball`. It is
/// a loop, which design-plan.md §8 permits only because it is bounded by the
/// submission or navigation it reports; the label beside it carries the same
/// news in words for a reader who gets no motion.
///
/// `seamClassName` colours the four seams on their own, the way the
/// navigation interstitial stitches the baseball's in seam red.
/// `ballClassName` fills the ball itself — the interstitial paints it orange;
/// inside a button it stays an outline, since a filled disc beside a label
/// would be the loudest thing on the control.
export function BasketballSpinner({
  className = "",
  seamClassName,
  ballClassName,
}: {
  className?: string;
  seamClassName?: string;
  ballClassName?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      className={`animate-dribble ${className}`}
    >
      <circle
        cx="12"
        cy="12"
        r="8.5"
        strokeWidth={1.75}
        className={ballClassName}
      />
      {/* The vertical and horizontal seams, then the two curved side seams
          bowing toward the middle. */}
      <path d="M12 3.5v17" strokeWidth={1.5} className={seamClassName} />
      <path d="M3.5 12h17" strokeWidth={1.5} className={seamClassName} />
      <path
        d="M6.2 5.8a9 9 0 010 12.4"
        strokeWidth={1.5}
        className={seamClassName}
      />
      <path
        d="M17.8 5.8a9 9 0 000 12.4"
        strokeWidth={1.5}
        className={seamClassName}
      />
    </svg>
  );
}
