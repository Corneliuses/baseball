import { Role } from "@/generated/prisma/enums";
import { db } from "./db";
import type { GateInvitation } from "@/lib/signin-gate";
import { normalizeEmail } from "@/lib/email-address";
import { generateInvitationToken, invitationExpiresAt } from "@/lib/invitation-token";

/// Data loading for the sign-in gate, and the one write that turns an accepted
/// invitation into team access.
///
/// The decision itself lives in signin-gate.ts, which is pure. This module only
/// fetches facts and persists the outcome.

export type SignInContext = {
  /// Every invitation on file for the address, in any state. The gate decides
  /// which of them still count.
  invitations: GateInvitation[];
  hasMembership: boolean;
};

/**
 * Load what the gate needs to judge one address.
 *
 * Matching is case-insensitive because `Invitation.email` and `User.email` are
 * stored as they were typed — the coach entering "Sam@Example.com" must not lock
 * Sam out when they sign in as "sam@example.com".
 */
export async function loadSignInContext(email: string): Promise<SignInContext> {
  const address = email.trim();

  const [invitations, membershipCount] = await Promise.all([
    db.invitation.findMany({
      where: { email: { equals: address, mode: "insensitive" } },
      select: { expiresAt: true, acceptedAt: true },
    }),
    db.membership.count({
      where: { user: { email: { equals: address, mode: "insensitive" } } },
    }),
  ]);

  return { invitations, hasMembership: membershipCount > 0 };
}

/**
 * Consume every live invitation held by this address: mark it accepted and give
 * the user their Membership on that team.
 *
 * Runs from `events.signIn`, which fires on *every* sign-in, so it must be
 * idempotent — on a repeat sign-in the pending set is empty and nothing happens.
 *
 * The upsert's `update` is deliberately empty. Roles never inherit and an
 * existing membership is never modified: someone who coached last season arrives
 * on a new team as whatever their invitation says, and someone already on this
 * team keeps the role they already hold.
 *
 * @returns how many invitations were consumed.
 */
export async function acceptInvitations(
  userId: string,
  email: string,
  now: Date = new Date(),
): Promise<number> {
  const address = email.trim();

  const pending = await db.invitation.findMany({
    where: {
      email: { equals: address, mode: "insensitive" },
      acceptedAt: null,
      expiresAt: { gt: now },
    },
    select: { id: true, teamId: true, role: true },
  });

  if (pending.length === 0) {
    return 0;
  }

  await db.$transaction(
    pending.flatMap((invitation) => [
      db.membership.upsert({
        where: {
          userId_teamId: { userId, teamId: invitation.teamId },
        },
        update: {},
        create: { userId, teamId: invitation.teamId, role: invitation.role },
      }),
      db.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: now },
      }),
    ]),
  );

  return pending.length;
}

/**
 * The `User` row for an invited address, created if it is not there yet.
 *
 * A parent linked to a player already has one — `linkGuardian` upserts it long
 * before they ever sign in — but a coach invited from the members page does
 * not: nothing writes a row for them until Auth.js does. Accepting an
 * invitation has to work for both.
 *
 * `emailVerified` is stamped here because accepting proves the person holds the
 * mailbox the token was mailed to, which is the same thing a magic link proves.
 * `@auth/core` stamps it at exactly this point in its own email flow.
 *
 * The lookup is case-insensitive for the same reason `loadSignInContext`'s is:
 * a `User` row written before `normalizeEmail` existed can differ in case, and
 * a create keyed on the normalized form would collide with it on `User.email`'s
 * unique index rather than finding it.
 */
export async function resolveInvitedUser(
  email: string,
  now: Date = new Date(),
): Promise<{ id: string; email: string }> {
  const address = normalizeEmail(email);

  const existing = await db.user.findFirst({
    where: { email: { equals: address, mode: "insensitive" } },
    select: { id: true, email: true, emailVerified: true },
  });

  if (existing) {
    if (existing.emailVerified === null) {
      await db.user.update({
        where: { id: existing.id },
        data: { emailVerified: now },
      });
    }

    return { id: existing.id, email: existing.email };
  }

  return db.user.create({
    data: { email: address, emailVerified: now },
    select: { id: true, email: true },
  });
}

// ---------------------------------------------------------------------------
// Creating and looking up invitations (#4)
// ---------------------------------------------------------------------------

export type CreatedInvitation = {
  token: string;
  role: Role;
  expiresAt: Date;
};

/**
 * Create a fresh, live invitation for one address on one team.
 *
 * Any unaccepted invitation already on file for this (teamId, email) is
 * deleted first, in the same transaction. `Invitation` has no
 * `@@unique([teamId, email])`, so without this, repeated "resend" clicks
 * would pile up rows that `acceptInvitations` copes with silently — but the
 * pending-invitations list would show one parent several times, and an
 * invitation meant to be revoked would leave its old token still live.
 */
export async function createInvitation(
  input: { teamId: string; email: string; role: Role },
  now: Date = new Date(),
): Promise<CreatedInvitation> {
  const email = normalizeEmail(input.email);

  const [, created] = await db.$transaction([
    db.invitation.deleteMany({
      where: { teamId: input.teamId, email, acceptedAt: null },
    }),
    db.invitation.create({
      data: {
        teamId: input.teamId,
        email,
        role: input.role,
        token: generateInvitationToken(),
        expiresAt: invitationExpiresAt(now),
      },
      select: { token: true, role: true, expiresAt: true },
    }),
  ]);

  return created;
}

export type InvitationByToken = {
  teamId: string;
  teamName: string;
  email: string;
  role: Role;
  expiresAt: Date;
  acceptedAt: Date | null;
};

/**
 * Look up one invitation by its token.
 *
 * Database errors propagate rather than being caught. `/invite/[token]`
 * renders "this invitation isn't valid" on a null return, and telling an
 * invited parent their link is bad because the database blinked sends them
 * back to the coach for a replacement that would fail the same way. Null
 * means "no such token", nothing else — same rule as `getTeamById`.
 */
export async function getInvitationByToken(
  token: string,
): Promise<InvitationByToken | null> {
  const invitation = await db.invitation.findUnique({
    where: { token },
    select: {
      teamId: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      team: { select: { name: true } },
    },
  });

  if (!invitation) {
    return null;
  }

  return {
    teamId: invitation.teamId,
    teamName: invitation.team.name,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt,
  };
}

export type TeamInvitation = {
  id: string;
  email: string;
  role: Role;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
};

export async function listTeamInvitations(
  teamId: string,
): Promise<TeamInvitation[]> {
  try {
    return await db.invitation.findMany({
      where: { teamId },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch team invitations:", message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Linking a guardian to a player (#4)
// ---------------------------------------------------------------------------

export type LinkGuardianInput = {
  teamId: string;
  playerId: string;
  email: string;
  name?: string | null;
};

export type LinkGuardianResult = {
  userId: string;
  email: string;
  /// True only when this call is what created the Membership — the signal
  /// for whether an invitation should be mailed. An already-a-member
  /// guardian (a second linked kid, or someone already accepted) gets
  /// neither a new Invitation row nor a repeat email — see Decision 15 step 4.
  membershipCreated: boolean;
  invitation: CreatedInvitation | null;
};

/**
 * Link a guardian to a player, creating the Membership immediately rather
 * than waiting for the guardian to accept — see design-doc.md #4 Decision 2.
 * Never modifies an existing Membership: the upsert's `update` is empty,
 * exactly like acceptInvitations above.
 */
export async function linkGuardian(
  input: LinkGuardianInput,
  now: Date = new Date(),
): Promise<LinkGuardianResult> {
  const email = normalizeEmail(input.email);

  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: { email, name: input.name ?? null },
    select: { id: true },
  });

  const existingMembership = await db.membership.findUnique({
    where: { userId_teamId: { userId: user.id, teamId: input.teamId } },
    select: { userId: true },
  });
  const membershipCreated = existingMembership === null;

  await db.$transaction([
    db.guardianPlayer.upsert({
      where: {
        userId_playerId: { userId: user.id, playerId: input.playerId },
      },
      update: {},
      create: { userId: user.id, playerId: input.playerId },
    }),
    db.membership.upsert({
      where: { userId_teamId: { userId: user.id, teamId: input.teamId } },
      update: {},
      create: { userId: user.id, teamId: input.teamId, role: "PARENT" },
    }),
  ]);

  if (!membershipCreated) {
    return { userId: user.id, email, membershipCreated: false, invitation: null };
  }

  const invitation = await createInvitation(
    { teamId: input.teamId, email, role: "PARENT" },
    now,
  );

  return { userId: user.id, email, membershipCreated: true, invitation };
}

/// Removes the family link only. The guardian's Membership — and any other
/// kid they guard on this team — is untouched; see design-doc.md #4
/// Decision 4.
export async function unlinkGuardian(
  playerId: string,
  userId: string,
): Promise<void> {
  await db.guardianPlayer.delete({
    where: { userId_playerId: { userId, playerId } },
  });
}

/**
 * Set (or clear, with `null`) a guardian's phone number.
 *
 * Confirms the `GuardianPlayer` link exists before writing — the caller
 * (`setGuardianPhoneAction`) has already proven the userId is a guardian of
 * this specific player via the teamId-scoped roster entry, but this module
 * makes that check load-bearing rather than trusting the caller alone, the
 * same posture `unlinkGuardian`'s composite key takes.
 */
export async function setGuardianPhone(
  playerId: string,
  userId: string,
  phone: string | null,
): Promise<void> {
  const link = await db.guardianPlayer.findUnique({
    where: { userId_playerId: { userId, playerId } },
    select: { userId: true },
  });

  if (!link) {
    throw new Error("No guardian link found for this player and user");
  }

  await db.user.update({
    where: { id: userId },
    data: { phone },
  });
}
