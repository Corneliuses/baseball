import * as React from "react";

import { AlertIcon, CheckIcon } from "@/components/icons";

/**
 * The one way this app tells someone how their submission went.
 *
 * Every page used to hand-roll a bare `<p role="alert">` or `<p role="status">`
 * with its own classes, which is why success looked identical to a caption and
 * a failure looked identical to help text. This gives both a shape: an icon, a
 * warm surface, and a line of the page's own copy.
 *
 * The success tick is drawn, not shown — `animate-tick` sweeps CheckIcon's
 * polyline (globals.css). design-plan.md §8 specified that flourish in the
 * original redesign and shipped without it; this is where it finally lands.
 *
 * A server component on purpose. Almost every caller is a server page reading
 * a `?saved=1`-style param, and there is nothing here that needs the client —
 * the entrance is CSS, so the banner is legible in the raw HTML before any
 * bundle arrives (the rule `Reveal` and `animate-rise` already follow).
 *
 * The role is not cosmetic. `role="alert"` interrupts a screen reader, which is
 * right for "that didn't work" and wrong for "saved" — so tone picks the role
 * as well as the palette, and neither can be set without the other.
 */
export interface StatusBannerProps {
  tone: "success" | "error";
  children: React.ReactNode;
  className?: string;
  /// Exposed for the pages that already wire `aria-describedby` from a field
  /// to their error line, so converting them to this component keeps that
  /// association instead of quietly dropping it.
  id?: string;
}

export function StatusBanner({
  tone,
  children,
  className = "",
  id,
}: StatusBannerProps) {
  const isSuccess = tone === "success";

  return (
    <div
      id={id}
      role={isSuccess ? "status" : "alert"}
      className={`animate-rise flex items-start gap-2.5 rounded-md border-2 px-3 py-2.5 text-sm ${
        isSuccess
          ? "border-primary/30 bg-primary/10 text-foreground"
          : "border-destructive/40 bg-destructive/10 text-foreground"
      } ${className}`}
    >
      {isSuccess ? (
        <CheckIcon className="animate-tick mt-0.5 size-4 shrink-0 text-primary" />
      ) : (
        <AlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
