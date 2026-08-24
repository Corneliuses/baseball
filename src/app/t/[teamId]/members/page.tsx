import Link from "next/link";
import { notFound } from "next/navigation";

import { SubmitButton } from "@/components/SubmitButton";
import { Button } from "@/components/ui/button";
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
  removeMemberAction,
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
    removed?: string;
    confirm?: string;
    member?: string;
  }>;
}) {
  const { teamId } = await params;
  const {
    error,
    invited,
    "role-saved": roleSaved,
    revoked,
    resent,
    removed,
    confirm,
    member,
  } = await searchParams;

  // The caller's own id, so the removal confirm can address them in the
  // second person on their own row — leaving the team is the one removal
  // here the person cannot undo for themselves.
  let callerId: string;
  try {
    ({ userId: callerId } = await requireTeamAccess(teamId, {
      intent: "read",
      minRole: "OWNER",
    }));
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
            : removed
              ? "Member removed."
              : null;
  const ownerCount = members.filter((m) => m.role === "OWNER").length;
  // Removal confirms per row, like guardian unlinking on the roster entry
  // page: ?confirm=remove&member=<userId> opens the step on that row only.
  const removingMemberId = confirm === "remove" ? (member ?? null) : null;

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
            {members.map((teamMember) => {
              const isLastOwner =
                teamMember.role === "OWNER" && ownerCount <= 1;
              const displayName = teamMember.name ?? teamMember.email;
              return (
                // Identity on its own row, controls on the row beneath. The
                // old side-by-side flex row gave the text no room to shrink
                // (no min-w-0), so a long address pushed the Save button off
                // the edge of a phone screen instead of wrapping.
                <li
                  key={teamMember.userId}
                  className="space-y-3 rounded-md border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-foreground">
                      {displayName}
                    </p>
                    {/* break-all, not break-words: an address is one long
                        unspaced token, and break-words won't split it until
                        it has already overflowed the card. */}
                    <p className="break-all text-sm text-muted-foreground">
                      {teamMember.email}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <form
                      action={setMemberRoleAction}
                      className="flex items-center gap-2"
                    >
                      <input type="hidden" name="teamId" value={teamId} />
                      <input
                        type="hidden"
                        name="userId"
                        value={teamMember.userId}
                      />
                      <select
                        name="role"
                        defaultValue={teamMember.role}
                        disabled={isLastOwner}
                        aria-label={`Role for ${displayName}`}
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
                    {/* No Remove for the last owner: the same rule that
                        disables their role select — a team must always have
                        an owner, and removeMember enforces it again. */}
                    {!isLastOwner && removingMemberId !== teamMember.userId ? (
                      <Button asChild variant="outline" size="sm">
                        <Link
                          href={`/t/${teamId}/members?confirm=remove&member=${teamMember.userId}`}
                        >
                          Remove
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                  {removingMemberId === teamMember.userId && !isLastOwner ? (
                    <div className="space-y-3 border-t border-border pt-3">
                      {/* Second person on your own row, and a plainer
                          warning: every other removal an owner can undo by
                          re-inviting, but removing yourself takes away the
                          page holding the invite form. Only another owner —
                          or the database — can put you back. */}
                      <p role="alert" className="text-sm text-destructive">
                        {teamMember.userId === callerId ? (
                          <>
                            Remove yourself from this team? You lose access to
                            it immediately, and only another owner can add you
                            back. Your account, family links, and any kids on
                            the roster are not deleted.
                          </>
                        ) : (
                          <>
                            Remove {displayName} from this team? They lose
                            access to this team&apos;s pages. Their account,
                            family links, and any kids on the roster are not
                            deleted.
                          </>
                        )}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <form action={removeMemberAction}>
                          <input type="hidden" name="teamId" value={teamId} />
                          <input
                            type="hidden"
                            name="userId"
                            value={teamMember.userId}
                          />
                          <SubmitButton
                            variant="destructive"
                            size="sm"
                            pendingLabel="Removing…"
                          >
                            Yes, remove them
                          </SubmitButton>
                        </form>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/t/${teamId}/members`}>Cancel</Link>
                        </Button>
                      </div>
                    </div>
                  ) : null}
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
                    <p className="break-all text-sm font-medium text-foreground">
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
