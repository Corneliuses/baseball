import { TZDate } from "@date-fns/tz";
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { EventType } from "@/generated/prisma/enums";

/// Pure date and calendar logic for the schedule. No database, no DOM, no
/// React — everything here is testable without either, per AGENTS.md.
///
/// **Every event time in this app is anchored to one timezone.** `Event.startsAt`
/// holds a true UTC instant; the wall clock a coach types is interpreted in
/// `APP_TIMEZONE`, and every value read back is formatted in it. See
/// design-doc.md #6 Decision 1.
///
/// ## Why TZDate and not plain date-fns
///
/// Every `date-fns` core function resolves against the **system** timezone.
/// Vercel runs `TZ=UTC`, so `format(event.startsAt, "MMM d")` on a 7:30 PM
/// Central game prints 00:30 the *following day*, and `startOfMonth` files a
/// late-evening event on the 31st into the next month's grid. The bug is
/// invisible on a developer machine already set to Central and appears only in
/// production — and inverts under a Central-set `TZ` in tests.
///
/// `TZDate` (from `@date-fns/tz`, the official date-fns v4 companion) is a
/// `Date` subclass whose local getters resolve in an attached zone. date-fns
/// preserves the subclass through `startOfMonth` / `startOfWeek` /
/// `eachDayOfInterval`, so the grid is still hand-built with date-fns exactly
/// as Decision 12 intends — the zone just comes along for the ride.
///
/// One sharp edge: `TZDate#toISOString()` returns an **offset-bearing** string
/// (`2026-07-15T18:00:00.000-05:00`), not a `Z` string. Nothing here hands a
/// `TZDate` to Prisma for that reason — the conversion helpers return a plain
/// `Date` built from `getTime()`.
///
/// Months in this module's public API are **1-12**, matching the URL form and
/// how people say them. The single `- 1` conversion to JavaScript's 0-indexed
/// months happens at each `TZDate` construction and nowhere else.

const DEFAULT_TIMEZONE = "America/Chicago";

/**
 * Validate an IANA zone name, falling back to Central rather than throwing.
 *
 * A typo in an environment variable must not take the app down at a field —
 * `Intl.DateTimeFormat` throws a `RangeError` on an unknown zone, and that
 * would otherwise surface on every request that renders a date.
 *
 * Exported so the fallback is testable without mutating `process.env`.
 */
export function resolveTimeZone(raw: string | undefined): string {
  const candidate = raw?.trim();
  if (!candidate) {
    return DEFAULT_TIMEZONE;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    console.error(
      `Invalid APP_TIMEZONE ${JSON.stringify(candidate)} — falling back to ${DEFAULT_TIMEZONE}`,
    );
    return DEFAULT_TIMEZONE;
  }
}

export const APP_TIMEZONE = resolveTimeZone(process.env.APP_TIMEZONE);

/**
 * How long after its start a game still counts as "next".
 *
 * A game that started forty minutes ago is still the game the coach is
 * standing at. Under a strict `startsAt > now` the view page (#8) and the
 * readiness panel (#12) would both flip to next week's game at first pitch —
 * the exact moment a coach is most likely to open the app. Three hours covers
 * a youth game without any realistic chance of shadowing a genuine next game.
 *
 * Exported so #8 and #12 read this number rather than each re-deriving it.
 */
export const GAME_GRACE_MS = 3 * 60 * 60 * 1000;

/// A calendar month, with `month` in 1-12.
export type CalendarMonth = {
  year: number;
  month: number;
};

/// Anchored at noon so no operation here ever lands on a DST midnight.
function monthAnchor({ year, month }: CalendarMonth): TZDate {
  return new TZDate(year, month - 1, 1, 12, 0, 0, APP_TIMEZONE);
}

/// The same instant, read through `APP_TIMEZONE`'s local getters.
function inZone(instant: Date): TZDate {
  return new TZDate(instant, APP_TIMEZONE);
}

// ---------------------------------------------------------------------------
// Wall clock <-> instant
// ---------------------------------------------------------------------------

/// `YYYY-MM-DDTHH:mm`, with the seconds some browsers append tolerated and
/// discarded — a schedule has no use for them.
const WALL_CLOCK_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/;

/**
 * Interpret a `datetime-local` form value as a wall clock in `APP_TIMEZONE`
 * and return the UTC instant it denotes.
 *
 * Throws a `RangeError` on anything that isn't a real calendar date and time,
 * matching how `parseJerseyNumber` rejects bad input in roster-rules.ts.
 *
 * The two DST edges resolve deterministically rather than throwing, and both
 * are pinned by tests:
 *   - A wall clock that does not exist (2:30 AM on 8 Mar 2026, when the clocks
 *     jump 2 AM -> 3 AM) resolves forward to 3:30 AM.
 *   - An ambiguous wall clock (1:30 AM on 1 Nov 2026, which happens twice)
 *     resolves to the first, still-CDT occurrence.
 * Neither matters for youth baseball, but leaving it to chance would.
 */
export function wallClockToInstant(value: string): Date {
  const match = WALL_CLOCK_PATTERN.exec(value.trim());
  if (!match) {
    throw new RangeError("Expected a date and time in YYYY-MM-DDTHH:mm form");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new RangeError("Not a real calendar date");
  }
  if (hour > 23 || minute > 59) {
    throw new RangeError("Not a real time of day");
  }

  const zoned = new TZDate(year, month - 1, day, hour, minute, 0, APP_TIMEZONE);

  // Catches dates that do not exist (30 February) — the constructor rolls them
  // forward, so the day components come back different. The hour is
  // deliberately NOT checked: a nonexistent DST wall clock legitimately shifts.
  if (
    zoned.getFullYear() !== year ||
    zoned.getMonth() !== month - 1 ||
    zoned.getDate() !== day
  ) {
    throw new RangeError("Not a real calendar date");
  }

  // A plain Date, never the TZDate — see the toISOString note in the module
  // docstring above.
  return new Date(zoned.getTime());
}

/// The inverse, for pre-filling a `datetime-local` input on the edit form.
export function instantToWallClock(instant: Date): string {
  return format(inZone(instant), "yyyy-MM-dd'T'HH:mm");
}

// ---------------------------------------------------------------------------
// Formatting — always in APP_TIMEZONE, never the system zone
// ---------------------------------------------------------------------------

export function formatEventDateTime(instant: Date): string {
  return format(inZone(instant), "EEE, MMM d, yyyy 'at' h:mm a");
}

export function formatEventTime(instant: Date): string {
  return format(inZone(instant), "h:mm a");
}

/// Day heading for the chronological list, e.g. "Saturday, August 1".
export function formatEventDayLabel(instant: Date): string {
  return format(inZone(instant), "EEEE, MMMM d");
}

export function formatMonthLabel(month: CalendarMonth): string {
  return format(monthAnchor(month), "MMMM yyyy");
}

// ---------------------------------------------------------------------------
// Month grid
// ---------------------------------------------------------------------------

/// The `YYYY-MM-DD` calendar day an instant falls on **in `APP_TIMEZONE`** —
/// the join key between grid cells and events.
export function dayKey(instant: Date): string {
  return format(inZone(instant), "yyyy-MM-dd");
}

export type MonthCell = {
  /// Joins to `bucketEventsByDay`'s map.
  dayKey: string;
  dayOfMonth: number;
  /// False for the leading and trailing padding days borrowed from the
  /// adjacent months.
  inMonth: boolean;
};

export type MonthWeek = {
  /// Stable React key — the `dayKey` of the week's first cell.
  weekKey: string;
  days: MonthCell[];
};

/**
 * The month laid out as Sunday-start weeks, padded with the adjacent months'
 * days so every row holds exactly seven cells.
 *
 * Row count is whatever the month needs — 4 for a February that starts on a
 * Sunday, 6 for a 31-day month starting on a Saturday, 5 for most — rather
 * than a fixed 6. Always padding to six adds a trailing empty week to most
 * months, which costs vertical space on a phone for a stability nobody
 * notices.
 *
 * Deliberately knows nothing about events — the page joins this to
 * `bucketEventsByDay` by `dayKey`. That split keeps the grid's tests free of
 * fixtures and the bucketing tests free of the grid.
 */
export function buildMonthGrid(month: CalendarMonth): MonthWeek[] {
  const anchor = monthAnchor(month);
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(anchor)),
    end: endOfWeek(endOfMonth(anchor)),
  });

  const weeks: MonthWeek[] = [];
  for (let index = 0; index < days.length; index += 7) {
    const week = days.slice(index, index + 7);
    weeks.push({
      weekKey: format(week[0], "yyyy-MM-dd"),
      days: week.map((day) => ({
        dayKey: format(day, "yyyy-MM-dd"),
        dayOfMonth: day.getDate(),
        inMonth: day.getMonth() === month.month - 1,
      })),
    });
  }

  return weeks;
}

/// Sunday-first, matching `buildMonthGrid`'s week start.
export const WEEKDAY_LABELS: readonly string[] = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

/// Group events by the calendar day they fall on in `APP_TIMEZONE`, preserving
/// the order they arrive in (the queries already sort by `startsAt`).
export function bucketEventsByDay<T extends { startsAt: Date }>(
  events: readonly T[],
): Map<string, T[]> {
  const buckets = new Map<string, T[]>();

  for (const event of events) {
    const key = dayKey(event.startsAt);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(event);
    } else {
      buckets.set(key, [event]);
    }
  }

  return buckets;
}

/**
 * The UTC instants bounding **everything `buildMonthGrid` renders** — which is
 * wider than the month itself, because the grid pads out to whole weeks.
 *
 * Deliberately the grid range and not the month range. A grid for August 2026
 * draws cells for 26-31 July; querying only August would render those dated
 * cells empty while July's own grid shows events on them. A cell that displays
 * a date must show that date's events.
 */
export function monthGridRange(month: CalendarMonth): { start: Date; end: Date } {
  const anchor = monthAnchor(month);
  return {
    start: new Date(startOfWeek(startOfMonth(anchor)).getTime()),
    end: new Date(endOfWeek(endOfMonth(anchor)).getTime()),
  };
}

/**
 * Midnight at the start of the day an instant falls on, in `APP_TIMEZONE`.
 *
 * This is the "today forward" boundary for the schedule's list view. Splitting
 * upcoming from past at `now` rather than at the start of today would drop a
 * game off the upcoming list the moment it starts — so a coach opening the app
 * at the field, mid-game, would be told there is nothing scheduled. Same
 * reasoning as GAME_GRACE_MS, applied to the list.
 */
export function startOfDayInZone(instant: Date): Date {
  return new Date(startOfDay(inZone(instant)).getTime());
}

// ---------------------------------------------------------------------------
// Month navigation and search params
// ---------------------------------------------------------------------------

export function currentMonth(now: Date): CalendarMonth {
  const zoned = inZone(now);
  return { year: zoned.getFullYear(), month: zoned.getMonth() + 1 };
}

/// December -> January rollover in both directions.
export function adjacentMonth(
  { year, month }: CalendarMonth,
  delta: number,
): CalendarMonth {
  const zeroBased = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(zeroBased / 12),
    month: (zeroBased % 12) + 1,
  };
}

/// The `?month=` value, `YYYY-MM`.
export function monthParam({ year, month }: CalendarMonth): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

const MONTH_PARAM_PATTERN = /^(\d{4})-(\d{2})$/;

/**
 * Read `?month=YYYY-MM`, falling back to the current month in `APP_TIMEZONE`.
 *
 * Search params are attacker-controlled, so this never throws — garbage
 * quietly becomes "this month" rather than a 500. Plain pattern matching
 * rather than Zod: this module stays dependency-light and the shape is one
 * regex.
 */
export function parseMonthParam(raw: unknown, now: Date): CalendarMonth {
  if (typeof raw === "string") {
    const match = MONTH_PARAM_PATTERN.exec(raw.trim());
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      if (year >= 1970 && year <= 9999 && month >= 1 && month <= 12) {
        return { year, month };
      }
    }
  }

  return currentMonth(now);
}

export type ScheduleView = "month" | "list";

/// Anything other than an explicit `list` renders the month grid.
export function parseViewParam(raw: unknown): ScheduleView {
  return raw === "list" ? "list" : "month";
}

// ---------------------------------------------------------------------------
// Next event / next game
// ---------------------------------------------------------------------------

/// Anything with a start instant. `selectNextEvent` needs nothing else, so a
/// practice and a game are the same shape to it — the games-only rule lives in
/// `selectNextGame` alone.
export type EventCandidate = {
  startsAt: Date;
};

export type GameCandidate = EventCandidate & {
  type: EventType;
};

/**
 * The soonest event that has not yet finished — **any type, games and
 * practices alike**.
 *
 * This is the informational question team home (#48) asks: a parent wants to
 * know where to be next, and the next thing on the calendar is as often a
 * practice as a game. Contrast `selectNextGame` below, which readiness (#12)
 * and the view page (#8) need because a practice has no chart to check.
 *
 * The grace window is `GAME_GRACE_MS` for both — a practice that started forty
 * minutes ago is the one the parent is driving to, for exactly the reason that
 * constant documents for games.
 *
 * `now` is a parameter rather than `new Date()` so this stays pure and its
 * tests do not depend on the clock.
 */
export function selectNextEvent<T extends EventCandidate>(
  events: readonly T[],
  now: Date,
): T | null {
  return selectNextEvents(events, now, 1)[0] ?? null;
}

/**
 * The soonest `limit` events that have not yet finished, soonest first.
 *
 * The general form of `selectNextEvent`, which is now the `limit: 1` case —
 * one definition of the grace window and of "soonest", so a page showing three
 * events and a page showing one can never disagree about which is next.
 *
 * Sorts rather than trusting the caller's order: the pure function has to hold
 * on its own, the same reason `nextGame` does not pass `take: 1` to Postgres.
 * A `limit` of zero or less returns nothing.
 */
export function selectNextEvents<T extends EventCandidate>(
  events: readonly T[],
  now: Date,
  limit: number,
): T[] {
  if (limit <= 0) {
    return [];
  }

  const cutoff = now.getTime() - GAME_GRACE_MS;

  return events
    .filter((event) => event.startsAt.getTime() > cutoff)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, limit);
}

/**
 * The soonest game that has not yet finished — **games only, never practices**.
 *
 * Practices have RSVPs but no chart, so the readiness check (#12) and the view
 * page (#8) both ignore them. Keeping that rule in this one function is the
 * point: it is not repeated at each call site.
 *
 * Delegates the "has it finished yet, and which is soonest" half to
 * `selectNextEvent` so the grace window is applied in one place — this
 * function's only job is the type filter, which is the only thing that
 * distinguishes it. A flag on one shared function was considered and rejected:
 * it would let a caller ask for the wrong rule by passing the wrong boolean,
 * where two named functions make the choice explicit at every call site.
 *
 * `now` is a parameter rather than `new Date()` so this stays pure and its
 * tests do not depend on the clock.
 */
export function selectNextGame<T extends GameCandidate>(
  events: readonly T[],
  now: Date,
): T | null {
  return selectNextEvent(
    events.filter((event) => event.type === "GAME"),
    now,
  );
}
