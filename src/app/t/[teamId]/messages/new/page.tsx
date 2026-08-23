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
import type { Role } from "@/generated/prisma/enums";
import { messageFor } from "@/lib/error-messages";
import { listTeamMembers } from "@/lib/memberships";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";

import { ComposeForm } from "./ComposeForm";
import { COMPOSE_ERROR_MESSAGES } from "./message-messages";

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

  const errorMessage = messageFor(COMPOSE_ERROR_MESSAGES, error);
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
          <ComposeForm teamId={teamId} isCoach={isCoach} parents={parents} />
        </CardContent>
      </Card>
    </div>
  );
}
