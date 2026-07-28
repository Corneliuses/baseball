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
      className={isClickable ? "cursor-pointer hover:shadow-md transition-shadow" : ""}
    >
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg">{name}</CardTitle>
          {archivedAt && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
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
