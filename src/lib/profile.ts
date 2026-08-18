import { db } from "./db";

/// The signed-in person's own record.
///
/// `User.name` and `User.phone` are global columns — a person is one person
/// across every team they touch — so this module takes no teamId and is
/// deliberately not team-scoped. It reads and writes exactly one row: the one
/// whose id the caller already proved is theirs via `getCurrentUser`. There is
/// no "look up another user's profile" function here on purpose; the two
/// staff-facing views of someone else's contact details are `listDirectory`
/// and the roster entry page, both gated at COACH.

/// **Every page that renders `User.name` or `User.phone`.** `updateProfileAction`
/// revalidates this list, and it is the list to check against when adding a
/// page that shows a person's name or phone — a new consumer that is not
/// revalidated serves the old value until something else happens to bust the
/// cache, which is invisible in tests and looks like "the save didn't work".
///
/// | Page | Reads | Audience |
/// |---|---|---|
/// | `/` | name | the person themself ("Welcome back, …") |
/// | `/profile` | name, phone | the person themself |
/// | `/t/[teamId]` | name, phone | parents, via `listCoachContacts` — staff only |
/// | `/t/[teamId]/directory` | name, phone | COACH+, via `listDirectory` |
/// | `/t/[teamId]/roster/[entryId]` | name, phone | COACH+, via `getRosterEntry` |
/// | `/t/[teamId]/members` | name | OWNER, via `listTeamMembers` |
///
/// `email` is absent deliberately: it is not editable here, so no page goes
/// stale on it. `/t/[teamId]/roster/invite` reads guardian *emails* only and
/// so is not on this list.

export type Profile = {
  name: string | null;
  email: string;
  phone: string | null;
};

export type ProfileUpdate = {
  name: string | null;
  phone: string | null;
};

/**
 * Load one person's own profile.
 *
 * A database error propagates rather than being caught and reported as an
 * empty profile — the same posture as `requireTeamAccess`, and it matters
 * more here than on a list page. This page's whole job is to answer "what
 * number does the team have for me"; rendering a blank field on a failed
 * read would answer "none on file", which is a different and wrong answer.
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  return db.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, phone: true },
  });
}

/**
 * Update one person's own name and phone.
 *
 * `email` is deliberately absent: it is the magic-link identity Auth.js keys
 * sessions and invitations on, so changing it is an account migration rather
 * than a profile edit.
 *
 * Last write wins against a coach editing the same person's phone from a
 * roster entry page. That race is acceptable — both writers are entering the
 * number they believe is right, and the person themself is the better source.
 */
export async function updateProfile(
  userId: string,
  { name, phone }: ProfileUpdate,
): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { name, phone },
  });
}
