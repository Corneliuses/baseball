import { randomBytes } from "node:crypto";

/// Token generation and liveness for `Invitation` rows.
///
/// `isLiveInvitation` is shared between the sign-in gate (signin-gate.ts,
/// which decides whether an address may request a magic link at all) and the
/// `/invite/[token]` accept page (which decides what that one row's state
/// means for the person who just clicked it). One definition of "live" is
/// what keeps the two from drifting apart.

export const INVITATION_TTL_DAYS = 14;

/// 32 random bytes, base64url-encoded — URL-safe with no padding, so it drops
/// straight into `/invite/<token>` with no escaping.
export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function invitationExpiresAt(now: Date): Date {
  return new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export type InvitationLiveness = {
  expiresAt: Date;
  acceptedAt: Date | null;
};

/**
 * Whether an invitation still admits its holder.
 *
 * Strictly greater than on expiry: an invitation expiring exactly `now` is
 * expired, matching the boundary `signin-gate.ts` already asserted before
 * this module existed.
 */
export function isLiveInvitation(
  invitation: InvitationLiveness,
  now: Date,
): boolean {
  if (invitation.acceptedAt !== null) {
    return false;
  }

  return invitation.expiresAt.getTime() > now.getTime();
}
