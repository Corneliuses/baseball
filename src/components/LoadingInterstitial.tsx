"use client";

import { BaseballSpinner } from "@/components/BaseballSpinner";
import { BasketballSpinner } from "@/components/BasketballSpinner";
import { useSport } from "@/components/SportProvider";
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
/// `role="status"` makes it a polite live region, never an interrupting
/// alert. A Suspense fallback mounts with its text already in place, so most
/// screen readers will not announce it on arrival. What it guarantees is that
/// a reader browsing the page meets "Loading…" rather than an empty region.
///
/// Inside a basketball team the ball dribbles instead (`BasketballSpinner`).
/// A `loading.tsx` fallback has no data, so the sport arrives through
/// `SportProvider`, which the team layout supplies; anywhere else — `/profile`
/// — the context's default keeps the baseball. That is the only reason this is
/// a client component.
export const LOADING_LABEL = "Loading…";

export function LoadingInterstitial({ className }: { className?: string }) {
  const basketball = useSport() === "BASKETBALL";

  return (
    <div
      role="status"
      className={cn(
        "flex min-h-[40vh] flex-col items-center justify-center gap-4 py-12 text-center",
        className,
      )}
    >
      {/* The basketball is a real ball: orange leather (the screen's one
          loud accent — a loading screen has nothing else on it) with dark
          seams in both themes (banana-foreground, the colour made to sit on
          that orange; text-foreground would turn them cream at night),
          rather than the baseball's red stitches on an outline. */}
      {basketball ? (
        <BasketballSpinner
          className="size-14 text-banana-foreground"
          ballClassName="fill-banana"
        />
      ) : (
        <BaseballSpinner
          className="size-14 text-foreground"
          seamClassName="stroke-destructive"
        />
      )}
      <p className="text-sm font-semibold text-muted-foreground">{LOADING_LABEL}</p>
    </div>
  );
}
