import { Role } from "@/generated/prisma/enums";

/// Pure ordering for the member directory: OWNER first, then COACH, then
/// PARENT, each group alphabetical by display name. Mirrors the rank idea in
/// team-access.ts's ROLE_RANK, inverted for display (highest role first)
/// rather than access comparison.

const DIRECTORY_ROLE_ORDER: Record<Role, number> = {
  OWNER: 0,
  COACH: 1,
  PARENT: 2,
};

export type DirectoryEntrySummary = {
  role: Role;
  name: string | null;
  email: string;
};

/// A member with no name on file sorts by email — the same "name ?? email"
/// fallback the roster and members pages already render.
export function sortDirectory<T extends DirectoryEntrySummary>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    const roleDiff = DIRECTORY_ROLE_ORDER[a.role] - DIRECTORY_ROLE_ORDER[b.role];
    if (roleDiff !== 0) {
      return roleDiff;
    }

    return (a.name ?? a.email).localeCompare(b.name ?? b.email);
  });
}
