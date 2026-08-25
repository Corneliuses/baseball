import { generateCalendarToken } from "./calendar-token";
import { db } from "./db";

/// Team-scoped data access. The single place scoped team queries and writes
/// live, per AGENTS.md — "Never call Prisma directly from a component."
///
/// Read helpers (getAllTeams, getMemberTeams, getTeamById) swallow database
/// errors and return an empty result, matching src/lib/db.ts's rationale: a
/// dead database should render an empty page, not hang a build or crash a
/// request.
///
/// The four mutations do NOT swallow errors — a write that silently fails
/// and still looks like it succeeded is worse than one that throws. Callers
/// (server actions) are expected to have already run requireTeamAccess
/// before calling any of these.

export interface Team {
  id: string;
  name: string;
  season: string | null;
  allPlay: boolean;
  groupMeUrl: string | null;
  archivedAt: Date | null;
  createdAt: Date;
}

const TEAM_SELECT = {
  id: true,
  name: true,
  season: true,
  allPlay: true,
  groupMeUrl: true,
  archivedAt: true,
  createdAt: true,
} as const;

/// Every team, any archived state. Owner-only in practice — the caller
/// (src/app/page.tsx) decides whether to call this or getMemberTeams.
export async function getAllTeams(): Promise<Team[]> {
  try {
    return await db.team.findMany({
      select: TEAM_SELECT,
      orderBy: { createdAt: "desc" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch all teams:", message);
    return [];
  }
}

/// Every team the user holds a Membership on, any archived state — archived
/// teams must still appear so they can render in the switcher's archived
/// section.
export async function getMemberTeams(userId: string): Promise<Team[]> {
  try {
    return await db.team.findMany({
      where: { memberships: { some: { userId } } },
      select: TEAM_SELECT,
      orderBy: { createdAt: "desc" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch member teams:", message);
    return [];
  }
}

export async function getTeamById(teamId: string): Promise<Team | null> {
  return await db.team.findUnique({
    where: { id: teamId },
    select: TEAM_SELECT,
  });
}

export type CreateTeamInput = {
  name: string;
  season: string | null;
  allPlay: boolean;
};

/**
 * Create a team and grant its creator OWNER on it, in one statement.
 *
 * Deliberately NOT a `$transaction` array: that form builds every operation
 * before any of them execute, so a Membership row in the same array cannot
 * reference the team's id — it doesn't exist yet. A nested write lets Prisma
 * issue both inserts atomically, keyed off the created team's real id.
 */
export async function createTeam(
  input: CreateTeamInput,
  ownerId: string,
): Promise<Team> {
  return db.team.create({
    data: {
      name: input.name,
      season: input.season,
      allPlay: input.allPlay,
      calendarToken: generateCalendarToken(),
      memberships: {
        create: { userId: ownerId, role: "OWNER" },
      },
    },
    select: TEAM_SELECT,
  });
}

export type UpdateTeamInput = {
  name: string;
  season: string | null;
  allPlay: boolean;
  groupMeUrl: string | null;
};

export async function updateTeam(
  teamId: string,
  input: UpdateTeamInput,
): Promise<Team> {
  return db.team.update({
    where: { id: teamId },
    data: {
      name: input.name,
      season: input.season,
      allPlay: input.allPlay,
      groupMeUrl: input.groupMeUrl,
    },
    select: TEAM_SELECT,
  });
}

export async function archiveTeam(
  teamId: string,
  now: Date = new Date(),
): Promise<Team> {
  return db.team.update({
    where: { id: teamId },
    data: { archivedAt: now },
    select: TEAM_SELECT,
  });
}

export async function unarchiveTeam(teamId: string): Promise<Team> {
  return db.team.update({
    where: { id: teamId },
    data: { archivedAt: null },
    select: TEAM_SELECT,
  });
}
