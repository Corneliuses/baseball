import { db } from "./db";

/// Team-scoped roster reads and writes, per AGENTS.md — "Never call Prisma
/// directly from a component."
///
/// Read helpers swallow database errors and return an empty result, matching
/// teams.ts's rationale: a dead database should render an empty page, not
/// hang a build or crash a request. The mutations do NOT swallow errors —
/// callers (server actions) run requireTeamAccess before calling any of
/// these, and a write that silently fails and still looks like it succeeded
/// is worse than one that throws.
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
  isMember: boolean;
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

export async function getRosterEntry(
  teamId: string,
  entryId: string,
): Promise<RosterEntryDetail | null> {
  try {
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
      })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch roster entry:", message);
    return null;
  }
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
