import { cache } from "react";
import { Role } from "@/generated/prisma/enums";
import { db } from "./db";
import { getCurrentUser } from "./session";

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

export type RequireTeamAccessInput = {
  intent: "read" | "write";
  minRole?: Role;
};

/**
 * Resolve who is calling and whether they may act on this team, in one
 * database round trip. Every scoped page loader and server action calls this
 * first — layouts do NOT re-run on client-side navigation, so a page that
 * skips this call is unprotected on the very transitions that matter most.
 * See AGENTS.md and design-doc.md #3 Decision 6.
 *
 * Wrapped in React `cache()` so the several calls a single request makes
 * (layout, page, and — on a submit — the server action) collapse to one
 * query rather than three.
 *
 * A database error is allowed to propagate rather than being caught and
 * turned into a TeamAccessError: "we couldn't tell" must fail closed, not be
 * silently reported as a denial that looks routine.
 */
export const requireTeamAccess = cache(async function requireTeamAccess(
  teamId: string,
  { intent, minRole }: RequireTeamAccessInput,
): Promise<{ role: Role; userId: string }> {
  const user = await getCurrentUser();
  if (!user) {
    throw new TeamAccessError("Not signed in", "no-membership");
  }

  const team = await db.team.findUnique({
    where: { id: teamId },
    select: {
      archivedAt: true,
      memberships: {
        where: { userId: user.id },
        select: { role: true },
      },
    },
  });

  if (!team) {
    throw new TeamAccessError("Team not found", "no-membership");
  }

  const role = checkTeamAccess({
    role: team.memberships[0]?.role ?? null,
    archivedAt: team.archivedAt,
    intent,
    minRole,
  });

  return { role, userId: user.id };
});
