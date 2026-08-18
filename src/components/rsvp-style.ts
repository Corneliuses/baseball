import type { RsvpState } from "@/lib/rsvp";

/// The one visual vocabulary for the three RSVP states, shared by the event
/// page (#7) and the view page (#8) so a parent reads the same language on
/// both. Keeping it in one module is deliberate: the two pages drifted apart
/// once already, which is how one of them ended up with an unreadable colour.
///
/// State is always carried by a text label as well as a colour, never colour
/// alone — the page is read outdoors in sunlight, and colour-blind parents
/// need the same signal.
///
/// `nameClassName` is where "declined players are greyed rather than removed"
/// lives: it fades the player's own name, never their slot. `no-response`
/// keeps the name at full strength — it must never read as "out".
export const RSVP_STYLE: Record<
  RsvpState,
  {
    label: string;
    tagClassName: string;
    nameClassName: string;
    /// Applied to the view page diamond's position marker circle.
    markerClassName: string;
    markerStrokeWidth: number;
    /// The player's name *on the field*, where it sits over grass and dirt
    /// rather than a card. Same meaning as `nameClassName` and it must keep
    /// the same ranking — declined dimmer than the other two — but it cannot
    /// borrow that value: `opacity-60` on a light grey is legible on white and
    /// disappears on green, which is the one place this app is read in
    /// sunlight. Dim it by colour here, not by opacity.
    markerNameClassName: string;
  }
> = {
  attending: {
    label: "Going",
    tagClassName: "text-primary",
    nameClassName: "text-foreground",
    // Marker fills are opaque now that the circles sit on FieldArt's grass
    // and dirt — a translucent fill reads as a hole in the field. State is
    // carried by ring color and weight, never fill alone.
    markerClassName: "fill-card stroke-primary",
    markerStrokeWidth: 3,
    markerNameClassName: "text-foreground",
  },
  declined: {
    label: "Not going",
    tagClassName: "text-destructive",
    nameClassName: "text-muted-foreground opacity-60",
    markerClassName: "fill-muted stroke-muted-foreground",
    markerStrokeWidth: 1.5,
    markerNameClassName: "text-muted-foreground",
  },
  "no-response": {
    label: "No response",
    tagClassName: "text-muted-foreground",
    nameClassName: "text-foreground",
    markerClassName: "fill-card stroke-muted-foreground",
    markerStrokeWidth: 2,
    markerNameClassName: "text-foreground",
  },
};
