import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TeamCardProps {
  id: string;
  name: string;
  season?: string | null;
  allPlay: boolean;
  isClickable: boolean;
}

export function TeamCard({
  id,
  name,
  season,
  allPlay,
  isClickable,
}: TeamCardProps) {
  const content = (
    <Card
      className={isClickable ? "cursor-pointer hover:shadow-md transition-shadow" : ""}
    >
      <CardHeader>
        <CardTitle className="text-lg">{name}</CardTitle>
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
