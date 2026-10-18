import { db } from "./db";
import { normalizeEmail } from "@/lib/email-address";
import { acceptInvitations, loadSignInContext } from "@/lib/invitations";
import { decideSignIn, type GateInvitation } from "@/lib/signin-gate";

/// What happens when the auth service hands back a verified person: which
/// `User` row they are, and whether this app lets them in.
///
/// The service proves identity; it does not decide entry. Its client is open
/// (no allowlist), so anyone who can type an emailed code reaches this point,
/// and the app's own gate — `decideSignIn`, the same function Auth.js's signIn
/// callback ran before the cutover — decides whether that person gets a
/// session. It runs on every login, not just the first, so a removed member
/// stops getting in.
///
/// Split the way the rest of `src/lib/` is: `decideCallback` is the pure
/// decision table, tested row by row; `completeSignIn` loads its inputs and
/// applies the outcome.

/// The id token claims this module reads, already verified by the client
/// package (signature, issuer, audience, expiry, nonce).
export type CallbackClaims = {
  sub: string;
  email: string;
  email_verified: boolean;
  /// Google users only; the service has no name for an emailed-code login.
  name?: string;
};

export type CallbackUserBySub = { id: string; email: string };
export type CallbackUserByEmail = {
  id: string;
  email: string;
  authSub: string | null;
};

export type CallbackInput = {
  claims: CallbackClaims;
  /// The row already linked to this `sub`, if any.
  userBySub: CallbackUserBySub | null;
  /// The row whose email matches the claim case-insensitively. Only consulted
  /// when nothing is linked to the `sub`.
  userByEmail: CallbackUserByEmail | null;
  /// `OWNER_EMAIL`, or null/undefined when unset.
  ownerEmail: string | null | undefined;
  /// The gate's facts, loaded for `gateEmail(claims, userBySub)`.
  invitations: readonly GateInvitation[];
  hasMembership: boolean;
  now: Date;
};

export type CallbackDenyReason =
  /// The service could not vouch for the mailbox.
  | "email-unverified"
  /// The gate refused: no live invitation, no membership, not the owner.
  | "no-invitation"
  /// The address belongs to a row already linked to a *different* service
  /// account. See `decideCallback`.
  | "account-conflict";

export type CallbackDecision =
  /// Already linked; sign in as this row.
  | { kind: "known"; userId: string; email: string }
  /// A pre-existing row (invitation-created, or from the Auth.js era) meeting
  /// the service for the first time; link it, then sign in.
  | { kind: "link"; userId: string; email: string }
  /// Allowed, but no row exists — a coach invited from the members page, or
  /// the owner on a fresh database.
  | { kind: "create"; email: string }
  | { kind: "deny"; reason: CallbackDenyReason };

/**
 * The address the gate judges: the linked row's own email when there is one,
 * otherwise the claim's.
 *
 * Once linked, `sub` wins. `User.email` is never rewritten from the claim —
 * invitations and memberships hang off it — so a person who changes their
 * address at the service keeps their app identity, and is judged by the
 * address the app knows them by.
 */
export function gateEmail(
  claims: Pick<CallbackClaims, "email">,
  userBySub: CallbackUserBySub | null,
): string {
  return userBySub ? userBySub.email : normalizeEmail(claims.email);
}

/**
 * Decide who a verified login is and whether they may enter. In order:
 *
 * 1. `email_verified` false → deny. Every link and create below keys on the
 *    address, so an unproven one can be nobody.
 * 2. A row linked to this `sub` → gate on that row's email → known or deny.
 * 3. A row with this email → if it is linked to some *other* `sub`, deny
 *    (`account-conflict`); otherwise gate → link or deny.
 * 4. No row → gate → create or deny.
 *
 * Step 3's conflict is deliberately a denial and not a re-link. It arises when
 * the person the row was linked to has moved their service account to another
 * address and someone else has since proven the old one. Re-linking would hand
 * that second person the first one's teams, kids and RSVPs. The cost is that a
 * genuine "same person, new service account" needs the operator to clear
 * `authSub` on the row, which is rare and recoverable, where the takeover is
 * neither.
 */
export function decideCallback({
  claims,
  userBySub,
  userByEmail,
  ownerEmail,
  invitations,
  hasMembership,
  now,
}: CallbackInput): CallbackDecision {
  if (claims.email_verified !== true) {
    return { kind: "deny", reason: "email-unverified" };
  }

  const gate = decideSignIn({
    email: gateEmail(claims, userBySub),
    ownerEmail,
    invitations,
    hasMembership,
    now,
  });

  if (userBySub) {
    return gate.allowed
      ? { kind: "known", userId: userBySub.id, email: userBySub.email }
      : { kind: "deny", reason: "no-invitation" };
  }

  if (userByEmail) {
    if (userByEmail.authSub !== null && userByEmail.authSub !== claims.sub) {
      return { kind: "deny", reason: "account-conflict" };
    }

    return gate.allowed
      ? { kind: "link", userId: userByEmail.id, email: userByEmail.email }
      : { kind: "deny", reason: "no-invitation" };
  }

  return gate.allowed
    ? { kind: "create", email: normalizeEmail(claims.email) }
    : { kind: "deny", reason: "no-invitation" };
}

/**
 * The pre-existing row for a claimed address, if any.
 *
 * Case-insensitive for the reason `resolveInvitedUser` gives: rows written
 * before `normalizeEmail` existed may differ in case from the claim. That also
 * means two such rows can both match, so the order is fixed — oldest first —
 * rather than left to Postgres: whichever row gets linked here is the person's
 * identity from then on, and it must not depend on the query plan.
 */
async function findUserByEmail(email: string) {
  return db.user.findFirst({
    where: { email: { equals: normalizeEmail(email), mode: "insensitive" } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      authSub: true,
      emailVerified: true,
    },
  });
}

export type CompleteSignInResult =
  | { status: "signed-in"; userId: string }
  | { status: "denied"; reason: CallbackDenyReason }
  /// Anything that went wrong on the way: a database error, or a write that
  /// lost a race (two first logins at once colliding on `authSub` or `email`).
  /// The callback answers `signin-failed`; retrying is safe, and the retry
  /// finds the row the winning request wrote.
  | { status: "failed" };

/**
 * Resolve a verified login to a `User` row, or refuse it.
 *
 * Fails closed: any error loading the gate's facts or writing the row is
 * `failed`, never a sign-in — a database outage must not open the gate.
 *
 * `acceptInvitations` runs after the row is settled and is logged and
 * swallowed, exactly as Auth.js's `events.signIn` did: the person is allowed
 * in, and a failure there is a row the next login retries.
 */
export async function completeSignIn(
  claims: CallbackClaims,
  now: Date = new Date(),
): Promise<CompleteSignInResult> {
  // Checked before any read: an unverified address is denied whatever the
  // database says, so there is no reason to ask it.
  if (claims.email_verified !== true) {
    return { status: "denied", reason: "email-unverified" };
  }

  let userId: string;
  let userEmail: string;

  try {
    const userBySub = await db.user.findUnique({
      where: { authSub: claims.sub },
      select: { id: true, email: true },
    });

    // With no linked row the gate judges the claim's own address, so the
    // email lookup and the gate's facts do not depend on each other.
    const [userByEmail, context] = await Promise.all([
      userBySub ? null : findUserByEmail(claims.email),
      loadSignInContext(gateEmail(claims, userBySub)),
    ]);

    const decision = decideCallback({
      claims,
      userBySub,
      userByEmail,
      ownerEmail: process.env.OWNER_EMAIL,
      invitations: context.invitations,
      hasMembership: context.hasMembership,
      now,
    });

    switch (decision.kind) {
      case "deny":
        console.warn(`Sign-in denied at callback: ${decision.reason}`);
        return { status: "denied", reason: decision.reason };

      case "known":
        userId = decision.userId;
        userEmail = decision.email;
        break;

      case "link": {
        // Conditional on `authSub`, so a concurrent first login that linked
        // the row to a *different* sub a moment ago is not overwritten.
        // Matching this same `sub` too keeps a doubled first callback (a
        // double tap, a retry while the first is in flight) from failing the
        // request that lost an entirely harmless race.
        const linked = await db.user.updateMany({
          where: {
            id: decision.userId,
            OR: [{ authSub: null }, { authSub: claims.sub }],
          },
          data: {
            authSub: claims.sub,
            // The service has just proven the mailbox, which is what this
            // column records; keep the original stamp when there is one.
            ...(userByEmail?.emailVerified ? {} : { emailVerified: now }),
            // Fill a missing name from Google, never overwrite one a coach
            // or the person typed.
            ...(claims.name && !userByEmail?.name ? { name: claims.name } : {}),
          },
        });
        if (linked.count === 0) {
          console.error("Sign-in callback lost a race linking a user row");
          return { status: "failed" };
        }
        userId = decision.userId;
        userEmail = decision.email;
        break;
      }

      case "create": {
        const created = await db.user.create({
          data: {
            email: decision.email,
            emailVerified: now,
            authSub: claims.sub,
            ...(claims.name ? { name: claims.name } : {}),
          },
          select: { id: true, email: true },
        });
        userId = created.id;
        userEmail = created.email;
        break;
      }
    }
  } catch (error) {
    // Includes a P2002 from two concurrent first logins: both saw no row, and
    // the second create collides on `authSub` or `email`. Not worth telling
    // apart — either way this request did not sign anyone in, and a retry
    // takes the known or link path.
    console.error("Sign-in callback failed:", error);
    return { status: "failed" };
  }

  try {
    await acceptInvitations(userId, userEmail, now);
  } catch (error) {
    console.error("Failed to accept invitations on sign-in:", error);
  }

  return { status: "signed-in", userId };
}
