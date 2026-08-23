import type { Role } from "@/generated/prisma/enums";
import { messageTable, type MessageTable } from "@/lib/error-messages";

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
 *
 * Built with `messageTable` even though these are not error messages. That
 * function's job is a frozen, null-prototyped string lookup, which is exactly
 * what this is — and `roleLabel` below takes a plain `string`, so the same
 * `"constructor"` hazard the `?error=` tables are hardened against is
 * reachable here too. `error-message-tables.test.ts` enforces the reuse: it
 * fails any file that hand-rolls `Object.assign(Object.create(null), …)` now
 * that the shared helper exists.
 */
export const ROLE_LABELS: MessageTable = messageTable({
  OWNER: "Owner",
  COACH: "Coach",
  PARENT: "Parent",
});

/**
 * The label for a role, falling back to the raw value rather than to nothing.
 *
 * The fallback matters where the value crosses a boundary the type system does
 * not follow — a role read back from a form, say. Printing an unexpected
 * constant is ugly; printing `undefined` is a bug report from a parent.
 *
 * Two layers, exactly as `messageFor` has: the null prototype stops an
 * inherited member being found at all, and the `typeof` check refuses to
 * return anything that is not a string even if one somehow were.
 */
export function roleLabel(role: Role | string): string {
  const label = ROLE_LABELS[role];
  return typeof label === "string" ? label : role;
}
