import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusBanner } from "@/components/StatusBanner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APP_NAME } from "@/lib/app-name";
import { messageFor, messageTable } from "@/lib/error-messages";
import { MAX_PLAYBOOK_PLAYS, PLAY_LIBRARY, resolvePlaybook } from "@/lib/plays";
import { hasPlaybook } from "@/lib/sport";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getTeamById, getTeamPlaybook } from "@/lib/teams";

import { PlaybookPicker } from "./PlaybookPicker";

export const metadata = {
  title: `Edit playbook — ${APP_NAME}`,
};

const ERROR_MESSAGES = messageTable({
  "invalid-playbook": "That playbook couldn't be read. Reload and try again.",
  "unknown-play": "One of those plays isn't in the library any more. Reload and try again.",
  "duplicate-play": "A play appeared twice. Reload and try again.",
  "too-many-plays": `A playbook holds up to ${MAX_PLAYBOOK_PLAYS} plays — untick one and save again.`,
  // Doesn't say "reload": the page just re-ran, so the ticks below are
  // already the other coach's.
  "playbook-changed":
    "Another coach changed the playbook while you were choosing — nothing was saved. The ticks below are theirs; make your changes again on top of them.",
  access: "You no longer have access to make this change.",
});

/// The coach's play picker for a basketball team: tick up to five plays from
/// the library. Coach+, and 404 for any sport without a playbook.
export default async function EditPlaybookPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { teamId } = await params;
  const { error, saved } = await searchParams;

  try {
    await requireTeamAccess(teamId, { intent: "read", minRole: "COACH" });
  } catch (caught) {
    if (caught instanceof TeamAccessError) {
      notFound();
    }
    throw caught;
  }

  const team = await getTeamById(teamId);
  if (!team || !hasPlaybook(team.sport)) {
    notFound();
  }

  // The baseline is the stored column exactly as read, so the action's
  // fresh read compares equal on an untouched playbook; the ticks are the
  // plays that still resolve.
  const stored = await getTeamPlaybook(teamId);
  const chosen = resolvePlaybook(stored).map((play) => play.id);
  const errorMessage = messageFor(ERROR_MESSAGES, error);

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <h3 className="text-xl font-semibold text-foreground">Choose plays</h3>

      {errorMessage ? <StatusBanner tone="error">{errorMessage}</StatusBanner> : null}
      {saved && !errorMessage ? (
        <StatusBanner tone="success">
          Playbook saved. The team sees it on the Playbook tab.
        </StatusBanner>
      ) : null}

      {team.archivedAt !== null ? (
        <Card>
          <CardHeader>
            <CardTitle>This team is archived</CardTitle>
            <CardDescription>
              Archived teams are read-only — the playbook can&rsquo;t be changed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href={`/t/${teamId}/playbook`}>Go to the playbook</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Tick up to {MAX_PLAYBOOK_PLAYS} plays for the team. Parents and
            players see each one by name with an animation of it running.
          </p>
          <PlaybookPicker
            teamId={teamId}
            library={PLAY_LIBRARY}
            chosen={chosen}
            baseline={stored}
          />
        </>
      )}
    </div>
  );
}
