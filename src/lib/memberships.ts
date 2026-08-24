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

export type CoachContact = {
  userId: string;
  role: Role;
  name: string | null;
  email: string;
  phone: string | null;
};

/**
 * The coaching staff — OWNER and COACH rows only — with contact details.
 *
 * This is the one slice of the directory a parent may read. /directory is
 * coach-and-above because it holds every family's contact details, and the
 * recorded escape hatch is "a parent who needs to reach someone goes through
 * the coach" — which only works if the coach is reachable. The role filter
 * in the query (not in the caller) is the boundary: no PARENT row and no
 * player link can leave the database through this function.
 */
export async function listCoachContacts(teamId: string): Promise<CoachContact[]> {
  try {
    const memberships = await db.membership.findMany({
      where: { teamId, role: { in: ["OWNER", "COACH"] } },
      select: {
        userId: true,
        role: true,
        user: {
          select: { name: true, email: true, phone: true },
        },
      },
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
    console.error("Failed to fetch coach contacts:", message);
    return [];
  }
}

export type DirectoryEntry = {
  userId: string;
  role: Role;
  name: string | null;
  email: string;
  phone: string | null;
  players: { id: string; name: string }[];
};

/**
 * Every member of this team, with the kids they guard **on this team**.
 *
 * The nested `where: { player: { rosterEntries: { some: { teamId } } } }` is
 * the privacy boundary, not a cosmetic filter — `GuardianPlayer` is global by
 * design (Decision 15), so reading a member's unfiltered `guardianOf` would
 * show every parent on this team which children they also guard on an
 * unrelated team in this instance. See design-doc.md #5 Decision 5.
 */
export async function listDirectory(teamId: string): Promise<DirectoryEntry[]> {
  try {
    const memberships = await db.membership.findMany({
      where: { teamId },
      select: {
        userId: true,
        role: true,
        user: {
          select: {
            name: true,
            email: true,
            phone: true,
            guardianOf: {
              where: { player: { rosterEntries: { some: { teamId } } } },
              select: { player: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });

    return memberships.map((m) => ({
      userId: m.userId,
      role: m.role,
      name: m.user.name,
      email: m.user.email,
      phone: m.user.phone,
      players: m.user.guardianOf.map(({ player }) => player),
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch directory:", message);
    return [];
  }
}

export class LastOwnerError extends Error {
  constructor() {
    super("Cannot remove or demote the team's only owner");
    this.name = "LastOwnerError";
  }
}

/**
 * Remove one member from one team.
 *
 * Deletes exactly the (userId, teamId) Membership row — nothing else. The
 * person's User row, their GuardianPlayer links, and their kids' roster spots
 * all survive: guardianship is global by design (Decision 15), so severing it
 * here would blind the same parent on every other team, and re-inviting them
 * restores access with the family intact. One honest consequence: a removed
 * guardian whose kid is still rostered keeps receiving roster-driven email
 * (announcements, reminders recipients come from the roster, not Membership).
 * Fully detaching a family means also unlinking the guardian on the roster
 * entry page.
 *
 * The last-owner guard mirrors setMemberRole, and for the same racing reason
 * runs under Serializable isolation: two admins removing two different owners
 * at once must not leave the team with zero.
 *
 * Returns false when no membership exists — already removed in another tab —
 * so the caller can decline to claim a deletion that never happened.
 */
export async function removeMember(
  teamId: string,
  userId: string,
): Promise<boolean> {
  return db.$transaction(
    async (tx) => {
      const current = await tx.membership.findUnique({
        where: { userId_teamId: { userId, teamId } },
        select: { role: true },
      });

      if (!current) {
        return false;
      }

      if (current.role === "OWNER") {
        const otherOwners = await tx.membership.count({
          where: { teamId, role: "OWNER", userId: { not: userId } },
        });

        if (otherOwners === 0) {
          throw new LastOwnerError();
        }
      }

      await tx.membership.delete({
        where: { userId_teamId: { userId, teamId } },
      });
      return true;
    },
    { isolationLevel: "Serializable" },
  );
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
