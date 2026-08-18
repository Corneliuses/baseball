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

/// Every other action in this app does one round trip; this one loops, and
/// `bulkInviteGuardiansAction` paces its sends 600ms apart to stay under
/// Resend's rate limit. A full first-season batch is one row per player —
/// ~15 for a youth team (product-brief.md) — so roughly 15 × (600ms + the
/// row's own queries and send), comfortably past the seconds a single-shot
/// action needs but well inside this ceiling. Set at the page level because
/// that is what governs a Server Action's timeout, per Next's route segment
/// config docs.
export const maxDuration = 60;

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-email": "One of the email addresses isn't valid. Nothing was sent.",
  "invalid-message": "The message is too long — keep it under 1,000 characters.",
  "no-emails": "Enter at least one email address.",
  "too-many": "That's too many invitations for one batch. Nothing was sent.",
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
    // Deliberately not "try again here", and deliberately vague about where.
    // `failed` covers three different states: a send that failed (the guardian
    // link exists, so that kid has moved to the covered list below and has no
    // row on this form — the player's page can resend), a roster entry that
    // vanished between render and submit (no link, and no player to open), and
    // a row that threw (indeterminate). Only the roster can tell them apart.
    failed
      ? `${failed} could not be invited — check those players on the roster`
      : null,
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
      ) : needingGuardians.length === 0 ? (
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
