"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Role } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import {
  CapIcon,
  ClipboardIcon,
  DiamondIcon,
  GearIcon,
  JerseyIcon,
  MegaphoneIcon,
  PennantIcon,
  PersonIcon,
  RolodexIcon,
  ScoreboardIcon,
  TicketIcon,
  WhistleIcon,
  type IconProps,
} from "@/components/icons";

/// Which rack a tab belongs on. "team" is everything a parent can also open;
/// "coach" is the staff toolkit. The split is presentational — every page
/// re-checks access — but it answers the audit's complaint that nine ungrouped
/// pills mixed coach tools with parent pages with nothing to tell them apart.
type NavGroup = "team" | "coach";

type TeamNavItem = {
  href: string;
  label: string;
  icon: (props: IconProps) => React.ReactElement;
  group: NavGroup;
  /// Match this href exactly instead of as a prefix — only the team home
  /// needs it, since every other team route lives underneath it.
  exact?: boolean;
  /// Extra routes this tab owns that don't sit under its own href. Nothing
  /// needs it today: Members used to be borrowed by Settings, and now has a
  /// tab of its own. Kept because the mechanism is the answer for any future
  /// page reached from a sibling URL, and `matchNavItem` still honours it.
  alsoMatch?: readonly string[];
};

/// How a tab relates to the current URL: it *is* the page, it merely contains
/// the page, or neither. Both lit states look identical, but they must not be
/// announced identically — ARIA reserves `aria-current="page"` for the link
/// whose target is the current page, and a containing section is
/// `aria-current="true"`. Saying "current page" on the Edit Lineup tab while
/// the reader is two segments deeper in the positions editor is simply false.
///
/// Pure and router-free so the matching is testable on its own.
export function matchNavItem(
  item: TeamNavItem,
  pathname: string,
): "page" | "section" | null {
  if (pathname === item.href) {
    return "page";
  }
  if (item.exact) {
    return null;
  }

  // The trailing slash matters: without it a hypothetical /viewer route would
  // light the /view tab.
  const owned = [item.href, ...(item.alsoMatch ?? [])];
  return owned.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
    ? "section"
    : null;
}

/**
 * One list, gated by role, so the nav and its tests agree on exactly which
 * links each role sees. This gating is presentational only — every page checks
 * requireTeamAccess for itself, so hiding a link here is a courtesy, never the
 * boundary.
 *
 * Two labels changed in #51, and the reason is that the old pair was actively
 * misleading: "Lineup" was the read-only view and "Chart" was the editor, so
 * the tab that sounded like a document was the one that wrote to the database.
 * **Game Day** says what a parent opens `/view` for — and is the design plan's
 * own rallying cry (§4) — while **Edit Lineup** states the verb, so the two
 * cannot be mistaken for each other in either direction.
 *
 * Members gets its own tab rather than hiding behind a button on Settings.
 * That also lets the Settings tab drop the `alsoMatch` that used to lend it
 * `/members`, so each section now lights its own tab.
 */
function navItems(teamId: string, role: Role): TeamNavItem[] {
  const base = `/t/${teamId}`;
  const items: TeamNavItem[] = [
    { href: base, label: "Home", icon: PennantIcon, group: "team", exact: true },
    { href: `${base}/schedule`, label: "Schedule", icon: TicketIcon, group: "team" },
    { href: `${base}/view`, label: "Game Day", icon: DiamondIcon, group: "team" },
    { href: `${base}/roster`, label: "Roster", icon: JerseyIcon, group: "team" },
    // Every role: coaches get the broadcast list, parents get the
    // compose-to-coaches form (the page itself redirects them there).
    { href: `${base}/messages`, label: "Messages", icon: MegaphoneIcon, group: "team" },
  ];

  if (role !== "PARENT") {
    items.push(
      {
        href: `${base}/readiness`,
        label: "Readiness",
        icon: ScoreboardIcon,
        group: "coach",
      },
      {
        href: `${base}/chart`,
        label: "Edit Lineup",
        icon: ClipboardIcon,
        group: "coach",
      },
      {
        href: `${base}/directory`,
        label: "Directory",
        icon: RolodexIcon,
        group: "coach",
      },
    );
  }

  if (role === "OWNER") {
    items.push(
      { href: `${base}/members`, label: "Members", icon: CapIcon, group: "coach" },
      { href: `${base}/settings`, label: "Settings", icon: GearIcon, group: "coach" },
    );
  }

  // Not a team page at all — the person's own profile, and the app's only
  // sign-out. It sits with the shared tabs rather than the staff rack.
  items.push({ href: "/profile", label: "Profile", icon: PersonIcon, group: "team" });

  return items;
}

/// The team's persistent navigation, rendered by the /t/[teamId] layout so it
/// travels with every team view. Pill tabs on the header band: the active tab
/// fills Field Green, the rest sit on card stock with a warm border.
///
/// No *resting* banana on purpose — the nav appears on every screen, and a
/// yellow tab would spend the one-banana-per-screen budget (design-plan.md §2)
/// everywhere at once. The banana appears only in the active tab's focus ring,
/// which §10 asks for by name and which is transient rather than decoration.
///
/// The coach rack is separated by a seam of stitch-red dashes and sits on clay
/// stock instead of card stock — two quiet signals rather than a colour, so
/// nothing here spends the budget either. Icons are additive and always sit
/// beside their own text, per §10's rule that meaning is never carried by shape
/// or colour alone.
///
/// A client component only for `usePathname` — the active tab has to follow
/// client-side navigation, which the server layout never re-renders for.
export function TeamNav({ teamId, role }: { teamId: string; role: Role }) {
  const pathname = usePathname();
  const items = navItems(teamId, role);
  const firstCoachIndex = items.findIndex((item) => item.group === "coach");

  return (
    <nav
      aria-label="Team"
      // Bleeds to the screen edge on phones so the row scrolls under the
      // thumb instead of wrapping into a wall of buttons.
      className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0"
    >
      {/* py-1.5 rather than pb-1: `overflow-x-auto` makes overflow-y `auto`
          too, so a focus ring on the top or bottom edge would be clipped
          without room to draw it. */}
      <ul className="flex w-max items-center gap-2 py-1.5 lg:w-full lg:flex-wrap">
        {items.map((item, index) => {
          const match = matchNavItem(item, pathname);
          const Icon = item.icon;
          const startsCoachRack = index === firstCoachIndex && firstCoachIndex > 0;

          return (
            <React.Fragment key={item.href}>
              {startsCoachRack ? <CoachSeam /> : null}
              <li>
                <Link
                  href={item.href}
                  aria-current={
                    match === "page" ? "page" : match === "section" ? true : undefined
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border-2 px-3.5 py-1.5 text-sm font-semibold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                    match
                      ? // Banana ring on the green fill, per design-plan.md §10:
                        // --ring is Field Green in light mode, which would be a
                        // green ring on a green pill — invisible exactly where
                        // this app is read, outdoors in sunlight.
                        "border-primary bg-primary text-primary-foreground shadow-sm focus-visible:ring-banana"
                      : item.group === "coach"
                        ? // Clay stock: the staff rack reads as a different
                          // material without becoming a second colour.
                          "border-border bg-secondary text-secondary-foreground hover:border-primary/60 hover:bg-accent focus-visible:ring-ring"
                        : "border-border bg-card text-foreground hover:border-primary/60 hover:bg-accent focus-visible:ring-ring",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {item.label}
                </Link>
              </li>
            </React.Fragment>
          );
        })}
      </ul>
    </nav>
  );
}

/// The join between the shared tabs and the coach's rack: a whistle — the one
/// thing in the bag only the staff carries — over a short stitch seam.
///
/// `aria-hidden` and not a list item: it is a texture, and a screen reader
/// reading "separator" between every tab list would be noise. The grouping it
/// marks is visual shorthand for a boundary the pages themselves enforce.
function CoachSeam() {
  return (
    <li aria-hidden="true" className="flex shrink-0 items-center gap-1 px-0.5">
      <WhistleIcon className="size-4 text-muted-foreground" />
      <svg
        viewBox="0 0 4 20"
        focusable="false"
        className="h-5 w-1"
        aria-hidden="true"
      >
        <path
          d="M2,1 V19"
          fill="none"
          className="stroke-destructive/60"
          strokeWidth={1.5}
          strokeDasharray="3 3"
          strokeLinecap="round"
        />
      </svg>
    </li>
  );
}
