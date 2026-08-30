import type { Adapter, VerificationToken } from "next-auth/adapters";

import { db } from "./db";

/// One live sign-in code per address — as far as two statements can manage.
///
/// `VerificationToken` is unique on `(identifier, token)` and on `token`, but
/// **not** on `identifier` alone, so every `/signin` POST used to mint another
/// live row for the same address — and `@auth/core`'s `sendToken` starts that
/// write beside the send, so even a send that fails leaves the code behind.
/// Codes therefore accumulated, and the security argument for an 8-character
/// code does not survive that: 40 bits is out of reach for online guessing
/// against *one* live code in a ten-minute window, and there is no attempt
/// counter to lean on (adding one needs a migration — see `signin-code.ts`).
/// N live codes divide the work by N, and N was unbounded by anything but how
/// many times someone could press the button.
///
/// So the wrapper prunes before it creates. A person who asks for a second
/// code invalidates their first, which is also what the wording on
/// `/signin/check-email` implies.
///
/// **Sequential requests, not concurrent ones.** Prune-then-create is two
/// statements, so `A.prune → B.prune → A.create → B.create` leaves both codes
/// live. That is knowingly left open (#81), and the reason it is not patched
/// here is that every available patch is worse. Pruning again *after* the
/// create, excluding one's own token, has an interleaving that deletes both
/// rows and leaves **zero** working codes — and `sendToken` runs
/// `Promise.all([sendRequest, createToken])`, so both people have already been
/// mailed a code by then. A transaction does not help either: at Postgres
/// READ COMMITTED neither sees the other's uncommitted insert. The honest fix
/// is a unique index on `identifier` and an upsert, which needs a migration.
///
/// What is left is bounded by *overlap* rather than by request count — the
/// milliseconds between the two statements — where the unguarded version grew
/// N with every request across the whole ten-minute window, no concurrency
/// needed. See `signin-code.ts` for what N costs the entropy argument.
///
/// The other side of that: anyone who can make the app send to an address can
/// invalidate the code outstanding for it. That grants nothing new — the same
/// request already mailed that address, and the gate still refuses anyone who
/// is not invited — and the newest email is always the live code, which is the
/// behaviour people already expect from a resend.
///
/// It wraps rather than replaces the Prisma adapter because everything else
/// about that adapter is right; this is the one method whose default
/// behaviour the code flow cannot use as-is.
///
/// The `next-auth/adapters` import is `import type`, so it is erased before
/// anything runs — which is what keeps it clear of the rule in
/// `resend-provider.ts` against pulling next-auth's main entry into a module
/// Vitest has to load.

export type PruneCodes = (identifier: string) => Promise<unknown>;

async function pruneCodesInDatabase(identifier: string) {
  return db.verificationToken.deleteMany({ where: { identifier } });
}

/**
 * Wrap an adapter so creating a verification token first deletes every other
 * token held for that identifier. Read the note above on what that does and
 * does not guarantee before relying on it.
 *
 * A prune failure is deliberately not swallowed: it is a database failure, and
 * `createVerificationToken` is about to hit the same database anyway. Letting
 * it throw fails the sign-in loudly rather than quietly widening the guessing
 * surface it exists to close.
 */
export function withSingleLiveCode(
  adapter: Adapter,
  prune: PruneCodes = pruneCodesInDatabase,
): Adapter {
  const create = adapter.createVerificationToken;

  // Nothing to guard if the adapter cannot mint tokens at all.
  if (!create) {
    return adapter;
  }

  return {
    ...adapter,
    async createVerificationToken(token: VerificationToken) {
      await prune(token.identifier);
      return create.call(adapter, token);
    },
  };
}
