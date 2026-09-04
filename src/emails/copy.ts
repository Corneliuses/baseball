/// Sentences more than one template says, written once. Pure, like the
/// builders beside it, so a wording change is one edit and one test.

/// The footer line for every email that goes out because a player is on a
/// team's roster. Four templates say this — the added-to-team notice, both
/// announcements and the day-of reminder — and they said it in two different
/// ways before this existed.
export function rosterFootnote(teamName: string): string {
  return `You're getting this because your player is on ${teamName}'s roster.`;
}

/// The inbox preview line for anything with a when and a where: the date (or
/// "Today at 5:45 PM"), then the place if there is one. The em dash and the
/// nothing-when-no-location rule are the same claim in three templates, so
/// they are one function.
export function whenWhere(when: string, location: string | null): string {
  return location ? `${when} — ${location}` : when;
}
