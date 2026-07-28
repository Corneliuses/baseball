import { isOwnerEmail } from "@/lib/owner";

/// Who is allowed to obtain a magic link, and therefore an account.
///
/// There is no self-serve signup path in this app: an address gets in only if it
/// holds a live Invitation, already holds a Membership somewhere, or is the
/// instance owner. This is the whole gate — Auth.js's signIn callback loads the
/// facts and calls this function with them.
///
/// Deliberately pure and DB-free so every row of the decision table is tested
/// without a database, following the same split as team-access.ts.

/// Only the two columns the decision actually reads. Keeping this narrow means the
/// loader can select narrowly too, and the test fixtures stay honest.
export type GateInvitation = {
  expiresAt: Date;
  acceptedAt: Date | null;
};

export type SignInGateInput = {
  /// The address requesting a link, as typed.
  email: string | null | undefined;
  /// OWNER_EMAIL, or null/undefined when unset.
  ownerEmail: string | null | undefined;
  /// Every invitation on file for this address, in any state.
  invitations: readonly GateInvitation[];
  /// Whether the address holds a Membership on any team.
  hasMembership: boolean;
  now: Date;
};

export type SignInReason =
  | "owner"
  | "invitation"
  | "membership"
  | "no-invitation";

export type SignInDecision = {
  allowed: boolean;
  /// Why — for server-side logging only. It is never shown to the visitor: the
  /// sign-in form answers identically either way so it cannot be used to test
  /// which families are on a team.
  reason: SignInReason;
};

/**
 * Decide whether an address may receive a magic link.
 *
 * Note what is deliberately absent: any notion of archived teams or of role.
 * Signing in is not a write, and a role is meaningless until a team is in the
 * URL — those checks belong in requireTeamAccess, not here.
 */
export function decideSignIn({
  email,
  ownerEmail,
  invitations,
  hasMembership,
  now,
}: SignInGateInput): SignInDecision {
  // Checked first, and before any User lookup, because the owner's row does not
  // exist yet the first time they sign in.
  if (isOwnerEmail(email, ownerEmail)) {
    return { allowed: true, reason: "owner" };
  }

  if (invitations.some((invitation) => isLive(invitation, now))) {
    return { allowed: true, reason: "invitation" };
  }

  // A returning parent whose invitation was consumed seasons ago still gets in.
  if (hasMembership) {
    return { allowed: true, reason: "membership" };
  }

  return { allowed: false, reason: "no-invitation" };
}

function isLive(invitation: GateInvitation, now: Date): boolean {
  if (invitation.acceptedAt !== null) {
    return false;
  }

  // Strictly greater than: an invitation expiring exactly now is expired.
  return invitation.expiresAt.getTime() > now.getTime();
}
