import { Role } from "@/generated/prisma/enums";

/// Authorization for a team-scoped route or server action.
///
/// Every scoped page loader and server action calls this FIRST, passing the
/// teamId from the URL (Decision 13 — team scope lives in the route, never in
/// a cookie). It answers two questions in one place: does the caller hold a
/// Membership on this team, and is the team still writable.

export class TeamAccessError extends Error {
  constructor(
    message: string,
    readonly reason: "no-membership" | "insufficient-role" | "archived",
  ) {
    super(message);
    this.name = "TeamAccessError";
  }
}

const ROLE_RANK: Record<Role, number> = {
  PARENT: 0,
  COACH: 1,
  OWNER: 2,
};

export type TeamAccessInput = {
  /// The caller's role on this team, or null if they hold no membership.
  role: Role | null;
  /// Non-null when the team is archived.
  archivedAt: Date | null;
  /// Whether the caller intends to write.
  intent: "read" | "write";
  /// Minimum role required for this operation.
  minRole?: Role;
};

/**
 * Pure access decision, separated from data loading so it can be tested
 * exhaustively without a database. `requireTeamAccess` wraps this with the
 * Membership lookup.
 *
 * Archived teams reject every write regardless of role — the owner included.
 */
export function checkTeamAccess({
  role,
  archivedAt,
  intent,
  minRole = "PARENT",
}: TeamAccessInput): Role {
  if (role === null) {
    throw new TeamAccessError("No membership on this team", "no-membership");
  }

  if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
    throw new TeamAccessError(
      `Requires ${minRole}, caller is ${role}`,
      "insufficient-role",
    );
  }

  if (intent === "write" && archivedAt !== null) {
    throw new TeamAccessError("Team is archived and is read-only", "archived");
  }

  return role;
}
