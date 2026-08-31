import { Position } from "@/generated/prisma/enums";
import { buildDiamondNames } from "@/lib/diamond-names";
import { fieldedPositions, positionCapacity } from "@/lib/positions";
import type { RsvpState } from "@/lib/rsvp";

/// The view page's read-only render model (#8).
///
/// RSVP state is decoration, never a filter: `buildChartView` attaches an
/// `RsvpState` to every entry but never uses it to reorder, renumber, or drop
/// anyone from the lineup or the diamond. Deliberately does NOT reuse
/// readiness.ts's `ChartEntry` — readiness filters by attendance, which is
/// exactly what this module must never do, and importing that type would
/// invite importing that behavior too.
///
/// Pure and DB-free so it tests without a database; `getChart` in roster.ts
/// is the thin data layer that feeds it.

export type ChartViewEntry = {
  /// The RosterEntry id — the roster spot, not the global person. The chart
  /// editor (#10) keys its writes on this; the view page ignores it.
  entryId: string;
  playerId: string;
  playerName: string;
  jerseyNumber: number | null;
  /// Null means the player is not in the batting order (bench).
  battingOrder: number | null;
  /// Null means the player has no fielding assignment (bench).
  position: Position | null;
};

export type ChartViewPlayer = ChartViewEntry & {
  rsvpState: RsvpState;
  /// The player's name *on the field* — what a diamond marker draws under the
  /// position abbreviation. The first name alone, or `First L.` when another
  /// rostered player shares that first name.
  ///
  /// Derived here rather than in the component because it is a fact about the
  /// whole roster, not about one player: whether "Ava" is ambiguous depends on
  /// who else is on the chart, and `buildChartView` is the only place that
  /// already holds every player at once.
  ///
  /// `playerName` is untouched and stays the full name. Lists, the bench and
  /// the diamond's `sr-only` mirror all use that one — the abbreviation exists
  /// only because markers sit as little as 60px apart on the field.
  diamondName: string;
};

export type ChartView = {
  /// Rostered players in the standing batting order, ascending.
  lineup: ChartViewPlayer[];
  /// Every position that has assigned players, keyed by position — a list
  /// because an allPlay team's LF/CF/RF each stack to three
  /// (`positionCapacity`); everywhere else the list is a single player. Each
  /// stack is in jersey-then-name order, since nothing persisted orders
  /// players within a spot (`positionSlot` is a uniqueness mechanism, not
  /// state) and an unsorted stack would reshuffle between requests.
  byPosition: Map<Position, ChartViewPlayer[]>;
  /// Everyone the diamond doesn't seat, in the roster's jersey-then-name order.
  /// What this means depends on the team's `allPlay` setting, which is why it
  /// isn't named here: on an allPlay team it's the general outfield (whoever
  /// the coach hasn't pinned to a named spot — see `droppablePositions` in
  /// chart.ts), and otherwise it's the bench. The page decides how to say it.
  unassigned: ChartViewPlayer[];
  /// True when at least one roster entry has a batting order or a position
  /// set — a partial chart (entered incrementally by hand during the
  /// validation weekend) still counts. Only a fully empty chart is "no chart
  /// set yet".
  hasChart: boolean;
};

/// `sortRoster`'s ordering, restated over this module's render model rather
/// than imported: that one keys off `player.name` on a Prisma-shaped row, and
/// reshaping a ChartViewPlayer to borrow it costs more than the four lines.
/// Unnumbered players sort last; jerseys are unique per team, so the name
/// comparison only ever settles two unnumbered players.
///
/// Exported, and typed on the two fields it actually reads, because team home
/// (#48) needs the same order for a parent's own kids: `getChart` is a
/// findMany with no orderBy, so anything rendering its rows unsorted reshuffles
/// between requests. A third hand-rolled copy of this comparison is how the two
/// diamonds' names drifted apart before `buildDiamondNames`.
export function byJerseyThenName(
  a: Pick<ChartViewEntry, "jerseyNumber" | "playerName">,
  b: Pick<ChartViewEntry, "jerseyNumber" | "playerName">,
): number {
  if (a.jerseyNumber === null && b.jerseyNumber === null) {
    return a.playerName.localeCompare(b.playerName);
  }
  if (a.jerseyNumber === null) return 1;
  if (b.jerseyNumber === null) return -1;
  return a.jerseyNumber - b.jerseyNumber;
}

/// The seating rule, in one place: who the diamond puts at which spot, and who
/// it leaves over. Shared by `buildChartView` and `seatedEntryIds` so a page
/// asking "is this kid seated?" cannot answer it differently from the page
/// that draws the board.
///
/// Order in, order out. Callers sort first (see `buildChartView`) — this
/// function must never be handed `getChart`'s raw order, because the capacity
/// cut below takes the first arrivals and would otherwise seat a different one
/// of three over-capacity centre fielders on every request.
function seat<T extends Pick<ChartViewEntry, "position">>(
  players: readonly T[],
  allPlay: boolean,
): { byPosition: Map<Position, T[]>; unseated: T[] } {
  const fielded = fieldedPositions(allPlay);
  const byPosition = new Map<Position, T[]>();
  const unseated: T[] = [];

  for (const player of players) {
    // First arrivals up to the spot's capacity, matching buildPositionsDraft;
    // anyone past it is pooled rather than dropped.
    const seated =
      player.position !== null ? byPosition.get(player.position) : undefined;
    if (
      player.position !== null &&
      fielded.has(player.position) &&
      (seated?.length ?? 0) < positionCapacity(player.position, allPlay)
    ) {
      if (seated) {
        seated.push(player);
      } else {
        byPosition.set(player.position, [player]);
      }
    } else {
      unseated.push(player);
    }
  }

  return { byPosition, unseated };
}

/**
 * Which roster spots the diamond actually seats — the entry ids `/view` draws
 * at a named position, as opposed to the ones it shows in the outfield zone or
 * on the bench.
 *
 * Exists because a stored `position` is no longer enough to answer "where does
 * this kid play". A spot has a capacity now, and a board can hold more rows
 * than it: three kids saved at CF the moment `allPlay` is switched off. The
 * pages that print a one-line chart role (team home's marquee, the readiness
 * list) would otherwise read that column straight and tell all three families
 * "CF" while `/view`, two taps away, seats one of them and lists the other two
 * as substitutes.
 *
 * Sorts internally, so a caller may hand it `getChart`'s rows as they came.
 */
export function seatedEntryIds(
  entries: readonly Pick<
    ChartViewEntry,
    "entryId" | "jerseyNumber" | "playerName" | "position"
  >[],
  allPlay: boolean,
): Set<string> {
  const { byPosition } = seat([...entries].sort(byJerseyThenName), allPlay);
  return new Set(
    [...byPosition.values()].flat().map((player) => player.entryId),
  );
}

/**
 * @param allPlay Which spots this team actually fields. The read-side twin of
 * `buildPositionsDraft`'s parameter of the same name, and it does the same job:
 * a player stored at a position the team doesn't field — an allPlay team's
 * stale CATCHER row, hand-set during #9 or left behind when allPlay was
 * switched on — is pooled rather than seated, as is anyone past a spot's
 * capacity (a named outfield stack after allPlay was switched off).
 *
 * That is what keeps the two diamonds telling one story: the editor already
 * shows those same players in its zone. Nobody vanishes either way — they are
 * in the outfield (or on the bench), which is where the coach's next save
 * will put them.
 */
export function buildChartView(
  entries: readonly ChartViewEntry[],
  rsvpStates: ReadonlyMap<string, RsvpState>,
  allPlay: boolean,
): ChartView {
  const diamondNames = buildDiamondNames(
    entries.map((entry) => ({ id: entry.playerId, playerName: entry.playerName })),
  );
  const players = entries
    .map((entry) => ({
      ...entry,
      rsvpState: rsvpStates.get(entry.playerId) ?? "no-response",
      // Computed across every entry, not just the seated ones: a bench player
      // named Ava makes the shortstop named Ava ambiguous just the same.
      diamondName: diamondNames.get(entry.playerId) ?? entry.playerName,
    }))
    // Sorted BEFORE anything is seated, not after. `getChart` is a findMany
    // with no orderBy, so with more rows at a spot than it can hold — three
    // kids left at CF after allPlay was switched off — taking "the first
    // arrivals" out of Postgres's order would seat a different one of them on
    // each request, with no data change behind it. Sorting first makes the
    // choice deterministic AND the same one the editor makes, since the
    // positions page hands `buildPositionsDraft` a `sortRoster`ed list.
    .sort(byJerseyThenName);

  const lineup = players
    .filter((player) => player.battingOrder !== null)
    .sort((a, b) => a.battingOrder! - b.battingOrder!);

  const { byPosition, unseated } = seat(players, allPlay);

  // Already in jersey-then-name order — `players` was sorted above, and both
  // loops below preserve it. That order is `sortRoster`'s (roster-rules.ts),
  // which is what the coach arranged in the editor's zone; leaving it as
  // `getChart` handed it over would let the outfield cluster visibly reshuffle
  // between two requests.
  const unassigned = unseated;

  return { lineup, byPosition, unassigned, hasChart: hasChartSet(entries) };
}

/**
 * Has anyone on this team been given a batting slot or a position yet?
 *
 * A partial chart — entered incrementally by hand — counts; only a fully empty
 * one is "no chart set yet". Named once because three callers ask it: this
 * module, the readiness page, and team home (#48). The last is why it matters
 * that they agree: with no chart at all, every position a page prints is one
 * nobody assigned, and two of those pages would be telling the same parent
 * different things about the same kid.
 */
export function hasChartSet(
  entries: readonly Pick<ChartViewEntry, "battingOrder" | "position">[],
): boolean {
  return entries.some(
    (entry) => entry.battingOrder !== null || entry.position !== null,
  );
}
