import { db } from "./db";
import type { GateInvitation } from "@/lib/signin-gate";

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
