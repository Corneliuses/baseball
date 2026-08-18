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
};

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
    items.push({ href: `${base}/settings`, label: "Settings" });
  }

  items.push({ href: "/profile", label: "Profile" });

  return items;
}

/// The team's persistent navigation, rendered by the /t/[teamId] layout so it
/// travels with every team view. Pill tabs on the header band: the active tab
/// fills Field Green, the rest sit on card stock with a warm border. No banana
/// here on purpose — the nav appears on every screen, and a yellow tab would
/// spend the one-banana-per-screen budget (design-plan.md §2) everywhere at
/// once.
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
      <ul className="flex w-max items-center gap-2 pb-1 lg:w-full lg:flex-wrap">
        {navItems(teamId, role).map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center whitespace-nowrap rounded-full border-2 px-4 py-1.5 text-sm font-semibold transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-card text-foreground hover:border-primary/60 hover:bg-accent",
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
