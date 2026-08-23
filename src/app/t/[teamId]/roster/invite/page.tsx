import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBanner } from "@/components/StatusBanner";
import { messageFor, messageTable } from "@/lib/error-messages";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getRosterWithGuardians } from "@/lib/roster";
import { sortRoster } from "@/lib/roster-rules";

import { InviteForm } from "./InviteForm";

export const metadata = {
  title: "Invite parents — Youth Baseball Team Manager",
};

/// Every other action in this app does one round trip; this one loops, and
/// `bulkInviteGuardiansAction` paces its sends 600ms apart to stay under
/// Resend's rate limit. A full first-season batch is one row per player —
/// ~15 for a youth team (product-brief.md) — so roughly 15 × (600ms + the
/// row's own queries and send), comfortably past the seconds a single-shot
/// action needs but well inside this ceiling. Set at the page level because
/// that is what governs a Server Action's timeout, per Next's route segment
/// config docs.
export const maxDuration = 60;

/// Only one code reaches this page now. Validation problems — a malformed
/// address, an over-long note, an empty batch — are answered inside the form by
/// `bulkInviteGuardiansAction`'s returned state, which is what lets them name
/// the offending row and keep everything typed. Losing access is different in
/// kind: the person is no longer a coach here, so they are redirected out to
/// read it as a page rather than as feedback on a form they cannot use.
const ERROR_MESSAGES = messageTable({
  access: "You no longer have access to make this change.",
});

/// Coach-only, like the chart editors: parents have no link here and minRole
/// turns a pasted URL into a 404. Calls requireTeamAccess itself, independent
/// of the layout — every page under /t/[teamId] does.
export default async function BulkInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { teamId } = await params;
  const { error } = await searchParams;

  try {
    await requireTeamAccess(teamId, { intent: "read", minRole: "COACH" });
  } catch (caught) {
    if (caught instanceof TeamAccessError) {
      notFound();
    }
    throw caught;
  }

  const roster = sortRoster(await getRosterWithGuardians(teamId));
  const needingGuardians = roster.filter(
    (entry) => entry.guardianEmails.length === 0,
  );
  const covered = roster.filter((entry) => entry.guardianEmails.length > 0);

  const errorMessage = messageFor(ERROR_MESSAGES, error);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-xl font-semibold text-foreground">Invite parents</h3>
        <Button asChild variant="outline" size="sm">
          <Link href={`/t/${teamId}/roster`}>Back to roster</Link>
        </Button>
      </div>

      {errorMessage ? (
        <StatusBanner tone="error">{errorMessage}</StatusBanner>
      ) : null}

      {/* An empty roster reaches this page with nothing to invite for, and so
          does a database outage — getRosterWithGuardians swallows read errors
          to an empty list. Neither is "every player already has a parent", and
          this page cannot tell the two apart, so the line commits to neither:
          it points at the roster, which is right either way. */}
      {roster.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No players to invite parents for. Check the roster — invitations start
          from the players on it.
        </p>
      ) : (
        // Rendered whenever the roster has anyone at all, *including* when
        // every player is now covered — which is exactly what a full batch
        // makes true.
        //
        // `linkGuardian` writes the GuardianPlayer row before the email is
        // attempted, so every row the batch touched leaves `needingGuardians`.
        // The action revalidates this page, so gating the form on
        // `needingGuardians.length > 0` would unmount it the moment a full
        // batch succeeded — taking the useActionState state, and with it the
        // per-row results naming who failed, down with it. The empty case
        // belongs inside the form for that reason, not around it.
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Send invitations</CardTitle>
            <CardDescription>
              Enter a parent&apos;s email next to their kid — leave a row blank to
              skip it. Each parent joins with their kid already linked, so
              there&apos;s nothing for them to set up.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteForm
              teamId={teamId}
              rows={needingGuardians.map((entry) => ({
                entryId: entry.id,
                playerName: entry.player.name,
                jerseyNumber: entry.jerseyNumber,
              }))}
            />
          </CardContent>
        </Card>
      )}

      {covered.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Already have a parent linked</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {covered.map((entry) => (
                <li key={entry.id} className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {entry.player.name}
                  </span>{" "}
                  — {entry.guardianEmails.join(", ")}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
