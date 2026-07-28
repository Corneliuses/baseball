/// The single global owner of this instance, named by the OWNER_EMAIL environment
/// variable rather than a column — the app is multi-*team* but single-*owner*, so
/// there is nothing to store.
///
/// This address is the one exception to the invitation gate: it can always sign in,
/// including before any User row exists, which is how the very first account comes
/// into being. It is also the only account permitted to create teams (enforced
/// separately, in requireTeamAccess).
///
/// Pure and DB-free so it tests without a database.

/**
 * Case-insensitive comparison of an address against the configured owner.
 *
 * Returns false when either side is missing or blank — an unset OWNER_EMAIL means
 * nobody holds the exception, which fails closed. Invited users are unaffected;
 * only the bootstrap path stops working, which is the correct outcome for a
 * misconfigured deployment.
 */
export function isOwnerEmail(
  email: string | null | undefined,
  ownerEmail: string | null | undefined,
): boolean {
  const candidate = normalize(email);
  const owner = normalize(ownerEmail);

  if (candidate === "" || owner === "") {
    return false;
  }

  return candidate === owner;
}

function normalize(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}
