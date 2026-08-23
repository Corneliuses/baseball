import { describe, expect, it, vi } from "vitest";
import {
  adjacentMonth,
  APP_TIMEZONE,
  bucketEventsByDay,
  buildMonthGrid,
  currentMonth,
  dayKey,
  endOfDayInZone,
  formatEventDateTime,
  formatMonthLabel,
  GAME_GRACE_MS,
  instantToWallClock,
  monthGridRange,
  monthParam,
  parseMonthParam,
  parseViewParam,
  resolveTimeZone,
  selectNextEvent,
  selectNextEvents,
  selectNextGame,
  startOfDayInZone,
  wallClockToInstant,
  type GameCandidate,
} from "@/lib/calendar";

/// These tests must not depend on the machine's TZ. The container and Vercel
/// both run TZ=UTC; a contributor's laptop may not. Every assertion below goes
/// through APP_TIMEZONE explicitly, and `selectNextGame` takes `now` as an
/// argument rather than reading the clock.

const iso = (value: string) => new Date(value);

describe("APP_TIMEZONE", () => {
  it("defaults to US Central", () => {
    expect(APP_TIMEZONE).toBe("America/Chicago");
  });
});

describe("resolveTimeZone", () => {
  it("accepts a valid IANA zone", () => {
    expect(resolveTimeZone("America/New_York")).toBe("America/New_York");
  });

  it("falls back to Central when unset or blank", () => {
    expect(resolveTimeZone(undefined)).toBe("America/Chicago");
    expect(resolveTimeZone("   ")).toBe("America/Chicago");
  });

  it("falls back rather than throwing on a typo, so a bad env var cannot 500 the app", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(resolveTimeZone("America/Chicagoo")).toBe("America/Chicago");
    expect(error).toHaveBeenCalled();

    error.mockRestore();
  });
});

describe("wallClockToInstant", () => {
  it("reads a summer wall clock as CDT (UTC-5)", () => {
    expect(wallClockToInstant("2026-07-15T18:00").toISOString()).toBe(
      "2026-07-15T23:00:00.000Z",
    );
  });

  it("reads a winter wall clock as CST (UTC-6)", () => {
    expect(wallClockToInstant("2026-01-15T18:00").toISOString()).toBe(
      "2026-01-16T00:00:00.000Z",
    );
  });

  it("round-trips through instantToWallClock", () => {
    const wallClock = "2026-09-12T10:45";
    expect(instantToWallClock(wallClockToInstant(wallClock))).toBe(wallClock);
  });

  it("returns a plain Date, not a TZDate, so Prisma serializes it as UTC", () => {
    const instant = wallClockToInstant("2026-07-15T18:00");

    expect(instant.constructor).toBe(Date);
    // A TZDate would render this as "2026-07-15T18:00:00.000-05:00".
    expect(instant.toISOString().endsWith("Z")).toBe(true);
  });

  it("tolerates the seconds some browsers append and discards them", () => {
    expect(wallClockToInstant("2026-07-15T18:00:30").toISOString()).toBe(
      "2026-07-15T23:00:00.000Z",
    );
  });

  // DST edges: resolved deterministically rather than left to chance. Youth
  // games never start at 2 AM, but the behaviour is pinned so a library
  // upgrade that changes it fails here rather than in production.
  it("resolves a wall clock that does not exist (spring forward) by moving it forward", () => {
    // 2 AM -> 3 AM on 8 Mar 2026, so 02:30 CST never happens.
    expect(wallClockToInstant("2026-03-08T02:30").toISOString()).toBe(
      "2026-03-08T08:30:00.000Z",
    );
  });

  it("resolves an ambiguous wall clock (fall back) to the first occurrence", () => {
    // 01:30 happens twice on 1 Nov 2026; this is the CDT one (UTC-5).
    expect(wallClockToInstant("2026-11-01T01:30").toISOString()).toBe(
      "2026-11-01T06:30:00.000Z",
    );
  });

  it("rejects a malformed string", () => {
    expect(() => wallClockToInstant("")).toThrow(RangeError);
    expect(() => wallClockToInstant("tomorrow")).toThrow(RangeError);
    expect(() => wallClockToInstant("2026-07-15")).toThrow(RangeError);
  });

  it("rejects a date that does not exist", () => {
    expect(() => wallClockToInstant("2026-02-30T18:00")).toThrow(RangeError);
    expect(() => wallClockToInstant("2026-13-01T18:00")).toThrow(RangeError);
  });

  it("rejects an impossible time of day", () => {
    expect(() => wallClockToInstant("2026-07-15T25:00")).toThrow(RangeError);
    expect(() => wallClockToInstant("2026-07-15T18:70")).toThrow(RangeError);
  });
});

describe("dayKey", () => {
  it("buckets a late-evening Central event into that day, not the next UTC one", () => {
    // 8:30 PM Central on 30 July is 01:30Z on 31 July. Plain date-fns under
    // TZ=UTC — which is what Vercel runs — would file this on the 31st, and
    // therefore in the wrong month for an event on the last of a month.
    expect(dayKey(iso("2026-07-31T01:30:00Z"))).toBe("2026-07-30");
  });

  it("keeps an event on the last evening of a month inside that month", () => {
    // 7:30 PM Central on 31 August = 00:30Z on 1 September.
    expect(dayKey(iso("2026-09-01T00:30:00Z"))).toBe("2026-08-31");
  });

  it("handles a midday event with no ambiguity", () => {
    expect(dayKey(iso("2026-07-15T17:00:00Z"))).toBe("2026-07-15");
  });
});

describe("formatEventDateTime", () => {
  it("formats in Central, not the system zone", () => {
    expect(formatEventDateTime(iso("2026-07-31T01:30:00Z"))).toBe(
      "Thu, Jul 30, 2026 at 8:30 PM",
    );
  });
});

describe("buildMonthGrid", () => {
  const flatten = (weeks: ReturnType<typeof buildMonthGrid>) =>
    weeks.flatMap((week) => week.days);

  it("gives every row exactly seven days", () => {
    for (const month of [1, 2, 6, 9, 12]) {
      const weeks = buildMonthGrid({ year: 2026, month });
      for (const week of weeks) {
        expect(week.days).toHaveLength(7);
      }
    }
  });

  it("needs only four rows for a February that starts on a Sunday", () => {
    // 1 Feb 2026 is a Sunday and February has 28 days, so the month is exactly
    // four whole weeks and needs no padding at either end — the narrowest grid
    // the calendar can produce.
    const weeks = buildMonthGrid({ year: 2026, month: 2 });

    expect(weeks).toHaveLength(4);
    expect(weeks[0].days[0].dayKey).toBe("2026-02-01");
    expect(weeks[3].days[6].dayKey).toBe("2026-02-28");
    expect(weeks.flatMap((week) => week.days).every((day) => day.inMonth)).toBe(true);
  });

  it("needs five rows for a typical month", () => {
    // 1 Sep 2026 is a Tuesday; the grid runs 30 Aug - 3 Oct.
    expect(buildMonthGrid({ year: 2026, month: 9 })).toHaveLength(5);
  });

  it("needs six rows for a 31-day month starting on a Saturday", () => {
    // 1 Aug 2026 is a Saturday, so the grid runs 26 Jul - 5 Sep.
    const weeks = buildMonthGrid({ year: 2026, month: 8 });

    expect(weeks).toHaveLength(6);
    expect(weeks[0].days[0].dayKey).toBe("2026-07-26");
    expect(weeks[5].days[6].dayKey).toBe("2026-09-05");
  });

  it("marks padding days as out of month and counts the real ones", () => {
    const days = flatten(buildMonthGrid({ year: 2026, month: 8 }));

    expect(days.filter((day) => day.inMonth)).toHaveLength(31);
    expect(days[0].inMonth).toBe(false);
    expect(days.at(-1)?.inMonth).toBe(false);
  });

  it("handles a leap February", () => {
    const days = flatten(buildMonthGrid({ year: 2028, month: 2 }));

    expect(days.filter((day) => day.inMonth)).toHaveLength(29);
    expect(days.filter((day) => day.inMonth).at(-1)?.dayKey).toBe("2028-02-29");
  });

  it("starts every week on a Sunday", () => {
    const weeks = buildMonthGrid({ year: 2026, month: 11 });

    for (const week of weeks) {
      expect(new Date(`${week.days[0].dayKey}T12:00:00Z`).getUTCDay()).toBe(0);
    }
  });

  it("spans a DST transition without dropping or duplicating a day", () => {
    // Clocks change on 1 Nov 2026, inside this grid.
    const days = flatten(buildMonthGrid({ year: 2026, month: 11 }));
    const keys = days.map((day) => day.dayKey);

    expect(new Set(keys).size).toBe(keys.length);
    expect(days.filter((day) => day.inMonth)).toHaveLength(30);
  });
});

describe("bucketEventsByDay", () => {
  it("groups events falling on the same Central day", () => {
    const events = [
      { id: "a", startsAt: iso("2026-07-15T17:00:00Z") }, // 12:00 PM
      { id: "b", startsAt: iso("2026-07-15T23:00:00Z") }, // 6:00 PM
      { id: "c", startsAt: iso("2026-07-16T17:00:00Z") },
    ];

    const buckets = bucketEventsByDay(events);

    expect(buckets.get("2026-07-15")?.map((event) => event.id)).toEqual(["a", "b"]);
    expect(buckets.get("2026-07-16")?.map((event) => event.id)).toEqual(["c"]);
  });

  it("groups by the Central day, not the UTC one", () => {
    const events = [
      { id: "evening", startsAt: iso("2026-07-31T01:30:00Z") }, // 30 Jul, 8:30 PM
      { id: "morning", startsAt: iso("2026-07-30T15:00:00Z") }, // 30 Jul, 10:00 AM
    ];

    expect(bucketEventsByDay(events).get("2026-07-30")).toHaveLength(2);
  });

  it("returns an empty map for no events", () => {
    expect(bucketEventsByDay([]).size).toBe(0);
  });
});

describe("monthGridRange", () => {
  it("covers the padded grid, not just the month", () => {
    // The August 2026 grid runs 26 Jul - 5 Sep. Querying only August would
    // leave the 26-31 July cells empty even when July has events on them.
    const { start, end } = monthGridRange({ year: 2026, month: 8 });

    expect(start.toISOString()).toBe("2026-07-26T05:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-06T04:59:59.999Z");
  });

  it("bounds in Central, not UTC", () => {
    // Midnight Central is 05:00Z in summer — a UTC-anchored range would be
    // five hours out at both ends.
    const { start } = monthGridRange({ year: 2026, month: 8 });

    expect(start.toISOString().endsWith("T05:00:00.000Z")).toBe(true);
  });

  it("covers an event on the last evening of the month", () => {
    const { start, end } = monthGridRange({ year: 2026, month: 8 });
    const lastEvening = iso("2026-09-01T00:30:00Z"); // 31 Aug, 7:30 PM Central

    expect(lastEvening >= start && lastEvening <= end).toBe(true);
  });

  it("covers every cell the grid renders", () => {
    const month = { year: 2026, month: 8 };
    const { start, end } = monthGridRange(month);
    const cells = buildMonthGrid(month).flatMap((week) => week.days);

    // Midday on the first and last rendered day must fall inside the range.
    for (const cell of [cells[0], cells.at(-1)!]) {
      const midday = iso(`${cell.dayKey}T18:00:00Z`);
      expect(midday >= start && midday <= end).toBe(true);
    }
  });
});

describe("startOfDayInZone", () => {
  it("returns midnight Central, not midnight UTC", () => {
    // 3:00 PM Central on 15 July.
    expect(startOfDayInZone(iso("2026-07-15T20:00:00Z")).toISOString()).toBe(
      "2026-07-15T05:00:00.000Z",
    );
  });

  it("keeps a late-evening Central instant on its own day", () => {
    // 8:30 PM Central on 30 July, which is already 31 July in UTC.
    expect(startOfDayInZone(iso("2026-07-31T01:30:00Z")).toISOString()).toBe(
      "2026-07-30T05:00:00.000Z",
    );
  });

  it("uses the winter offset in winter", () => {
    expect(startOfDayInZone(iso("2026-01-15T20:00:00Z")).toISOString()).toBe(
      "2026-01-15T06:00:00.000Z",
    );
  });
});

describe("endOfDayInZone", () => {
  it("ends the day at midnight Central, not midnight UTC", () => {
    // 7:00 AM Central on 15 July — when the reminder cron runs.
    expect(endOfDayInZone(iso("2026-07-15T12:00:00Z")).toISOString()).toBe(
      "2026-07-16T04:59:59.999Z",
    );
  });

  it("still covers a Central evening game that is already tomorrow in UTC", () => {
    // The bug this exists to prevent: a 7:30 PM Central game on 15 July is
    // 00:30Z on the 16th, so a UTC-day window run that morning would miss it.
    const morningRun = iso("2026-07-15T12:00:00Z");
    const eveningGame = iso("2026-07-16T00:30:00Z");

    expect(eveningGame.getTime()).toBeLessThanOrEqual(
      endOfDayInZone(morningRun).getTime(),
    );
    expect(eveningGame.getTime()).toBeGreaterThan(
      startOfDayInZone(morningRun).getTime(),
    );
  });

  it("excludes the next day's morning practice", () => {
    // 9:00 AM Central on 16 July is outside the 15th's window.
    expect(iso("2026-07-16T14:00:00Z").getTime()).toBeGreaterThan(
      endOfDayInZone(iso("2026-07-15T12:00:00Z")).getTime(),
    );
  });

  it("uses the winter offset in winter", () => {
    expect(endOfDayInZone(iso("2026-01-15T20:00:00Z")).toISOString()).toBe(
      "2026-01-16T05:59:59.999Z",
    );
  });

  it("spans a 23-hour spring-forward day correctly", () => {
    // 8 March 2026: clocks jump 2 AM -> 3 AM Central, so the day is 23 hours.
    const springForward = iso("2026-03-08T18:00:00Z");
    const spanMs =
      endOfDayInZone(springForward).getTime() -
      startOfDayInZone(springForward).getTime();

    expect(spanMs).toBe(23 * 60 * 60 * 1000 - 1);
  });
});

describe("month navigation", () => {
  it("reports the current month in Central, not UTC", () => {
    // 00:30Z on 1 August is still 31 July in Central — so July, not August.
    expect(currentMonth(iso("2026-08-01T00:30:00Z"))).toEqual({
      year: 2026,
      month: 7,
    });
  });

  it("rolls over the year in both directions", () => {
    expect(adjacentMonth({ year: 2026, month: 12 }, 1)).toEqual({
      year: 2027,
      month: 1,
    });
    expect(adjacentMonth({ year: 2026, month: 1 }, -1)).toEqual({
      year: 2025,
      month: 12,
    });
  });

  it("steps within a year", () => {
    expect(adjacentMonth({ year: 2026, month: 7 }, 1)).toEqual({
      year: 2026,
      month: 8,
    });
  });

  it("formats a month param and a human label", () => {
    expect(monthParam({ year: 2026, month: 8 })).toBe("2026-08");
    expect(formatMonthLabel({ year: 2026, month: 8 })).toBe("August 2026");
  });
});

describe("parseMonthParam", () => {
  const now = iso("2026-07-15T17:00:00Z");

  it("reads a well-formed param", () => {
    expect(parseMonthParam("2026-09", now)).toEqual({ year: 2026, month: 9 });
  });

  it("falls back to the current month rather than throwing on tampering", () => {
    for (const raw of [undefined, null, "", "garbage", "2026-13", "2026-00", "26-9", 7]) {
      expect(parseMonthParam(raw, now)).toEqual({ year: 2026, month: 7 });
    }
  });
});

describe("parseViewParam", () => {
  it("selects the list view only on an explicit value", () => {
    expect(parseViewParam("list")).toBe("list");
  });

  it("defaults to the month grid for anything else", () => {
    for (const raw of [undefined, null, "", "month", "grid", 1]) {
      expect(parseViewParam(raw)).toBe("month");
    }
  });
});

describe("selectNextGame", () => {
  const now = iso("2026-08-01T18:00:00Z");
  const at = (offsetHours: number, type: GameCandidate["type"] = "GAME") => ({
    id: `${type}-${offsetHours}`,
    type,
    startsAt: new Date(now.getTime() + offsetHours * 60 * 60 * 1000),
  });

  it("returns the soonest upcoming game", () => {
    expect(selectNextGame([at(72), at(24), at(48)], now)?.id).toBe("GAME-24");
  });

  it("never returns a practice, even one sooner than the next game", () => {
    const result = selectNextGame([at(1, "PRACTICE"), at(24)], now);

    expect(result?.type).toBe("GAME");
    expect(result?.id).toBe("GAME-24");
  });

  it("ignores practices entirely when there is no upcoming game", () => {
    expect(selectNextGame([at(1, "PRACTICE"), at(48, "PRACTICE")], now)).toBeNull();
  });

  it("still returns a game that started forty minutes ago", () => {
    // The whole point of the grace window: the coach is standing at this game.
    const inProgress = {
      id: "in-progress",
      type: "GAME" as const,
      startsAt: new Date(now.getTime() - 40 * 60 * 1000),
    };

    expect(selectNextGame([inProgress, at(168)], now)?.id).toBe("in-progress");
  });

  it("keeps a game through the whole grace window", () => {
    const justInside = {
      id: "edge",
      type: "GAME" as const,
      startsAt: new Date(now.getTime() - GAME_GRACE_MS + 1000),
    };

    expect(selectNextGame([justInside], now)?.id).toBe("edge");
  });

  it("drops a game once the grace window has passed", () => {
    const justOutside = {
      id: "edge",
      type: "GAME" as const,
      startsAt: new Date(now.getTime() - GAME_GRACE_MS),
    };

    expect(selectNextGame([justOutside], now)).toBeNull();
  });

  it("prefers a game in progress over one later the same week", () => {
    expect(selectNextGame([at(120), at(-1)], now)?.id).toBe("GAME--1");
  });

  it("returns null for no upcoming games and for an empty list", () => {
    expect(selectNextGame([at(-48)], now)).toBeNull();
    expect(selectNextGame([], now)).toBeNull();
  });
});

describe("selectNextEvent", () => {
  const now = iso("2026-08-01T18:00:00Z");
  const at = (offsetHours: number, type: GameCandidate["type"] = "GAME") => ({
    id: `${type}-${offsetHours}`,
    type,
    startsAt: new Date(now.getTime() + offsetHours * 60 * 60 * 1000),
  });

  it("returns the soonest upcoming event", () => {
    expect(selectNextEvent([at(72), at(24), at(48)], now)?.id).toBe("GAME-24");
  });

  // The whole reason this function exists next to selectNextGame: team home is
  // informational, so the practice on Tuesday is what a parent needs to see
  // even though Saturday's game is the one readiness cares about.
  it("returns a practice that is sooner than the next game", () => {
    const result = selectNextEvent([at(1, "PRACTICE"), at(24)], now);

    expect(result?.type).toBe("PRACTICE");
    expect(result?.id).toBe("PRACTICE-1");
  });

  it("returns a practice when there are no games at all", () => {
    expect(selectNextEvent([at(1, "PRACTICE"), at(48, "PRACTICE")], now)?.id).toBe(
      "PRACTICE-1",
    );
  });

  it("still returns an event that started forty minutes ago", () => {
    const inProgress = {
      id: "in-progress",
      type: "PRACTICE" as const,
      startsAt: new Date(now.getTime() - 40 * 60 * 1000),
    };

    expect(selectNextEvent([inProgress, at(168)], now)?.id).toBe("in-progress");
  });

  it("keeps an event through the whole grace window", () => {
    const justInside = {
      id: "edge",
      type: "PRACTICE" as const,
      startsAt: new Date(now.getTime() - GAME_GRACE_MS + 1000),
    };

    expect(selectNextEvent([justInside], now)?.id).toBe("edge");
  });

  it("drops an event once the grace window has passed", () => {
    const justOutside = {
      id: "stale",
      type: "PRACTICE" as const,
      startsAt: new Date(now.getTime() - GAME_GRACE_MS),
    };

    expect(selectNextEvent([justOutside], now)).toBeNull();
  });

  it("returns null for no upcoming events and for an empty list", () => {
    expect(selectNextEvent([at(-48, "PRACTICE")], now)).toBeNull();
    expect(selectNextEvent([], now)).toBeNull();
  });

  // selectNextGame delegates its grace window here, so the games-only rule is
  // the only thing left that separates the two. Pinned from both sides: this
  // suite proves practices are kept, and selectNextGame's proves they are not.
  it("differs from selectNextGame only in the type filter", () => {
    const events = [at(1, "PRACTICE"), at(24)];

    expect(selectNextEvent(events, now)?.id).toBe("PRACTICE-1");
    expect(selectNextGame(events, now)?.id).toBe("GAME-24");
  });
});

describe("selectNextEvents", () => {
  const now = iso("2026-08-01T18:00:00Z");
  const at = (offsetHours: number, type: GameCandidate["type"] = "GAME") => ({
    id: `${type}-${offsetHours}`,
    type,
    startsAt: new Date(now.getTime() + offsetHours * 60 * 60 * 1000),
  });

  it("returns the soonest events in order, whatever order they arrive in", () => {
    const events = [at(72), at(24, "PRACTICE"), at(120), at(48)];

    expect(selectNextEvents(events, now, 3).map((event) => event.id)).toEqual([
      "PRACTICE-24",
      "GAME-48",
      "GAME-72",
    ]);
  });

  it("returns fewer than the limit rather than padding", () => {
    expect(selectNextEvents([at(24)], now, 3)).toHaveLength(1);
    expect(selectNextEvents([], now, 3)).toEqual([]);
  });

  it("drops finished events before counting toward the limit", () => {
    // Only two survive the grace window, so a limit of three yields two — the
    // stale pair must not fill the list and push a real event off it.
    const events = [at(-48), at(-24), at(24), at(48)];

    expect(selectNextEvents(events, now, 3).map((event) => event.id)).toEqual([
      "GAME-24",
      "GAME-48",
    ]);
  });

  it("returns nothing for a limit of zero or less", () => {
    expect(selectNextEvents([at(24)], now, 0)).toEqual([]);
    expect(selectNextEvents([at(24)], now, -1)).toEqual([]);
  });

  it("does not mutate the caller's array", () => {
    const events = [at(72), at(24)];

    selectNextEvents(events, now, 3);

    expect(events.map((event) => event.id)).toEqual(["GAME-72", "GAME-24"]);
  });

  // selectNextEvent is the limit-1 case, so the two cannot disagree about
  // which event is next.
  it("agrees with selectNextEvent on the first entry", () => {
    const events = [at(72), at(24, "PRACTICE"), at(48)];

    expect(selectNextEvents(events, now, 3)[0]).toBe(selectNextEvent(events, now));
  });
});
