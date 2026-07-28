import { db } from "./db";

export async function getPublicTeams() {
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
    console.error("Failed to fetch public teams:", error);
    return [];
  }
}

export async function getUserTeams(userId: string) {
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
    console.error("Failed to fetch user teams:", error);
    return [];
  }
}
