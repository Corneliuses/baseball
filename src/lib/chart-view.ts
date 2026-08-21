import { Position } from "@/generated/prisma/enums";
import { fieldedPositions } from "@/lib/positions";
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
  /// Every position that has an assigned player, keyed by position.
  byPosition: Map<Position, ChartViewPlayer>;
  /// Everyone the diamond doesn't seat, in the roster's jersey-then-name order.
  /// What this means depends on the team's `allPlay` setting, which is why it
  /// isn't named here: on an allPlay team it's the outfield (LF/CF/RF are one
  /// zone and hold everyone left over — see `droppablePositions` in chart.ts),
  /// and otherwise it's the bench. The page decides how to say it.
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
function byJerseyThenName(a: ChartViewPlayer, b: ChartViewPlayer): number {
  if (a.jerseyNumber === null && b.jerseyNumber === null) {
    return a.playerName.localeCompare(b.playerName);
  }
  if (a.jerseyNumber === null) return 1;
  if (b.jerseyNumber === null) return -1;
  return a.jerseyNumber - b.jerseyNumber;
}

/// The name each player wears on the diamond, keyed by `playerId`.
///
/// First names collide constantly on a youth roster — two Avas on one team is
/// ordinary — and a marker showing "Ava" twice is worse than useless to the
/// parent of one of them. Any first name held by more than one rostered player
/// gets a last initial, on **every** player holding it, so the two markers
/// differ rather than one being singled out.
///
/// Two players sharing a first name *and* a last initial keep the same label.
/// That is deliberate, not an oversight: a full surname overruns a marker
/// sitting 64px from its neighbour, which is the whole reason only first names
/// are drawn. Their full names are still in the batting order, the bench and
/// the `sr-only` mirror, and on the view page the guarded-player halo
/// distinguishes the one a given reader actually came to find.
function buildDiamondNames(
  entries: readonly ChartViewEntry[],
): Map<string, string> {
  // Tokenized once and reused: `split` on every player twice — once to count,
  // once to label — is the kind of thing that reads as free and isn't.
  const parts = entries.map((entry) => {
    const tokens = entry.playerName.trim().split(/\s+/).filter(Boolean);
    return {
      playerId: entry.playerId,
      // Falls back to the whole string for a name that is all whitespace, so
      // this can never emit an empty marker label.
      first: tokens[0] ?? entry.playerName,
      last: tokens.length > 1 ? tokens[tokens.length - 1] : null,
    };
  });

  const counts = new Map<string, number>();
  for (const part of parts) {
    counts.set(part.first, (counts.get(part.first) ?? 0) + 1);
  }

  return new Map(
    parts.map((part) => {
      const shared = (counts.get(part.first) ?? 0) > 1;
      return [
        part.playerId,
        shared && part.last ? `${part.first} ${part.last[0]}.` : part.first,
      ];
    }),
  );
}

/**
 * @param allPlay Which spots this team actually fields. The read-side twin of
 * `buildPositionsDraft`'s parameter of the same name, and it does the same job:
 * a player stored at a position the team doesn't field — an allPlay team's
 * stale LF/CF/RF or CATCHER row, hand-set during #9 or left behind when allPlay
 * was switched on — is pooled rather than seated.
 *
 * That is what keeps the two diamonds telling one story. The editor already
 * shows those players in its outfield zone, and the view page draws its zone at
 * the very coordinates a named outfield marker would occupy, so seating them
 * here would stack two markers on one spot and make both names unreadable.
 * Nobody vanishes either way — they are in the outfield, which is where the
 * coach's next save will put them.
 */
export function buildChartView(
  entries: readonly ChartViewEntry[],
  rsvpStates: ReadonlyMap<string, RsvpState>,
  allPlay: boolean,
): ChartView {
  const diamondNames = buildDiamondNames(entries);
  const players = entries.map((entry) => ({
    ...entry,
    rsvpState: rsvpStates.get(entry.playerId) ?? "no-response",
    // Computed across every entry, not just the seated ones: a bench player
    // named Ava makes the shortstop named Ava ambiguous just the same.
    diamondName: diamondNames.get(entry.playerId) ?? entry.playerName,
  }));

  const lineup = players
    .filter((player) => player.battingOrder !== null)
    .sort((a, b) => a.battingOrder! - b.battingOrder!);

  const fielded = fieldedPositions(allPlay);
  const byPosition = new Map<Position, ChartViewPlayer>();
  const unseated: ChartViewPlayer[] = [];
  for (const player of players) {
    // First writer wins, matching buildPositionsDraft. The unique index makes a
    // collision unreachable from a real read, but the loser is pooled rather
    // than dropped if it ever happens.
    if (
      player.position !== null &&
      fielded.has(player.position) &&
      !byPosition.has(player.position)
    ) {
      byPosition.set(player.position, player);
    } else {
      unseated.push(player);
    }
  }

  // Sorted, not left in the order `getChart` handed over: that is a findMany
  // with no orderBy, so Postgres is free to return the rows differently between
  // two requests and the outfield cluster would visibly reshuffle. Jersey then
  // name is `sortRoster`'s order (roster-rules.ts), which is what the coach
  // arranged in the editor's zone.
  const unassigned = unseated.sort(byJerseyThenName);

  const hasChart = players.some(
    (player) => player.battingOrder !== null || player.position !== null,
  );

  return { lineup, byPosition, unassigned, hasChart };
}
