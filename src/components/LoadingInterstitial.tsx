import { BaseballSpinner } from "@/components/BaseballSpinner";
import { cn } from "@/lib/utils";

/// What every `loading.tsx` shows while the next page streams in: a baseball,
/// spinning, over one plain line.
///
/// Before this, tapping a nav tab did nothing visible until the new page's
/// data had come back from Postgres — every route under /t/[teamId] is
/// rendered on demand — and on a phone at a field that silence reads as a
/// missed tap, which is how the same tab gets hit three times. This is the
/// navigation counterpart of `SubmitButton`'s pending state, and it reuses
/// the same ball so the app has one way of saying "working on it".
///
/// Two of design-plan.md's rules shape it. §8 forbids anything that loops
/// forever: this loop is bounded by the navigation it reports, because Next
/// unmounts a `loading.tsx` fallback the moment the segment resolves, and the
/// rotation itself is `animate-spin-ball`, gated on `prefers-reduced-motion`
/// in globals.css — so the line of text is the whole signal for a reader who
/// gets no motion, and is required copy rather than decoration. §2's one
/// banana per screen is spent nowhere here on purpose: an interstitial is
/// not a screen with an accent, and the page that replaces it has its own.
///
/// `role="status"` rather than a live announcement: the region mounts with
/// its text already in place, which is what Suspense fallbacks do, and a
/// screen reader that lands on it reads "Loading…" and nothing more.
export const LOADING_LABEL = "Loading…";

export function LoadingInterstitial({ className }: { className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        "flex min-h-[40vh] flex-col items-center justify-center gap-4 py-12 text-center",
        className,
      )}
    >
      <BaseballSpinner
        className="size-14 text-foreground"
        seamClassName="stroke-destructive"
      />
      <p className="text-sm font-semibold text-muted-foreground">{LOADING_LABEL}</p>
    </div>
  );
}
