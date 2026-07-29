import { Role } from "@/generated/prisma/enums";
import { db } from "./db";

/// Team-scoped membership reads and role changes. Every write here touches
/// exactly one (userId, teamId) row — roles never inherit across teams, and
/// nothing in this module reads or writes a membership on a different team.

export type TeamMember = {
  userId: string;
  role: Role;
  name: string | null;
  email: string;
  phone: string | null;
};

export async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  try {
    const memberships = await db.membership.findMany({
      where: { teamId },
      select: {
        userId: true,
        role: true,
        user: {
          select: { name: true, email: true, phone: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return memberships.map((m) => ({
      userId: m.userId,
      role: m.role,
      name: m.user.name,
      email: m.user.email,
      phone: m.user.phone,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch team members:", message);
    return [];
  }
}

export class LastOwnerError extends Error {
  constructor() {
    super("Cannot change the role of the team's only owner");
    this.name = "LastOwnerError";
  }
}

/**
 * Change one member's role on one team.
 *
 * Refuses to demote the team's last OWNER — doing so would strand the team
 * with no one able to manage it. Any other change, including elevating a
 * parent to coach or coach to owner, proceeds unconditionally.
 */
export async function setMemberRole(
  teamId: string,
  userId: string,
  role: Role,
): Promise<void> {
  const current = await db.membership.findUnique({
    where: { userId_teamId: { userId, teamId } },
    select: { role: true },
  });

  if (!current) {
    throw new Error("No membership found for this user on this team");
  }

  if (current.role === "OWNER" && role !== "OWNER") {
    const ownerCount = await db.membership.count({
      where: { teamId, role: "OWNER" },
    });

    if (ownerCount <= 1) {
      throw new LastOwnerError();
    }
  }

  await db.membership.update({
    where: { userId_teamId: { userId, teamId } },
    data: { role },
  });
}
