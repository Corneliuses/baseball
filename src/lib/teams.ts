import { db } from "./db";

export interface Team {
  id: string;
  name: string;
  season: string | null;
  allPlay: boolean;
  createdAt: Date;
}

export async function getPublicTeams(): Promise<Team[]> {
  try {
    return await db.team.findMany({
      where: {
        archivedAt: null,
      },
      select: {
        id: true,
        name: true,
        season: true,
        allPlay: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch public teams:", message);
    return [];
  }
}

export async function getUserTeams(userId: string): Promise<Team[]> {
  try {
    return await db.team.findMany({
      where: {
        memberships: {
          some: {
            userId,
          },
        },
        archivedAt: null,
      },
      select: {
        id: true,
        name: true,
        season: true,
        allPlay: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch user teams:", message);
    return [];
  }
}
