import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { messageFor, messageTable } from "@/lib/error-messages";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { listTeamMembers } from "@/lib/memberships";
import { listTeamInvitations } from "@/lib/invitations";
import { isLiveInvitation } from "@/lib/invitation-token";

import { inviteMemberAction, setMemberRoleAction } from "./actions";

export const metadata = {
  title: "Members — Youth Baseball Team Manager",
};

const ERROR_MESSAGES = messageTable({
  "invalid-invite": "Enter a valid email and choose a role.",
  "invalid-role": "Choose a valid role.",
  "email-failed": "The invitation could not be sent. Try again.",
  "last-owner": "This team must always have at least one owner.",
  access: "You no longer have access to make this change.",
});

const ROLE_OPTIONS = ["OWNER", "COACH", "PARENT"] as const;

/// Owner-only, both to view and to write — unlike the roster, members and
/// invitations are not something every parent needs to see.
export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ error?: string; invited?: string }>;
}) {
  const { teamId } = await params;
  const { error, invited } = await searchParams;

  try {
    await requireTeamAccess(teamId, { intent: "read", minRole: "OWNER" });
  } catch (caught) {
    if (caught instanceof TeamAccessError) {
      notFound();
    }
    throw caught;
  }

  const [members, invitations] = await Promise.all([
    listTeamMembers(teamId),
    listTeamInvitations(teamId),
  ]);

  const now = new Date();
  const pendingInvitations = invitations.filter((invitation) =>
    isLiveInvitation(invitation, now),
  );

  const errorMessage = messageFor(ERROR_MESSAGES, error);
  const ownerCount = members.filter((member) => member.role === "OWNER").length;

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold text-foreground">Members</h3>

      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {invited && !errorMessage ? (
        <p role="status" className="text-sm text-muted-foreground">
          Invitation sent.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Team members</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {members.map((member) => {
              const isLastOwner = member.role === "OWNER" && ownerCount <= 1;
              return (
                <li
                  key={member.userId}
                  className="flex items-center justify-between gap-4 rounded-md border border-border p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {member.name ?? member.email}
                    </p>
                    <p className="text-sm text-muted-foreground">{member.email}</p>
                  </div>
                  <form action={setMemberRoleAction} className="flex items-center gap-2">
                    <input type="hidden" name="teamId" value={teamId} />
                    <input type="hidden" name="userId" value={member.userId} />
                    <select
                      name="role"
                      defaultValue={member.role}
                      disabled={isLastOwner}
                      aria-label={`Role for ${member.name ?? member.email}`}
                      className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground disabled:opacity-50"
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" variant="outline" size="sm" disabled={isLastOwner}>
                      Save
                    </Button>
                  </form>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pending invitations</CardTitle>
          <CardDescription>Live invitations not yet accepted.</CardDescription>
        </CardHeader>
        <CardContent>
          {pendingInvitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending invitations.</p>
          ) : (
            <ul className="space-y-2">
              {pendingInvitations.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex items-center justify-between gap-4 rounded-md border border-border p-3"
                >
                  <p className="text-sm font-medium text-foreground">{invitation.email}</p>
                  <p className="text-xs text-muted-foreground">Invited as {invitation.role}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Invite someone</CardTitle>
          <CardDescription>
            Coaches and parents both receive the same one-time sign-in link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={inviteMemberAction} className="space-y-4">
            <input type="hidden" name="teamId" value={teamId} />

            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-foreground">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="coach@example.com"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="role" className="block text-sm font-medium text-foreground">
                Role
              </label>
              <select
                id="role"
                name="role"
                defaultValue="PARENT"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="PARENT">Parent</option>
                <option value="COACH">Coach</option>
              </select>
            </div>

            <Button type="submit" className="w-full">
              Send invitation
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
