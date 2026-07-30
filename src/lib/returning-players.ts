/// Pure core of the returning-player cascade (Decision 15, step 2–3): given the
/// guardians of a player being added to a new team and the userIds that
/// already hold a Membership there, decide which guardians need a brand-new
/// Membership and which are already covered.
///
/// `toCreate` is the ONLY set that may ever produce a write or an email. It is
/// deliberately not expressed as an upsert-with-empty-update — the caller
/// writes `toCreate` with `membership.createMany`, a statement with no update
/// branch, so a guardian who already holds a Membership (as PARENT, COACH, or
/// OWNER) can never have their role touched by this path. See design-doc.md
/// #5 Decision 1.

export type GuardianLink = {
  userId: string;
  email: string;
  name: string | null;
};

export type GuardianCascadePlan = {
  /// Guardians who need a new Membership(team, PARENT) and a notice email.
  toCreate: GuardianLink[];
  /// Guardians who already hold a Membership on this team. Untouched, unmailed.
  alreadyMembers: GuardianLink[];
};

/**
 * Split a player's guardians into those needing a new Membership and those
 * who already have one, deduplicating by `userId` (a guardian can appear
 * only once regardless of how many `GuardianPlayer` rows produced the list).
 */
export function planGuardianCascade(
  guardians: readonly GuardianLink[],
  existingMemberUserIds: readonly string[],
): GuardianCascadePlan {
  const existing = new Set(existingMemberUserIds);
  const seen = new Set<string>();
  const toCreate: GuardianLink[] = [];
  const alreadyMembers: GuardianLink[] = [];

  for (const guardian of guardians) {
    if (seen.has(guardian.userId)) {
      continue;
    }
    seen.add(guardian.userId);

    if (existing.has(guardian.userId)) {
      alreadyMembers.push(guardian);
    } else {
      toCreate.push(guardian);
    }
  }

  return { toCreate, alreadyMembers };
}

export type ReturningCandidateTeam = {
  id: string;
  name: string;
  season: string | null;
  archivedAt: Date | null;
};

export type ReturningCandidate = {
  playerId: string;
  name: string;
  dateOfBirth: Date | null;
  teams: ReturningCandidateTeam[];
  guardianCount: number;
};

/// Alphabetical by name, matching sortRoster's tie-break for unnumbered
/// players (roster-rules.ts) — the picker has no jersey number yet to sort by.
export function sortReturningCandidates<T extends { name: string }>(
  candidates: T[],
): T[] {
  return [...candidates].sort((a, b) => a.name.localeCompare(b.name));
}
