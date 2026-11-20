/**
 * The rules shared by every "coach picks a few from a code-defined library"
 * feature — basketball's playbook (`plays.ts`) and its at-home skills
 * (`skills.ts`). A team stores only the ids it chose, so all three questions
 * are about ids against a library: which stored ids still mean something,
 * whether a submitted set may be saved, and whether two stored lists match.
 *
 * Pure and DB-free, and free of the Prisma runtime so the client-side pickers
 * can import it.
 */

export type LibraryItem = { id: string };

/// The stored ids resolved against the library: unknown ids and repeats are
/// dropped (a library item that was retired drops out on read rather than
/// stranding a row), the stored order is kept, and never more than `max`.
export function resolveSelection<T extends LibraryItem>(
  library: readonly T[],
  ids: readonly string[],
  max: number,
): T[] {
  const byId = new Map(library.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const items: T[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (item && !seen.has(id)) {
      seen.add(id);
      items.push(item);
    }
  }
  return items.slice(0, max);
}

export type SelectionValidation =
  | { ok: true; ids: string[] }
  | { ok: false; reason: "unknown" | "duplicate" | "too-many" };

/// A save's boundary: no more than `max` ids, none repeated, every one in the
/// library. The ids come back in **library** order, whatever order they were
/// sent in, so the team's page reads the same way the picker lists it.
///
/// Lookups go through a `Map`, never a plain object, so `constructor` and
/// friends are not mistaken for library items.
export function validateSelection(
  library: readonly LibraryItem[],
  ids: readonly string[],
  max: number,
): SelectionValidation {
  if (ids.length > max) {
    return { ok: false, reason: "too-many" };
  }
  if (new Set(ids).size !== ids.length) {
    return { ok: false, reason: "duplicate" };
  }
  const known = new Set(library.map((item) => item.id));
  if (ids.some((id) => !known.has(id))) {
    return { ok: false, reason: "unknown" };
  }
  const chosen = new Set(ids);
  return {
    ok: true,
    ids: library.filter((item) => chosen.has(item.id)).map((item) => item.id),
  };
}

/// Whether two stored lists hold the same ids in the same order — the
/// lost-update check, exactly as the chart editors compare a baseline.
export function sameSelection(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
