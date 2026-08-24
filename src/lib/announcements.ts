import type { GuardianRosterEntry, TeamGuardian } from "./guardians";

/// Who hears about a newly created event, and whether it is worth announcing
/// at all (#45). Pure and DB-free per AGENTS.md — the loading half is
/// `guardians.ts` and the sending half is the schedule action.
///
/// Both decisions here are small enough to inline at the call site, and both
/// are here precisely because they should not be. "One email per household"
/// and "don't mail about a game that already happened" are product rules with
/// edge cases (a family guarding two kids; an event created at exactly `now`),
/// and an inline `Map` in an action is where a rule goes to rot untested.

/// One person to mail, resolved from however many kids they guard.
export type AnnouncementRecipient = TeamGuardian;

/**
 * The distinct households to announce an event to, in roster order.
 *
 * **Deduplicated on `userId`, which is the whole point.** A parent guarding two
 * kids on the roster appears in two `GuardianRosterEntry` rows, and mailing
 * them twice about one game is not a cosmetic bug — it is how a family learns
 * that this app's email is noise. `buildReminderBatch` collapses the same way
 * for the same reason; it goes further and lists the kids, which a reminder
 * needs (each kid has an RSVP state to report) and an announcement does not
 * (nobody has answered yet — the event was created a moment ago).
 *
 * Insertion-ordered, so the output follows the roster's `jerseyNumber` order
 * and two runs over the same roster mail in the same sequence. That matters
 * for a paced loop: a batch that dies halfway has reached a predictable
 * prefix rather than an arbitrary one.
 *
 * A guardian with an empty email is skipped. `User.email` is non-null in the
 * schema, but nothing between here and Postgres proves it is non-*empty*, and
 * an empty address is a send to nowhere that Resend counts as a failure.
 */
export function buildAnnouncementRecipients(
  roster: readonly GuardianRosterEntry[],
): AnnouncementRecipient[] {
  const byUserId = new Map<string, AnnouncementRecipient>();

  for (const entry of roster) {
    for (const guardian of entry.guardians) {
      if (!guardian.email || byUserId.has(guardian.userId)) {
        continue;
      }
      byUserId.set(guardian.userId, {
        userId: guardian.userId,
        email: guardian.email,
        name: guardian.name,
      });
    }
  }

  return [...byUserId.values()];
}

/**
 * Whether a freshly created event is worth telling anyone about.
 *
 * Strictly in the future. A coach back-filling last Saturday's game — to fix
 * the schedule, or to have somewhere to record who actually turned up — should
 * not mail twenty-five families about a game they already played.
 *
 * Deliberately `>` and not `>=`: an event created for exactly this instant is
 * already under way, and the same argument applies. The boundary is tested
 * because it is the kind of thing a later refactor flips without noticing.
 *
 * **Not `GAME_GRACE_MS`.** That window keeps an in-progress game current for a
 * *display* — `/view` and team home are right to still name the game being
 * played. This is a send, and the reminder loader draws the same line for the
 * same reason.
 *
 * The skip is silent by design (design-doc.md Decision 4): the coach sees the
 * ordinary "Event added." with nothing explaining the absent email. The cost is
 * a coach who typos the *year* getting no announcement and no clue why. It was
 * weighed against adding a fourth outcome to the form and judged the better
 * trade — but it is a real cost, and a distinct notice is the fix if it ever
 * surfaces in use.
 */
export function shouldAnnounceEvent(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() > now.getTime();
}
