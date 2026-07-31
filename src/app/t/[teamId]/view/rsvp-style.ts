import type { RsvpState } from "@/lib/rsvp";

/// Shared visual vocabulary for the three RSVP states, reused by the diamond
/// and the batting lineup so a parent sees one consistent language across the
/// page. Mirrors the labels the event page's RSVP_BADGE established
/// (schedule/[eventId]/page.tsx) — Going / Not going / No response.
///
/// `nameClassName` is the one place "declined players are greyed rather than
/// removed" is expressed: it fades the player's own name, never their slot.
/// `no-response` keeps the name at full strength — it must never read as
/// "out".
export const RSVP_STYLE: Record<
  RsvpState,
  { label: string; tagClassName: string; nameClassName: string }
> = {
  attending: {
    label: "Going",
    tagClassName: "text-primary",
    nameClassName: "text-foreground",
  },
  declined: {
    label: "Not going",
    tagClassName: "text-destructive",
    nameClassName: "text-muted-foreground opacity-60",
  },
  "no-response": {
    label: "No response",
    tagClassName: "text-muted-foreground",
    nameClassName: "text-foreground",
  },
};
