import type { RsvpState } from "@/lib/rsvp";

/// Shared visual vocabulary for the three RSVP states, reused by the diamond
/// and the batting lineup so a parent sees one consistent language.
///
/// **`text-primary` is deliberately NOT used here**, despite the event page's
/// badges using it. In this palette `--primary` is a *surface* token, not a
/// text color: it is `24 9% 98%` (near-white) in light mode and `24 100% 10%`
/// (near-black) in dark — so `text-primary` renders near-white on a white card
/// and near-black on a dark one. Every color below is a token that stays
/// readable against `--card` in both schemes.
///
/// `nameClassName` is where "declined players are greyed rather than removed"
/// lives: it fades the player's own name, never their slot. `no-response`
/// keeps the name at full strength — it must never read as "out". State is
/// always carried by a text label too, never by color alone, so it survives
/// sunlight and color blindness.
export const RSVP_STYLE: Record<
  RsvpState,
  {
    label: string;
    tagClassName: string;
    nameClassName: string;
    /// Applied to the diamond's position marker circle.
    markerClassName: string;
    markerStrokeWidth: number;
  }
> = {
  attending: {
    label: "Going",
    tagClassName: "text-foreground font-medium",
    nameClassName: "text-foreground",
    markerClassName: "fill-foreground/10 stroke-foreground",
    markerStrokeWidth: 2.5,
  },
  declined: {
    label: "Not going",
    tagClassName: "text-destructive",
    nameClassName: "text-muted-foreground opacity-60",
    markerClassName: "fill-muted/40 stroke-muted-foreground",
    markerStrokeWidth: 1.5,
  },
  "no-response": {
    label: "No response",
    tagClassName: "text-muted-foreground",
    nameClassName: "text-foreground",
    markerClassName: "fill-card stroke-muted-foreground",
    markerStrokeWidth: 2,
  },
};
