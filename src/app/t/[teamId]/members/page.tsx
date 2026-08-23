import { notFound } from "next/navigation";

import { SubmitButton } from "@/components/SubmitButton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBanner } from "@/components/StatusBanner";
import { formatEventDayLabel } from "@/lib/calendar";
import { messageFor } from "@/lib/error-messages";
import { ROLE_LABELS, roleLabel } from "@/lib/roles";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { listTeamMembers } from "@/lib/memberships";
import { listTeamInvitations } from "@/lib/invitations";
import { isLiveInvitation } from "@/lib/invitation-token";

import {
  resendInvitationAction,
  revokeInvitationAction,
  setMemberRoleAction,
} from "./actions";
import { InviteMemberForm } from "./InviteMemberForm";
import { MEMBER_ERROR_MESSAGES } from "./member-messages";

export const metadata = {
  title: "Members — Youth Baseball Team Manager",
};

const ROLE_OPTIONS = ["OWNER", "COACH", "PARENT"] as const;

/// Owner-only, both to view and to write — unlike the roster, members and
/// invitations are not something every parent needs to see.
export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{
    error?: string;
    invited?: string;
    "role-saved"?: string;
    revoked?: string;
    resent?: string;
  }>;
}) {
  const { teamId } = await params;
  const {
    error,
    invited,
    "role-saved": roleSaved,
    revoked,
    resent,
  } = await searchParams;

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

  const errorMessage = messageFor(MEMBER_ERROR_MESSAGES, error);
  // Every write on this page now says whether it worked. The role change in
  // particular used to redirect with no param at all, so a successful save
  // looked exactly like a click that did nothing (C7).
  const successMessage = errorMessage
    ? null
    : invited
      ? "Invitation sent."
      : roleSaved
        ? "Role updated."
        : revoked
          ? "Invitation withdrawn."
          : resent
            ? "Invitation sent again — the previous link no longer works."
            : null;
  const ownerCount = members.filter((member) => member.role === "OWNER").length;

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold text-foreground">Members</h3>

      {errorMessage ? (
        <StatusBanner tone="error">{errorMessage}</StatusBanner>
      ) : null}

      {successMessage ? (
        <StatusBanner tone="success">{successMessage}</StatusBanner>
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
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                    <SubmitButton
                      variant="outline"
                      size="sm"
                      disabled={isLastOwner}
                      pendingLabel="Saving…"
                    >
                      Save
                    </SubmitButton>
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
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {invitation.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Invited as {roleLabel(invitation.role)} ·{" "}
                      {/* The row used to say nothing about time, so an owner
                          had no way to know an invitation was about to lapse —
                          or why one had silently vanished from this list. */}
                      Expires {formatEventDayLabel(invitation.expiresAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <form action={resendInvitationAction}>
                      <input type="hidden" name="teamId" value={teamId} />
                      <input
                        type="hidden"
                        name="invitationId"
                        value={invitation.id}
                      />
                      <SubmitButton
                        variant="outline"
                        size="sm"
                        pendingLabel="Sending…"
                      >
                        Resend
                      </SubmitButton>
                    </form>
                    <form action={revokeInvitationAction}>
                      <input type="hidden" name="teamId" value={teamId} />
                      <input
                        type="hidden"
                        name="invitationId"
                        value={invitation.id}
                      />
                      <SubmitButton
                        variant="outline"
                        size="sm"
                        pendingLabel="Withdrawing…"
                      >
                        Withdraw
                      </SubmitButton>
                    </form>
                  </div>
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
          <InviteMemberForm teamId={teamId} />
        </CardContent>
      </Card>
    </div>
  );
}
