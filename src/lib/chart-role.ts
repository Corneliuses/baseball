import { OUTFIELD_ZONE_LABEL, POSITION_LABELS } from "@/lib/positions";
import type { ChartViewEntry } from "@/lib/chart-view";

/// Where a player sits in the chart, as one line of text.
///
/// Lifted out of the readiness page (#12) when team home (#48) needed the same
/// sentence for a parent's own kid. Two copies of this would drift the way the
/// two diamonds' name shortening did before `buildDiamondNames` — and drift
/// here means the coach's screen and the parent's screen disagree about where
/// a kid is playing.
///
/// Pure and DB-free so it tests without a database, per AGENTS.md.

export function ordinal(n: number): string {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  const ones = n % 10;
  if (ones === 1) return `${n}st`;
  if (ones === 2) return `${n}nd`;
  if (ones === 3) return `${n}rd`;
  return `${n}th`;
}

export type ChartRoleOptions = {
  /**
   * What to print when this team fields no spot for the player — "Substitute"
   * on team home (the app-wide word for the state; softer than "Bench" for
   * the family reading it), nothing at all on the readiness page.
   *
   * Opt-in rather than always on, because the two callers are answering
   * different questions. Readiness lists a player the coach already knows is
   * in or out of the chart and prints only what is set; team home is telling a
   * parent where their kid is playing, and there silence is the one answer
   * that fails — "Reese · #12" with nothing after it reads as a page that
   * failed to load, not as "on the bench".
   *
   * Applied only to a player who is in **neither** column, matching the filter
   * the view page's substitutes list already uses: a kid batting third with no
   * fielding spot is in the order, and "Bats 3rd · Substitute" would contradict
   * the page a parent reads next — and misdescribe a kid who is playing.
   *
   * Never reached on an allPlay team: everyone off the diamond is in the
   * outfield, which is what the next save writes.
   */
  benchLabel?: string;
};

/**
 * @param allPlay Whether a player with no position is in the general outfield
 * (allPlay) or on the bench.
 *
 * A stored position always prints as its label: every team fields all nine
 * spots, so "C" beside a name is a spot the readiness page checks and both
 * diamonds draw. What the flag decides is the *absence* of one — on an allPlay
 * team a kid with `position = null` plays the general outfield, which is
 * exactly what the next save will write, and on a selective team they are a
 * substitute (if they don't bat either).
 *
 * One caveat the label cannot express: a spot can hold more rows than it
 * seats (three at CF the moment allPlay is switched off), and this function
 * reads the column, not the seating cut. Callers that print a role for a kid
 * who might be past capacity go through `seatedEntryIds` first — team home
 * and the readiness list both do.
 */
export function chartRole(
  entry: Pick<ChartViewEntry, "battingOrder" | "position">,
  allPlay: boolean,
  { benchLabel }: ChartRoleOptions = {},
): string {
  const parts: string[] = [];
  if (entry.battingOrder !== null) parts.push(`Bats ${ordinal(entry.battingOrder)}`);

  if (entry.position !== null) {
    parts.push(POSITION_LABELS[entry.position]);
  } else if (allPlay) {
    parts.push(OUTFIELD_ZONE_LABEL);
  } else if (benchLabel !== undefined && entry.battingOrder === null) {
    parts.push(benchLabel);
  }

  return parts.join(" · ");
}

/**
 * The condition under which `chartRole` prints its `benchLabel`: the chart
 * seats this player nowhere — neither in the batting order nor at a position.
 * Never true on an allPlay team, where everyone off the diamond is in the
 * outfield.
 *
 * Exported so team home can *style* the bench state (quiet card stock) apart
 * from the celebration (the banana marquee) without string-matching the label
 * it just asked `chartRole` to print. Kept beside `chartRole` so the sentence
 * and the styling decision cannot drift: `chart-role.test.ts` pins that the
 * two agree on every shape of entry.
 */
export function isBenched(
  entry: Pick<ChartViewEntry, "battingOrder" | "position">,
  allPlay: boolean,
): boolean {
  if (entry.battingOrder !== null) return false;
  if (allPlay) return false;
  return entry.position === null;
}
