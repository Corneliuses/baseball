import type { Role } from "@/generated/prisma/enums";

/**
 * How a membership role is written for a person to read.
 *
 * `Role` is a Prisma enum, so its values are SHOUTED database constants. The
 * members page printed them raw — a select whose options read "OWNER",
 * "COACH", "PARENT", and invitation rows saying "Invited as PARENT" (Dugout
 * Report C7). Meanwhile the directory page kept a private `ROLE_LABELS` map
 * with the friendly spellings, and team home hand-rolled a ternary for the two
 * cases it needed. Three answers to one question is how they drift.
 *
 * Global rather than team-scoped on purpose, matching the data model: roles
 * never inherit across teams, but the *word* for a role is the same everywhere.
 */
export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  COACH: "Coach",
  PARENT: "Parent",
};

/// The label for a role, falling back to the raw value rather than to nothing.
///
/// The fallback matters where the value crosses a boundary the type system
/// does not follow — a role read back from a form, say. Printing an unexpected
/// constant is ugly; printing `undefined` is a bug report.
export function roleLabel(role: Role | string): string {
  return ROLE_LABELS[role as Role] ?? role;
}
