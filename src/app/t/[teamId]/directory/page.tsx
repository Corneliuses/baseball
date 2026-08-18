import { notFound } from "next/navigation";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { listDirectory } from "@/lib/memberships";
import { sortDirectory } from "@/lib/directory-rules";

export const metadata = {
  title: "Directory — Youth Baseball Team Manager",
};

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  COACH: "Coach",
  PARENT: "Parent",
};

/// Coach-and-above only. The directory is every family's contact details in
/// one list, so it is staff-facing: a parent gets no route to another
/// family's phone number or email. Nothing links here for a parent, and
/// minRole turns a pasted URL into a 404.
///
/// Each member's kid list stays scoped to THIS team's roster (see
/// design-doc.md #5 Decision 5), so a coach on this team never learns what
/// other team a child also plays on.
export default async function DirectoryPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;

  try {
    await requireTeamAccess(teamId, { intent: "read", minRole: "COACH" });
  } catch (caught) {
    if (caught instanceof TeamAccessError) {
      notFound();
    }
    throw caught;
  }

  const directory = sortDirectory(await listDirectory(teamId));

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold text-foreground">Directory</h3>

      {directory.length === 0 ? (
        <p className="text-sm text-muted-foreground">No members yet.</p>
      ) : (
        <ul className="space-y-2">
          {directory.map((entry) => (
            <li key={entry.userId}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {entry.name ?? entry.email}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      · {ROLE_LABELS[entry.role] ?? entry.role}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p>
                    <a href={`mailto:${entry.email}`} className="text-foreground underline">
                      {entry.email}
                    </a>
                  </p>
                  <p className="text-muted-foreground">
                    {entry.phone ? (
                      <a href={`tel:${entry.phone}`} className="underline">
                        {entry.phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </p>
                  {entry.players.length > 0 ? (
                    <p className="text-muted-foreground">
                      {entry.players.map((player) => player.name).join(", ")}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
