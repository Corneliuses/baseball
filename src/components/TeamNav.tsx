"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Role } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

type TeamNavItem = {
  href: string;
  label: string;
  /// Match this href exactly instead of as a prefix — only the team home
  /// needs it, since every other team route lives underneath it.
  exact?: boolean;
  /// Extra routes this tab owns that don't sit under its own href. Members
  /// is the only one: it's reached from Settings but lives at a sibling URL,
  /// so without this the nav goes blank on the one page it's linked from.
  alsoMatch?: readonly string[];
};

/// How a tab relates to the current URL: it *is* the page, it merely contains
/// the page, or neither. Both lit states look identical, but they must not be
/// announced identically — ARIA reserves `aria-current="page"` for the link
/// whose target is the current page, and a containing section is
/// `aria-current="true"`. Saying "current page" on the Chart tab while the
/// reader is two segments deeper in the positions editor is simply false.
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

/// One list, gated by role, so the nav and its tests agree on exactly which
/// links each role sees. This gating is presentational only — every page
/// checks requireTeamAccess for itself, so hiding a link here is a courtesy,
/// never the boundary.
function navItems(teamId: string, role: Role): TeamNavItem[] {
  const base = `/t/${teamId}`;
  const items: TeamNavItem[] = [
    { href: base, label: "Home", exact: true },
    { href: `${base}/schedule`, label: "Schedule" },
    { href: `${base}/view`, label: "Lineup" },
    { href: `${base}/roster`, label: "Roster" },
  ];

  if (role !== "PARENT") {
    items.push(
      { href: `${base}/readiness`, label: "Readiness" },
      { href: `${base}/chart`, label: "Chart" },
      { href: `${base}/directory`, label: "Directory" },
    );
  }

  if (role === "OWNER") {
    items.push({
      href: `${base}/settings`,
      label: "Settings",
      alsoMatch: [`${base}/members`],
    });
  }

  items.push({ href: "/profile", label: "Profile" });

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
/// A client component only for `usePathname` — the active tab has to follow
/// client-side navigation, which the server layout never re-renders for.
export function TeamNav({ teamId, role }: { teamId: string; role: Role }) {
  const pathname = usePathname();

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
        {navItems(teamId, role).map((item) => {
          const match = matchNavItem(item, pathname);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={
                  match === "page" ? "page" : match === "section" ? true : undefined
                }
                className={cn(
                  "inline-flex items-center whitespace-nowrap rounded-full border-2 px-4 py-1.5 text-sm font-semibold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  match
                    ? // Banana ring on the green fill, per design-plan.md §10:
                      // --ring is Field Green in light mode, which would be a
                      // green ring on a green pill — invisible exactly where
                      // this app is read, outdoors in sunlight.
                      "border-primary bg-primary text-primary-foreground shadow-sm focus-visible:ring-banana"
                    : "border-border bg-card text-foreground hover:border-primary/60 hover:bg-accent focus-visible:ring-ring",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
