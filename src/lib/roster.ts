import { db } from "./db";
import { planGuardianCascade, type GuardianLink } from "./returning-players";
import type { ReturningCandidate } from "./returning-players";

/// Team-scoped roster reads and writes, per AGENTS.md — "Never call Prisma
/// directly from a component."
///
/// Error handling differs by shape, not by read-vs-write:
///   - `getRoster` (a list) swallows database errors and returns an empty
///     result, matching teams.ts's rationale — a dead database should render
///     an empty page, not hang a build or crash a request.
///   - `getRosterEntry` (a single lookup) does NOT swallow errors — its
///     caller turns a null return into `notFound()`, so a caught outage would
///     misreport "this player doesn't exist" instead of failing loudly. Same
///     fix `getTeamById` got in #3 (commit 9709481). See its own docstring.
///   - Every mutation propagates too: callers (server actions) run
///     requireTeamAccess before calling any of these, and a write that
///     silently fails and still looks like it succeeded is worse than one
///     that throws.
///
/// `Player` carries only `name` and `dateOfBirth` — see the schema comment at
/// prisma/schema.prisma:82-84. `battingOrder` and `position` on `RosterEntry`
/// are never written here; they belong to #10 and #11.

export type RosterEntry = {
  id: string;
  jerseyNumber: number | null;
  player: {
    id: string;
    name: string;
    dateOfBirth: Date | null;
  };
};

export type RosterEntryGuardian = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  /// Holds a Membership on *this* team. Effectively always true for a guardian
  /// linked through linkGuardian, which creates the membership up front — but
  /// not guaranteed once #5 can put a player on a second team, so it is read
  /// rather than assumed.
  isMember: boolean;
  /// Has actually signed in at least once. `User.emailVerified` is set by the
  /// Auth.js adapter on the first magic-link click, and a row exists well
  /// before that (prisma/schema.prisma:61-64) — so this, NOT isMember, is what
  /// separates "invitation still outstanding" from "onboarded". Membership is
  /// created the moment a guardian is linked, so isMember would report every
  /// guardian as onboarded the instant they were added.
  hasSignedIn: boolean;
};

export type RosterEntryDetail = RosterEntry & {
  guardians: RosterEntryGuardian[];
};

const ROSTER_ENTRY_SELECT = {
  id: true,
  jerseyNumber: true,
  player: {
    select: {
      id: true,
      name: true,
      dateOfBirth: true,
    },
  },
} as const;

export async function getRoster(teamId: string): Promise<RosterEntry[]> {
  try {
    return await db.rosterEntry.findMany({
      where: { teamId },
      select: ROSTER_ENTRY_SELECT,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch roster:", message);
    return [];
  }
}

/**
 * One roster spot on one team, with the player's guardians.
 *
 * Database errors are deliberately NOT swallowed. Callers turn a null return
 * into `notFound()`, so a caught outage would render "this player doesn't
 * exist" for a player who does — the same bug `getTeamById` was fixed for in
 * #3 (commit 9709481). Null here means "not on this team", nothing else.
 *
 * This is also the authoritative resolver for a player's id: it is scoped by
 * `teamId`, so server actions derive `playerId` from it rather than trusting
 * a form field.
 */
export async function getRosterEntry(
  teamId: string,
  entryId: string,
): Promise<RosterEntryDetail | null> {
  const entry = await db.rosterEntry.findFirst({
    where: { id: entryId, teamId },
    select: {
      ...ROSTER_ENTRY_SELECT,
      player: {
        select: {
          id: true,
          name: true,
          dateOfBirth: true,
          guardians: {
            select: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  emailVerified: true,
                  memberships: {
                    where: { teamId },
                    select: { role: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!entry) {
    return null;
  }

  return {
    id: entry.id,
    jerseyNumber: entry.jerseyNumber,
    player: {
      id: entry.player.id,
      name: entry.player.name,
      dateOfBirth: entry.player.dateOfBirth,
    },
    guardians: entry.player.guardians.map(({ user }) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      isMember: user.memberships.length > 0,
      hasSignedIn: user.emailVerified !== null,
    })),
  };
}

export type AddPlayerInput = {
  name: string;
  dateOfBirth: Date | null;
  jerseyNumber: number | null;
};

/**
 * Create a `Player` and its `RosterEntry` on this team in one statement.
 *
 * A nested write, not a `$transaction` array, for the same reason as
 * `createTeam` in teams.ts: the roster entry needs the player's id and that
 * id doesn't exist until the player is created.
 */
export async function addPlayerToRoster(
  teamId: string,
  input: AddPlayerInput,
): Promise<RosterEntry> {
  return db.rosterEntry.create({
    data: {
      team: { connect: { id: teamId } },
      jerseyNumber: input.jerseyNumber,
      player: {
        create: {
          name: input.name,
          dateOfBirth: input.dateOfBirth,
        },
      },
    },
    select: ROSTER_ENTRY_SELECT,
  });
}

export type UpdateRosterEntryInput = {
  name: string;
  dateOfBirth: Date | null;
  jerseyNumber: number | null;
};

export async function updateRosterEntry(
  teamId: string,
  entryId: string,
  input: UpdateRosterEntryInput,
): Promise<RosterEntry> {
  const entry = await db.rosterEntry.update({
    where: { id: entryId, teamId },
    data: {
      jerseyNumber: input.jerseyNumber,
      player: {
        update: {
          name: input.name,
          dateOfBirth: input.dateOfBirth,
        },
      },
    },
    select: ROSTER_ENTRY_SELECT,
  });

  return entry;
}

/// Deletes the roster spot only. `Player` and `GuardianPlayer` survive —
/// #5's returning-player picker reads them, and a guardian may still have
/// another kid rostered on this team. See design-doc.md #4 Decision 4.
export async function removeRosterEntry(
  teamId: string,
  entryId: string,
): Promise<void> {
  await db.rosterEntry.delete({
    where: { id: entryId, teamId },
  });
}

// ---------------------------------------------------------------------------
// Returning players (#5)
// ---------------------------------------------------------------------------

/**
 * Every `Player` rostered on some OTHER team and not on this one — the
 * candidate set for the returning-player picker.
 *
 * This is the one legitimate global `Player` read in the app (Decision 13):
 * every other path reaches people through a team's `RosterEntry` or
 * `Membership` rows, but the picker's whole purpose is to look across teams.
 * It is gated by `requireTeamAccess(..., { minRole: "OWNER" })` in the caller,
 * not here — this module has no notion of the current user.
 *
 * The exclusion (`NOT: rosterEntries.some({ teamId })`) is for the operator's
 * benefit; the real guarantee that a player can't be added twice is
 * `RosterEntry @@unique([playerId, teamId])`, enforced in addReturningPlayer.
 */
export async function listReturningCandidates(
  teamId: string,
): Promise<ReturningCandidate[]> {
  try {
    const players = await db.player.findMany({
      where: {
        rosterEntries: { some: { teamId: { not: teamId } } },
        NOT: { rosterEntries: { some: { teamId } } },
      },
      select: {
        id: true,
        name: true,
        dateOfBirth: true,
        rosterEntries: {
          select: {
            team: {
              select: { id: true, name: true, season: true, archivedAt: true },
            },
          },
        },
        _count: { select: { guardians: true } },
      },
    });

    return players.map((player) => ({
      playerId: player.id,
      name: player.name,
      dateOfBirth: player.dateOfBirth,
      teams: player.rosterEntries.map((entry) => entry.team),
      guardianCount: player._count.guardians,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch returning candidates:", message);
    return [];
  }
}

/**
 * Whether one specific player is still a valid returning candidate for this
 * team — the write-path counterpart to `listReturningCandidates`.
 *
 * Database errors are deliberately NOT swallowed, unlike the list above. The
 * caller turns `false` into "that player is no longer available to add", so a
 * caught outage would report a perfectly addable player as unavailable *and*
 * silently decline the write — the same bug `getRosterEntry` documents and
 * `getTeamById` was fixed for in #3. `false` here means "not a candidate",
 * nothing else.
 */
export async function isReturningCandidate(
  teamId: string,
  playerId: string,
): Promise<boolean> {
  const player = await db.player.findFirst({
    where: {
      id: playerId,
      rosterEntries: { some: { teamId: { not: teamId } } },
      NOT: { rosterEntries: { some: { teamId } } },
    },
    select: { id: true },
  });

  return player !== null;
}

export type AddReturningPlayerInput = {
  teamId: string;
  playerId: string;
  jerseyNumber: number | null;
};

export type AddReturningPlayerResult = {
  entry: RosterEntry;
  /// Guardians whose Membership this call created — the only ones the caller
  /// may email. See design-doc.md #5 Decision 1: this comes straight from
  /// planGuardianCascade's toCreate, never from the full guardian list.
  notify: GuardianLink[];
};

/**
 * The Decision 15 cascade, atomically: insert the roster spot, then create a
 * Membership for every linked guardian who doesn't already have one.
 *
 * Uses `membership.createMany({ skipDuplicates: true })` rather than an
 * `upsert` per guardian — deliberately. An upsert needs an `update` clause to
 * fill in, even an empty one, and that clause is exactly the code a future
 * "helpful" edit could start writing into. `createMany` has no update branch
 * to get wrong, which is what makes "never touch an existing Membership" a
 * property of the statement rather than a discipline to remember.
 * `skipDuplicates` also absorbs the (vanishingly rare, single-coach-app) race
 * where a guardian gains a membership between the read below and this write,
 * turning it into a no-op instead of a transaction-aborting P2002.
 */
export async function addReturningPlayer(
  input: AddReturningPlayerInput,
): Promise<AddReturningPlayerResult> {
  return db.$transaction(async (tx) => {
    const entry = await tx.rosterEntry.create({
      data: {
        teamId: input.teamId,
        playerId: input.playerId,
        jerseyNumber: input.jerseyNumber,
      },
      select: ROSTER_ENTRY_SELECT,
    });

    const guardianRows = await tx.guardianPlayer.findMany({
      where: { playerId: input.playerId },
      select: { user: { select: { id: true, email: true, name: true } } },
    });
    const guardians: GuardianLink[] = guardianRows.map(({ user }) => ({
      userId: user.id,
      email: user.email,
      name: user.name,
    }));

    const existingMemberships = await tx.membership.findMany({
      where: {
        teamId: input.teamId,
        userId: { in: guardians.map((guardian) => guardian.userId) },
      },
      select: { userId: true },
    });

    const { toCreate } = planGuardianCascade(
      guardians,
      existingMemberships.map((membership) => membership.userId),
    );

    if (toCreate.length > 0) {
      await tx.membership.createMany({
        data: toCreate.map((guardian) => ({
          userId: guardian.userId,
          teamId: input.teamId,
          role: "PARENT",
        })),
        skipDuplicates: true,
      });
    }

    return { entry, notify: toCreate };
  });
}
