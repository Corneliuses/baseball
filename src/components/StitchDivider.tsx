/// A baseball-seam section divider: two shallow dashed arcs in stitch red,
/// replacing plain border-t rules between sections (design-plan.md §5).
///
/// Purely decorative — aria-hidden, no announced content — so it can sit
/// between sections without adding noise for screen readers. Height is fixed
/// and small; the arcs bow the way a seam crosses a ball.
export function StitchDivider({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 16"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="none"
      className={`h-3 w-full ${className}`}
    >
      <path
        d="M0,4 Q200,14 400,4"
        fill="none"
        className="stroke-destructive"
        strokeWidth={1.5}
        strokeDasharray="6 5"
        strokeLinecap="round"
      />
      <path
        d="M0,12 Q200,2 400,12"
        fill="none"
        className="stroke-destructive/60"
        strokeWidth={1.5}
        strokeDasharray="6 5"
        strokeLinecap="round"
      />
    </svg>
  );
}
