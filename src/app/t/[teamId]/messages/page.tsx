import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Role } from "@/generated/prisma/enums";
import { formatEventDateTime } from "@/lib/calendar";
import { listMessages } from "@/lib/messages";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";

export const metadata = {
  title: "Messages — Youth Baseball Team Manager",
};

/// Broadcast history — coach-and-above only, like /directory (owner decision,
/// 2026-08-20). Only coach → all-parents broadcasts persist as Message rows,
/// so this list is unambiguously "team announcements"; a parent's record of
/// what they were sent is their own inbox, and their side of this page is the
/// compose form, so they land there instead of on a 404.
export default async function MessagesPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;

  let role: Role;
  try {
    ({ role } = await requireTeamAccess(teamId, { intent: "read" }));
  } catch (caught) {
    if (caught instanceof TeamAccessError) {
      notFound();
    }
    throw caught;
  }

  if (role === "PARENT") {
    redirect(`/t/${teamId}/messages/new`);
  }

  const messages = await listMessages(teamId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-xl font-semibold text-foreground">Messages</h3>
        <Button asChild size="sm">
          <Link href={`/t/${teamId}/messages/new`}>New message</Link>
        </Button>
      </div>

      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No broadcasts yet. Messages you send to all parents are recorded
          here; emails to one parent go out without leaving a copy.
        </p>
      ) : (
        <ul className="space-y-4">
          {messages.map((message) => (
            <li key={message.id}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{message.subject}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {message.senderName ?? message.senderEmail} —{" "}
                    {formatEventDateTime(message.sentAt)}
                  </p>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {message.body}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
