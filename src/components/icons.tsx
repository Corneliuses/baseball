/// The dugout icon set — hand-drawn glyphs for navigation and buttons.
///
/// Deliberately **not** an icon library. design-plan.md §2 asks for
/// felt-and-cardstock, never "gradients-and-glassmorphism modern", and every
/// other glyph this app draws is a bespoke inline SVG in that register —
/// StitchDivider's seam, TeamCard's pennant, the whole of FieldArt. A generic
/// icon package would be the one SaaS-dashboard note in the room, and it would
/// add a dependency to draw twelve shapes.
///
/// Shared rules, enforced by icons.test.tsx:
///
/// - **Decorative only.** Every glyph is `aria-hidden` + `focusable="false"`,
///   the same contract FieldArt and StitchDivider keep. Icons never carry
///   meaning on their own: design-plan.md §10's state-is-never-colour-alone
///   rule extends to wayfinding, so an icon always sits beside its text label.
/// - **currentColor.** Stroke-drawn against the inherited text colour, so a
///   glyph works on card stock, on a Field Green active pill, and in both
///   themes without a palette of its own.
/// - **One 24-unit viewBox** and one stroke width, so the set looks like a set.
///   Size comes from the caller: `ui/button.tsx` already sizes any nested svg
///   to `size-4`, which is why these carry no width or height of their own.
import * as React from "react";

/// The stroke weight the whole set shares. Chunky enough to read at 16px on a
/// phone in sunlight (design-plan.md §4's "crunchy" register), light enough
/// that the smaller glyphs don't fill in.
const STROKE_WIDTH = 1.75;

export interface IconProps {
  className?: string;
}

/// Shared chrome for every glyph below. Not exported: an icon is one of the
/// named shapes, not an arbitrary SVG wrapper.
function Icon({
  className = "",
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

/// Team home. The same felt pennant TeamCard flies, redrawn on the shared grid.
export function PennantIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M5 3.5v17" />
      <path d="M6.5 5l12 3.5-12 3.5z" />
    </Icon>
  );
}

/// Schedule, and the Duplicate button. A ticket stub with its perforation —
/// design-plan.md §5's fourth motif, and what the schedule's game cards are.
export function TicketIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M3 7.5A1.5 1.5 0 014.5 6h15A1.5 1.5 0 0121 7.5v2a2.5 2.5 0 000 5v2a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 16.5v-2a2.5 2.5 0 000-5z" />
      <path d="M14.5 6.5v11" strokeDasharray="1.5 2.5" />
    </Icon>
  );
}

/// Game Day — the read-only lineup. A ballfield seen from above: the basepath
/// diamond with its four bags, the same shape /view paints at full size.
export function DiamondIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 3.5L20.5 12 12 20.5 3.5 12z" />
      <path d="M12 17.5l1.6 1.6M12 17.5l-1.6 1.6" />
      <circle cx="12" cy="12" r="1.4" />
    </Icon>
  );
}

/// Roster. A jersey on its hanger-less shoulders, collar open.
export function JerseyIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M8.5 3.5L4 6l1.5 4 2.5-1v8.5h8V9l2.5 1L20 6l-4.5-2.5z" />
      <path d="M9.5 3.5a2.5 2.5 0 005 0" />
    </Icon>
  );
}

/// Messages. A megaphone, because a team broadcast is an announcement, not mail.
export function MegaphoneIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4 9.5l9-4v13l-9-4z" />
      <path d="M6.5 14.5v3a1.75 1.75 0 003.5 0v-2" />
      <path d="M16.5 9.5a4 4 0 010 5" />
    </Icon>
  );
}

/// Readiness — "The Scoreboard" of design-plan.md §7, on its two posts.
export function ScoreboardIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <rect x="3" y="4.5" width="18" height="11" rx="1.5" />
      <path d="M3 9h18M9.5 9v6.5M15 9v6.5" />
      <path d="M8 15.5v4M16 15.5v4" />
    </Icon>
  );
}

/// Edit Lineup — the coach's clipboard, the thing the batting order lives on.
export function ClipboardIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M9 4.5H6.5A1.5 1.5 0 005 6v13.5A1.5 1.5 0 006.5 21h11a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H15" />
      <rect x="9" y="2.5" width="6" height="4" rx="1" />
      <path d="M8.5 11h7M8.5 14.5h7M8.5 18h4" />
    </Icon>
  );
}

/// Directory. A contact card: one face, two lines of details.
export function RolodexIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10.5" r="2" />
      <path d="M6 15.5a3 3 0 016 0" />
      <path d="M15 10h3.5M15 13.5h3.5" />
    </Icon>
  );
}

/// Members. A ball cap — the thing you hand someone when they join the team.
export function CapIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M6 14.5a6 6 0 0112 0" />
      <path d="M4.5 14.5h14a3.5 3.5 0 013.5 3.5H4.5a1.75 1.75 0 010-3.5z" />
      <path d="M12 8.5v-1" />
    </Icon>
  );
}

/// Settings.
export function GearIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M17.2 12h2.3M4.5 12h2.3M12 17.2v2.3M12 4.5v2.3" />
      <path d="M15.7 15.7l1.6 1.6M6.7 6.7l1.6 1.6M8.3 15.7l-1.6 1.6M15.7 8.3l1.6-1.6" />
    </Icon>
  );
}

/// The marker on the coach-only end of the nav. A whistle is the one object in
/// the bag that only the staff carries.
export function WhistleIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M7 8.5h10a3 3 0 013 3v1a3 3 0 01-3 3H7a3.5 3.5 0 010-7z" />
      <circle cx="8.5" cy="12" r="1.5" />
      <path d="M11.5 8.5V7a2.5 2.5 0 012.5-2.5" />
    </Icon>
  );
}

/// The success tick. Drawn as one continuous polyline on purpose: StatusBanner
/// animates it with `animate-tick`, which sweeps `stroke-dashoffset` along
/// exactly this path, and a two-segment icon would draw in two pieces.
export function CheckIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4.5 12.5l5 5 10-11" />
    </Icon>
  );
}

/// A player added, a row already handled. The tick inside its own ring, for
/// places that mark a list row done rather than confirming a whole submission.
export function CheckCircleIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 12.2l2.8 2.8L16 9" />
    </Icon>
  );
}

/// Validation problems, and the losing side of a chart conflict.
export function AlertIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.5" />
      <path d="M12 16.2v.6" />
    </Icon>
  );
}
