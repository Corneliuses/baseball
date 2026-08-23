import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/SubmitButton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Role } from "@/generated/prisma/enums";
import { messageFor, messageTable } from "@/lib/error-messages";
import { listTeamMembers } from "@/lib/memberships";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";

import { AudienceFields } from "./AudienceFields";
import { sendTeamMessageAction } from "./actions";

export const metadata = {
  title: "New message — Youth Baseball Team Manager",
};

/// The action loops over the audience, pacing sends 600ms apart to stay
/// under Resend's rate limit — a full-team broadcast is ~25 parents, so
/// roughly 25 × (600ms + the send itself), past what a single-shot action
/// needs but well inside this ceiling. Set at the page level because that is
/// what governs a Server Action's timeout, per Next's route segment config
/// docs — the same coupling as roster/invite.
export const maxDuration = 60;

// messageTable, never a bare literal — see src/lib/error-messages.ts.
const ERROR_MESSAGES = messageTable({
  "invalid-audience": "Choose who this message goes to. Nothing was sent.",
  "invalid-subject": "Enter a subject — keep it under 200 characters.",
  "invalid-body": "Enter a message — keep it under 5,000 characters.",
  "forbidden-audience": "You can't message that group. Nothing was sent.",
  // Covers both "no parent chosen" and "chosen parent isn't on this team" —
  // resolveRecipients returns the same reason for both, so the copy commits
  // to neither.
  "invalid-target": "Choose a parent to message. Nothing was sent.",
  "no-recipients": "There's nobody in that group to email yet.",
  "too-many": "That's too many recipients for one send. Nothing was sent.",
  access: "You no longer have access to send this.",
});

/// Any member may open this page — a parent's audience is fixed to the
/// coaching staff, a coach picks between the whole parent group and one
/// parent. The role fork here is presentational; the action re-derives the
/// caller's role and the pure resolver enforces the audience matrix, so a
/// forged POST can't widen who a parent reaches.
export default async function NewMessagePage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ error?: string; sent?: string; failed?: string }>;
}) {
  const { teamId } = await params;
  const { error, sent, failed } = await searchParams;

  let role: Role;
  try {
    ({ role } = await requireTeamAccess(teamId, { intent: "read" }));
  } catch (caught) {
    if (caught instanceof TeamAccessError) {
      notFound();
    }
    throw caught;
  }

  const isCoach = role !== "PARENT";
  const parents = isCoach
    ? (await listTeamMembers(teamId)).filter((m) => m.role === "PARENT")
    : [];

  const errorMessage = messageFor(ERROR_MESSAGES, error);
  const statusParts = [
    sent ? `Sent to ${sent} ${sent === "1" ? "person" : "people"}` : null,
    failed
      ? `${failed} ${failed === "1" ? "email" : "emails"} could not be sent`
      : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-xl font-semibold text-foreground">New message</h3>
        {isCoach ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/t/${teamId}/messages`}>Sent messages</Link>
          </Button>
        ) : null}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {isCoach ? "Email the team" : "Email the coaches"}
          </CardTitle>
          <CardDescription>
            {isCoach
              ? "Goes out by email, one copy per recipient — nobody sees anyone else's address. Replies come straight back to your inbox."
              : "Reaches every coach on this team at once, by email. Replies come straight back to your inbox."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={sendTeamMessageAction} className="space-y-4">
            <input type="hidden" name="teamId" value={teamId} />

            {isCoach ? (
              <AudienceFields parents={parents} />
            ) : (
              <input type="hidden" name="audience" value="ALL_COACHES" />
            )}

            <div className="space-y-2">
              <label
                htmlFor="subject"
                className="block text-sm font-medium text-foreground"
              >
                Subject
              </label>
              <input
                id="subject"
                name="subject"
                type="text"
                required
                maxLength={200}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="body"
                className="block text-sm font-medium text-foreground"
              >
                Message
              </label>
              <textarea
                id="body"
                name="body"
                rows={6}
                required
                maxLength={5000}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <SubmitButton className="w-full" pendingLabel="Sending…">
              Send
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
