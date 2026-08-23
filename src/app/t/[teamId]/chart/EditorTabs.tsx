import Link from "next/link";

import { Button } from "@/components/ui/button";
import { DiamondIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/// The two halves of the lineup editor, as peers.
///
/// Before this, the positions board hid behind a small outline button inside
/// the batting-order page — so one of the coach's two main tools was reachable
/// only by first opening the other one and knowing to look (Dugout Report C4).
/// They are the same job on the same chart, and a segmented control says so.
///
/// A server component: it is two links and a highlight, and nothing here needs
/// the client. It also sits well clear of the drag tree, which matters —
/// AGENTS.md forbids Motion anywhere near a dnd-kit element, and this is
/// deliberately static styling rather than animation.
export function EditorTabs({
  teamId,
  active,
}: {
  teamId: string;
  active: "order" | "positions";
}) {
  const tabs = [
    { key: "order" as const, label: "Batting order", href: `/t/${teamId}/chart` },
    {
      key: "positions" as const,
      label: "Positions",
      href: `/t/${teamId}/chart/positions`,
    },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* aria-label rather than a visible legend: the two labels already say
          what the group is, and the editor pages carry their own heading. */}
      <nav aria-label="Lineup editor" className="min-w-0">
        <ul className="inline-flex rounded-full border-2 border-border bg-card p-0.5">
          {tabs.map((tab) => {
            const isActive = tab.key === active;
            return (
              <li key={tab.key}>
                <Link
                  href={tab.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                    isActive
                      ? // Same fill and same banana focus ring as the active
                        // nav pill, so "where am I" reads identically in both
                        // places (design-plan.md §10 on sunlight legibility).
                        "bg-primary text-primary-foreground shadow-sm focus-visible:ring-banana"
                      : "text-foreground hover:bg-accent focus-visible:ring-ring",
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* The read-only counterpart, named the way the nav now names it — the
          old "View chart" pointed at a tab called "Lineup" that no longer
          exists under that name. */}
      <Button asChild variant="outline" size="sm">
        <Link href={`/t/${teamId}/view`}>
          <DiamondIcon />
          See Game Day view
        </Link>
      </Button>
    </div>
  );
}
