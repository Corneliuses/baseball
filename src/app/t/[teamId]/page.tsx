import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { sortDirectory } from "@/lib/directory-rules";
import { listCoachContacts } from "@/lib/memberships";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getTeamById } from "@/lib/teams";

/// Calls requireTeamAccess independently of the layout above it — see the
/// comment on layout.tsx. This page's own check is currently redundant with
/// the layout's (same intent, no minRole), but the rule every page under
/// /t/[teamId] follows is "check for yourself," not "trust the layout ran."
export default async function TeamHomePage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;

  let role;
  try {
    ({ role } = await requireTeamAccess(teamId, { intent: "read" }));
  } catch (error) {
    if (error instanceof TeamAccessError) {
      notFound();
    }
    throw error;
  }

  const team = await getTeamById(teamId);
  if (!team) {
    notFound();
  }

  // Parents only: the coaching staff's contact card. /directory is
  // coach-and-above, and its recorded escape hatch — "a parent who needs to
  // reach someone goes through the coach" — needs the coach to be reachable
  // in-app. listCoachContacts selects OWNER and COACH rows only, so nothing
  // here is another family's data. Coaches and the owner get the full
  // directory instead, so the card would be redundant for them.
  const coachContacts =
    role === "PARENT" ? sortDirectory(await listCoachContacts(teamId)) : [];

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-sm">
        {team.season && (
          <p className="text-muted-foreground">Season: {team.season}</p>
        )}
        <p className="text-muted-foreground">
          {team.allPlay ? "All players bat and field" : "Selective lineup"}
        </p>
        {team.archivedAt && (
          <p className="font-medium text-destructive">
            This team is archived and read-only.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href={`/t/${teamId}/schedule`}>Schedule</Link>
        </Button>

        {/* The payoff page gets this screen's one banana (design-plan.md §2). */}
        <Button
          asChild
          className="bg-banana text-banana-foreground hover:bg-banana/90"
        >
          <Link href={`/t/${teamId}/view`}>Lineup</Link>
        </Button>

        {role !== "PARENT" && (
          <>
            <Button asChild variant="outline">
              <Link href={`/t/${teamId}/readiness`}>Next-game readiness</Link>
            </Button>

            <Button asChild variant="outline">
              <Link href={`/t/${teamId}/chart`}>Edit batting order</Link>
            </Button>

            {/* Coach-and-above: the directory is every family's contact
                details, so a parent gets no link and no route to it. */}
            <Button asChild variant="outline">
              <Link href={`/t/${teamId}/directory`}>Directory</Link>
            </Button>
          </>
        )}

        <Button asChild variant="outline">
          <Link href={`/t/${teamId}/roster`}>Roster</Link>
        </Button>

        {role === "OWNER" && (
          <Button asChild variant="outline">
            <Link href={`/t/${teamId}/settings`}>Team settings</Link>
          </Button>
        )}

        {/* Everyone: your own name and phone, including the number the
            coaching staff will call. Not team-scoped — see /profile. */}
        <Button asChild variant="outline">
          <Link href="/profile">Your profile</Link>
        </Button>
      </div>

      {coachContacts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-foreground">Coaches</h3>
          <ul className="space-y-2">
            {coachContacts.map((coach) => (
              <li key={coach.userId}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {coach.name ?? coach.email}{" "}
                      <span className="text-sm font-normal text-muted-foreground">
                        · {coach.role === "OWNER" ? "Owner" : "Coach"}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <p>
                      <a
                        href={`mailto:${coach.email}`}
                        className="text-foreground underline"
                      >
                        {coach.email}
                      </a>
                    </p>
                    <p className="text-muted-foreground">
                      {coach.phone ? (
                        <a href={`tel:${coach.phone}`} className="underline">
                          {coach.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
