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
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getRosterWithGuardians } from "@/lib/roster";
import { sortRoster } from "@/lib/roster-rules";

import { bulkInviteGuardiansAction } from "./actions";

export const metadata = {
  title: "Invite parents — Youth Baseball Team Manager",
};

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-email": "One of the email addresses isn't valid. Nothing was sent.",
  "invalid-message": "The message is too long — keep it under 1,000 characters.",
  "no-emails": "Enter at least one email address.",
  access: "You no longer have access to make this change.",
};

/// Coach-only, like the chart editors: parents have no link here and minRole
/// turns a pasted URL into a 404. Calls requireTeamAccess itself, independent
/// of the layout — every page under /t/[teamId] does.
export default async function BulkInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{
    error?: string;
    sent?: string;
    linked?: string;
    failed?: string;
  }>;
}) {
  const { teamId } = await params;
  const { error, sent, linked, failed } = await searchParams;

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

  const errorMessage = error
    ? (ERROR_MESSAGES[error] ?? "Something went wrong.")
    : null;
  const statusParts = [
    sent ? `${sent} invitation${sent === "1" ? "" : "s"} sent` : null,
    linked ? `${linked} already-member parent${linked === "1" ? "" : "s"} linked` : null,
    failed ? `${failed} could not be sent — check the addresses and try again` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-xl font-semibold text-foreground">Invite parents</h3>
        <Button asChild variant="outline" size="sm">
          <Link href={`/t/${teamId}/roster`}>Back to roster</Link>
        </Button>
      </div>

      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {!errorMessage && statusParts.length > 0 ? (
        <p role="status" className="text-sm text-muted-foreground">
          {statusParts.join(". ")}.
        </p>
      ) : null}

      {needingGuardians.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Every player already has a parent linked. To add another parent for a
          kid, open the player from the roster.
        </p>
      ) : (
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
            <form action={bulkInviteGuardiansAction} className="space-y-4">
              <input type="hidden" name="teamId" value={teamId} />

              <ul className="space-y-3">
                {needingGuardians.map((entry) => (
                  <li key={entry.id} className="space-y-1">
                    <label
                      htmlFor={`email-${entry.id}`}
                      className="block text-sm font-medium text-foreground"
                    >
                      {entry.player.name}
                      {entry.jerseyNumber !== null ? ` (#${entry.jerseyNumber})` : ""}
                    </label>
                    <input
                      id={`email-${entry.id}`}
                      name={`email-${entry.id}`}
                      type="email"
                      placeholder="parent@example.com"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </li>
                ))}
              </ul>

              <div className="space-y-2">
                <label
                  htmlFor="message"
                  className="block text-sm font-medium text-foreground"
                >
                  Message (optional)
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={4}
                  maxLength={1000}
                  placeholder="A note included in every invitation email."
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <Button type="submit" className="w-full">
                Send invitations
              </Button>
            </form>
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
