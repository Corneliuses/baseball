import type { ChartViewEntry } from "@/lib/chart-view";
import { buildRsvpStateMap, type RsvpState } from "@/lib/rsvp";
import { listEventRsvps } from "@/lib/rsvps";

/// Which roster spots belong to a player who has declined the next game (#55).
///
/// This exists so the chart editors can *say* who is out without being able to
/// *act* on it. The editors take the answer as a list of `entryId`s — a side
/// channel — rather than as a field on their entry rows, and that is the whole
/// design: `src/lib/chart.ts` holds every drag and save decision and consumes
/// those rows, so keeping RSVP state off them means the draft logic
/// structurally cannot filter, reorder, or auto-bench anyone by who replied.
/// Decoration reaches the leaf components and stops there.
///
/// Keyed on `entryId`, not `playerId`, because that is what the editors key
/// their chips on — a player is global, a roster spot is this team's (AGENTS.md
/// rule 1).

/**
 * The pure half. Deliberately blind to provenance (#54) and to `attending`
 * versus silence: only a stated decline is reported, matching readiness.ts —
 * a family that hasn't answered is most likely coming, and badging them would
 * be the noise that trains a coach to ignore the badges that matter.
 */
export function declinedEntryIds(
  entries: readonly Pick<ChartViewEntry, "entryId" | "playerId">[],
  rsvpStates: ReadonlyMap<string, RsvpState>,
): string[] {
  return entries
    .filter((entry) => rsvpStates.get(entry.playerId) === "declined")
    .map((entry) => entry.entryId);
}

/**
 * The thin data half: one game's RSVPs plus the pure function above.
 *
 * Takes the next game already resolved, rather than fetching it itself, so a
 * caller can run that lookup in parallel with whatever else the page needs
 * (`getChart`, in both editor pages) instead of paying for it as an extra
 * sequential round trip after theirs.
 *
 * Two cases skip the RSVP read outright, because the answer is provably empty
 * either way: nothing on the schedule (`game` is null — the same empty list an
 * editor rendered before this feature existed), and an empty roster, where
 * there is no entry a decline could attach to. Both pages already decline to
 * call at all when the editor won't mount, but that is the caller's gate and
 * this is the module's — a future caller that forgets should still not be able
 * to spend a query on a question with one possible answer.
 *
 * Deliberately not wrapped in try/catch, matching every other RSVP read in the
 * app: a swallowed outage would draw a board where nobody has declined, which
 * is indistinguishable from good news and worse than an error.
 */
export async function loadDeclinedEntryIds(
  teamId: string,
  entries: readonly Pick<ChartViewEntry, "entryId" | "playerId">[],
  game: { id: string } | null,
): Promise<string[]> {
  if (!game || entries.length === 0) {
    return [];
  }

  const rsvpRows = await listEventRsvps(teamId, game.id);
  const rsvpStates = buildRsvpStateMap(
    entries.map((entry) => entry.playerId),
    rsvpRows,
  );

  return declinedEntryIds(entries, rsvpStates);
}
