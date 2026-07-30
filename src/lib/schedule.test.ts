import { describe, it, expect, vi, beforeEach } from "vitest";

const findManyEvents = vi.fn();
const findFirstEvent = vi.fn();
const createEvent = vi.fn();
const updateEvent = vi.fn();
const deleteEvent = vi.fn();

vi.mock("./db", () => ({
  db: {
    event: {
      findMany: (...args: unknown[]) => findManyEvents(...args),
      findFirst: (...args: unknown[]) => findFirstEvent(...args),
      create: (...args: unknown[]) => createEvent(...args),
      update: (...args: unknown[]) => updateEvent(...args),
      delete: (...args: unknown[]) => deleteEvent(...args),
    },
  },
}));

import {
  createEvent as createEventFn,
  deleteEvent as deleteEventFn,
  getEvent,
  listEventsInMonth,
  listPastEvents,
  listUpcomingEvents,
  nextGame,
  updateEvent as updateEventFn,
} from "@/lib/schedule";
import { GAME_GRACE_MS } from "@/lib/calendar";

const NOW = new Date("2026-08-01T18:00:00Z");

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    type: "GAME",
    startsAt: new Date("2026-08-02T23:00:00Z"),
    location: "Field 3",
    opponent: "Hawks",
    notes: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findManyEvents.mockResolvedValue([]);
  findFirstEvent.mockResolvedValue(null);
});

describe("listEventsInMonth", () => {
  it("bounds the query by the month as lived in Central, not UTC", async () => {
    await listEventsInMonth("team-1", { year: 2026, month: 8 });

    const [[args]] = findManyEvents.mock.calls;
    expect(args.where.teamId).toBe("team-1");
    expect(args.where.startsAt.gte.toISOString()).toBe("2026-08-01T05:00:00.000Z");
    expect(args.where.startsAt.lte.toISOString()).toBe("2026-09-01T04:59:59.999Z");
    expect(args.orderBy).toEqual({ startsAt: "asc" });
  });

  it("returns an empty list and logs when the database is down", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    findManyEvents.mockRejectedValue(new Error("connection refused"));

    await expect(
      listEventsInMonth("team-1", { year: 2026, month: 8 }),
    ).resolves.toEqual([]);
    expect(error).toHaveBeenCalled();

    error.mockRestore();
  });
});

describe("listUpcomingEvents", () => {
  it("asks for future events, soonest first, scoped to the team", async () => {
    await listUpcomingEvents("team-1", NOW);

    const [[args]] = findManyEvents.mock.calls;
    expect(args.where).toEqual({ teamId: "team-1", startsAt: { gte: NOW } });
    expect(args.orderBy).toEqual({ startsAt: "asc" });
  });

  it("returns an empty list when the database is down", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    findManyEvents.mockRejectedValue(new Error("down"));

    await expect(listUpcomingEvents("team-1", NOW)).resolves.toEqual([]);

    error.mockRestore();
  });
});

describe("listPastEvents", () => {
  it("asks for past events, most recent first", async () => {
    await listPastEvents("team-1", NOW);

    const [[args]] = findManyEvents.mock.calls;
    expect(args.where).toEqual({ teamId: "team-1", startsAt: { lt: NOW } });
    expect(args.orderBy).toEqual({ startsAt: "desc" });
  });
});

describe("getEvent", () => {
  it("scopes the lookup by teamId as well as id", async () => {
    findFirstEvent.mockResolvedValue(eventRow());

    await getEvent("team-1", "event-1");

    const [[args]] = findFirstEvent.mock.calls;
    expect(args.where).toEqual({ id: "event-1", teamId: "team-1" });
  });

  it("returns null for an event belonging to another team", async () => {
    await expect(getEvent("team-1", "other-teams-event")).resolves.toBeNull();
  });

  it("rethrows a database error instead of reporting the event as missing", async () => {
    // Swallowing here would render notFound() for an event that exists.
    findFirstEvent.mockRejectedValue(new Error("connection refused"));

    await expect(getEvent("team-1", "event-1")).rejects.toThrow("connection refused");
  });
});

describe("nextGame", () => {
  it("filters to games and excludes practices in the query itself", async () => {
    await nextGame("team-1", NOW);

    const [[args]] = findManyEvents.mock.calls;
    expect(args.where.teamId).toBe("team-1");
    expect(args.where.type).toBe("GAME");
    expect(args.orderBy).toEqual({ startsAt: "asc" });
  });

  it("applies the grace window so a game in progress still counts", async () => {
    await nextGame("team-1", NOW);

    const [[args]] = findManyEvents.mock.calls;
    expect(args.where.startsAt.gt.toISOString()).toBe(
      new Date(NOW.getTime() - GAME_GRACE_MS).toISOString(),
    );
  });

  it("returns the game when there is one", async () => {
    findManyEvents.mockResolvedValue([eventRow()]);

    await expect(nextGame("team-1", NOW)).resolves.toMatchObject({ id: "event-1" });
  });

  it("returns null when no game is upcoming", async () => {
    await expect(nextGame("team-1", NOW)).resolves.toBeNull();
  });

  it("never returns a practice, even if one somehow comes back from the query", async () => {
    // Belt and braces: the where clause already excludes practices, but the
    // rule lives in selectNextGame so it holds even if the query changes.
    findManyEvents.mockResolvedValue([eventRow({ type: "PRACTICE" })]);

    await expect(nextGame("team-1", NOW)).resolves.toBeNull();
  });

  it("rethrows a database error rather than reporting no upcoming game", async () => {
    findManyEvents.mockRejectedValue(new Error("connection refused"));

    await expect(nextGame("team-1", NOW)).rejects.toThrow("connection refused");
  });
});

describe("writes", () => {
  const input = {
    type: "GAME" as const,
    startsAt: new Date("2026-08-02T23:00:00Z"),
    location: "Field 3",
    opponent: "Hawks",
    notes: null,
  };

  it("createEvent attaches the teamId", async () => {
    createEvent.mockResolvedValue(eventRow());

    await createEventFn("team-1", input);

    const [[args]] = createEvent.mock.calls;
    expect(args.data).toEqual({ teamId: "team-1", ...input });
  });

  it("updateEvent scopes the where clause by teamId", async () => {
    updateEvent.mockResolvedValue(eventRow());

    await updateEventFn("team-1", "event-1", input);

    const [[args]] = updateEvent.mock.calls;
    expect(args.where).toEqual({ id: "event-1", teamId: "team-1" });
  });

  it("deleteEvent scopes the where clause by teamId", async () => {
    deleteEvent.mockResolvedValue(eventRow());

    await deleteEventFn("team-1", "event-1");

    const [[args]] = deleteEvent.mock.calls;
    expect(args.where).toEqual({ id: "event-1", teamId: "team-1" });
  });

  it("propagates a write failure rather than looking successful", async () => {
    createEvent.mockRejectedValue(new Error("constraint violation"));

    await expect(createEventFn("team-1", input)).rejects.toThrow(
      "constraint violation",
    );
  });
});
