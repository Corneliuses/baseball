/// Pure roster rules: jersey number parsing, roster ordering, and translating
/// a Prisma unique-constraint violation into a field the UI can point at.
///
/// `rosterWriteFailure` duck-types the error rather than importing
/// `PrismaClientKnownRequestError`: `src/generated/prisma` is gitignored, so
/// its internal export path is not something calling code should import, and
/// duck-typing keeps this module DB-free and exhaustively testable.

export type RosterEntrySummary = {
  jerseyNumber: number | null;
  player: { name: string };
};

const MIN_JERSEY_NUMBER = 0;
const MAX_JERSEY_NUMBER = 99;

/**
 * Parse a jersey number from form input. A blank field means "no number yet"
 * — `RosterEntry.jerseyNumber` is nullable and Postgres allows any number of
 * NULLs under `@@unique([teamId, jerseyNumber])`. Anything that isn't a
 * whole number 0–99 is rejected.
 */
export function parseJerseyNumber(raw: unknown): number | null {
  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }

  if (!/^\d+$/.test(trimmed)) {
    throw new RangeError("Jersey number must be a whole number");
  }

  const value = Number(trimmed);
  if (value < MIN_JERSEY_NUMBER || value > MAX_JERSEY_NUMBER) {
    throw new RangeError(
      `Jersey number must be between ${MIN_JERSEY_NUMBER} and ${MAX_JERSEY_NUMBER}`,
    );
  }

  return value;
}

/// Numbered players first (ascending), then unnumbered players by name.
export function sortRoster<T extends RosterEntrySummary>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    if (a.jerseyNumber === null && b.jerseyNumber === null) {
      return a.player.name.localeCompare(b.player.name);
    }
    if (a.jerseyNumber === null) {
      return 1;
    }
    if (b.jerseyNumber === null) {
      return -1;
    }
    return a.jerseyNumber - b.jerseyNumber;
  });
}

export type RosterWriteFailure = "jersey-taken" | "already-rostered" | null;

type PrismaLikeError = {
  code?: unknown;
  meta?: { target?: unknown };
};

/**
 * Map a Prisma `P2002` unique-constraint violation on `RosterEntry` to the
 * field it collided on. Handles both `meta.target` shapes seen across Prisma
 * versions: an array of column names, and a single constraint-name string.
 *
 * NOT YET VERIFIED against a live Postgres write — see design-doc.md #4
 * Decision 3. Confirm the actual shape before relying on this in production
 * and adjust the matching below if it differs.
 */
export function rosterWriteFailure(error: unknown): RosterWriteFailure {
  if (!isPrismaLikeError(error) || error.code !== "P2002") {
    return null;
  }

  const target = error.meta?.target;
  const targetText = Array.isArray(target)
    ? target.join(",")
    : typeof target === "string"
      ? target
      : "";

  if (targetText.includes("jerseyNumber")) {
    return "jersey-taken";
  }

  if (targetText.includes("playerId") && targetText.includes("teamId")) {
    return "already-rostered";
  }

  return null;
}

function isPrismaLikeError(error: unknown): error is PrismaLikeError {
  return typeof error === "object" && error !== null && "code" in error;
}
