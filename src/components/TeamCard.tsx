import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TeamCardProps {
  id: string;
  name: string;
  season: string | null;
  allPlay: boolean;
  isClickable: boolean;
  archivedAt?: Date | null;
}

/// A little felt pennant beside the team name (design-plan.md §7). Decorative
/// only — the name itself is the content.
function PennantGlyph() {
  return (
    <svg
      viewBox="0 0 26 16"
      aria-hidden="true"
      focusable="false"
      className="h-4 w-6 shrink-0"
    >
      <line
        x1="2"
        y1="1"
        x2="2"
        y2="15"
        className="stroke-dirt"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path d="M4,2 L24,6 L4,12 Z" className="fill-primary" />
    </svg>
  );
}

export function TeamCard({
  id,
  name,
  season,
  allPlay,
  isClickable,
  archivedAt = null,
}: TeamCardProps) {
  const content = (
    <Card
      className={`${
        isClickable ? "cursor-pointer transition-shadow hover:shadow-md" : ""
      } ${
        // A retired jersey, not a deleted one: archived teams go quiet but
        // keep their pennant.
        archivedAt ? "opacity-75 saturate-50" : ""
      }`}
    >
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <PennantGlyph />
            <CardTitle className="truncate text-lg">{name}</CardTitle>
          </div>
          {archivedAt && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-secondary-foreground">
              Archived
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          {season && <p className="text-muted-foreground">Season: {season}</p>}
          <p className="text-muted-foreground">
            {allPlay ? "All players bat and field" : "Selective lineup"}
          </p>
        </div>
      </CardContent>
    </Card>
  );

  if (isClickable) {
    return (
      <Link href={`/t/${id}`} className="block">
        {content}
      </Link>
    );
  }

  return content;
}
