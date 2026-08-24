import { db } from "./db";

/// Who to mail about a team's events, read the one way this app is allowed to
/// read it: **through the roster**, `RosterEntry -> Player -> GuardianPlayer ->
/// User`, never through `Membership`.
///
/// That is not a query preference, it is the data model. Decision 15 splits
/// people from participation — `User` and `Player` carry no team column — so
/// the roster is the only thing that says which families are on *this* team
/// this season. Reading `Membership` instead would mail a coach with no kid on
/// the roster (nothing to tell them about that they did not already do) and
/// would quietly survive a kid being cut, since the membership outlives the
/// roster entry.
///
/// Extracted from `reminder-data.ts`, where this lived privately for #47. #45
/// needs the same audience the moment an event is created, and two copies of a
/// four-level join is exactly the kind of duplication that drifts — one gets a
/// `where` clause and the other does not, and a family silently stops being
/// mailed by one path.
///
/// Errors propagate. Both callers treat "no guardians" as a real, meaningful
/// state — the cron sends nothing, the announcement reports nothing sent — so a
/// swallowed outage would assert that state instead of failing, and a whole
/// team would silently not be told about a game. Same argument `nextGame` makes
/// in schedule.ts.

/// One guardian, as every mailing path needs them: `userId` for push,
/// `email` to send to, `name` to greet by.
export type TeamGuardian = {
  userId: string;
  email: string;
  name: string | null;
};

/// One rostered kid and the households attached to them. Structural rather
/// than Prisma types, so pure callers can build fixtures without importing the
/// generated client.
export type GuardianRosterEntry = {
  playerId: string;
  playerName: string;
  guardians: TeamGuardian[];
};

/**
 * Every rostered player on each of these teams, with their guardians.
 *
 * Batched across teams because the reminder cron reads a whole day at once and
 * a doubleheader is two events on one team — one roster read, not one per
 * event. `listTeamGuardians` is the single-team door onto the same query.
 *
 * Ordering is `jerseyNumber` then `createdAt`, which is what makes the kid list
 * inside one email stable: the cron's receipts are keyed on `(eventId, userId)`
 * and a re-run walks the same sequence, so an unstable order would reshuffle
 * which household a partial run had already reached.
 */
export async function loadGuardianRostersByTeamId(
  teamIds: readonly string[],
): Promise<Map<string, GuardianRosterEntry[]>> {
  const entries = await db.rosterEntry.findMany({
    where: { teamId: { in: [...teamIds] } },
    // Stable, human-meaningful order for the kid list inside one email.
    orderBy: [{ jerseyNumber: "asc" }, { createdAt: "asc" }],
    select: {
      teamId: true,
      player: {
        select: {
          id: true,
          name: true,
          guardians: {
            select: {
              user: { select: { id: true, email: true, name: true } },
            },
          },
        },
      },
    },
  });

  const byTeamId = new Map<string, GuardianRosterEntry[]>();

  for (const entry of entries) {
    const roster = byTeamId.get(entry.teamId) ?? [];
    roster.push({
      playerId: entry.player.id,
      playerName: entry.player.name,
      guardians: entry.player.guardians.map((link) => ({
        userId: link.user.id,
        email: link.user.email,
        name: link.user.name,
      })),
    });
    byTeamId.set(entry.teamId, roster);
  }

  return byTeamId;
}

/**
 * One team's roster with guardians — the door #45's announcement uses.
 *
 * An empty array is the honest answer for a team with nobody rostered yet, and
 * it is distinguishable from a failure because failures throw rather than
 * returning it.
 */
export async function listTeamGuardians(
  teamId: string,
): Promise<GuardianRosterEntry[]> {
  const byTeamId = await loadGuardianRostersByTeamId([teamId]);
  return byTeamId.get(teamId) ?? [];
}
