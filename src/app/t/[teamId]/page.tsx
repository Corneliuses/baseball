import { notFound } from "next/navigation";

import { InstallPrompt } from "@/components/InstallPrompt";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Role } from "@/generated/prisma/enums";
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

  let role: Role;
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

      {/* Navigation used to live here as a wall of outline buttons; it is now
          the persistent TeamNav in the /t/[teamId] layout, on every team view.
          Role-gated links (directory, settings) are gated there — and, as
          always, enforced by each page itself. */}

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

      {/* Last on the page, and on team home rather than in a layout. This is
          where the invitation email lands everyone and where parents come back
          to, so the offer is made once somewhere they already visit instead of
          following them onto every screen — and it sits below the coaching
          staff's contact card, which is the thing a parent actually came for.
          It renders nothing when the app is already installed, when it has been
          dismissed, or when the browser cannot install at all. */}
      <InstallPrompt />
    </div>
  );
}
