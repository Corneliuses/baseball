import { fieldedPositions, OUTFIELD_ZONE_LABEL, POSITION_LABELS } from "@/lib/positions";
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
   * What to print when this team fields no spot for the player — "Bench" on
   * team home, nothing at all on the readiness page.
   *
   * Opt-in rather than always on, because the two callers are answering
   * different questions. Readiness lists a player the coach already knows is
   * in or out of the chart and prints only what is set; team home is telling a
   * parent where their kid is playing, and there silence is the one answer
   * that fails — "Reese · #12" with nothing after it reads as a page that
   * failed to load, not as "on the bench".
   *
   * Applied only to a player who is in **neither** column, matching the filter
   * the view page's bench list already uses: a kid batting third with no
   * fielding spot is in the order, and "Bats 3rd · Bench" would contradict the
   * page a parent reads next — and misdescribe a kid who is playing.
   *
   * Never reached on an allPlay team: everyone outside that infield is in the
   * outfield, which is what the next save writes.
   */
  benchLabel?: string;
};

/**
 * @param allPlay Which spots this team actually fields.
 *
 * The position label goes through the team's fielded set rather than straight
 * to `POSITION_LABELS`, for the same reason `computeReadiness` filters
 * uncovered spots through it: an allPlay team's stale `CENTER_FIELD` or
 * `CATCHER` row is not a spot that team fields. Printing "CF" beside the name
 * would assert a position the readiness page simultaneously refuses to check —
 * and contradict the view page and the editor, which both show that player in
 * the outfield. On an allPlay team everyone outside the infield is in the
 * outfield, `position = null` included, which is exactly what the next save
 * will write.
 */
export function chartRole(
  entry: Pick<ChartViewEntry, "battingOrder" | "position">,
  allPlay: boolean,
  { benchLabel }: ChartRoleOptions = {},
): string {
  const parts: string[] = [];
  if (entry.battingOrder !== null) parts.push(`Bats ${ordinal(entry.battingOrder)}`);

  const fielded = fieldedPositions(allPlay);
  if (entry.position !== null && fielded.has(entry.position)) {
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
 * seats this player nowhere — neither in the batting order nor at a spot the
 * team fields. Never true on an allPlay team, where everyone outside the
 * infield is in the outfield.
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
  const fielded = fieldedPositions(allPlay);
  return entry.position === null || !fielded.has(entry.position);
}
