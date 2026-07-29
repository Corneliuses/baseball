/// One normalization for every address this app writes to `User.email` or
/// `Invitation.email`. `User.email` is `@unique` and Prisma's `upsert` matches
/// it exactly — without this, "Sam@Example.com" and "sam@example.com" become
/// two different parents.

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
