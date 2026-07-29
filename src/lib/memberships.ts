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
 *
 * A team can hold more than one OWNER (this function is how a second one
 * gets promoted), so "two people demoting two different owners at once" is a
 * real race, not a hypothetical: under Postgres's default READ COMMITTED
 * isolation, two concurrent calls could each read "another owner exists" and
 * both proceed, leaving zero. `Serializable` isolation makes Postgres itself
 * detect that conflict and abort one side (a `P2034` write-conflict error)
 * rather than let both succeed — the guarantee that matters here is "never
 * silently strands the team," not a graceful retry, since two admins
 * racing to change roles on the same team in the same instant is vanishingly
 * rare for this single-coach app.
 */
export async function setMemberRole(
  teamId: string,
  userId: string,
  role: Role,
): Promise<void> {
  await db.$transaction(
    async (tx) => {
      const current = await tx.membership.findUnique({
        where: { userId_teamId: { userId, teamId } },
        select: { role: true },
      });

      if (!current) {
        throw new Error("No membership found for this user on this team");
      }

      if (current.role === "OWNER" && role !== "OWNER") {
        const otherOwners = await tx.membership.count({
          where: { teamId, role: "OWNER", userId: { not: userId } },
        });

        if (otherOwners === 0) {
          throw new LastOwnerError();
        }
      }

      await tx.membership.update({
        where: { userId_teamId: { userId, teamId } },
        data: { role },
      });
    },
    { isolationLevel: "Serializable" },
  );
}
