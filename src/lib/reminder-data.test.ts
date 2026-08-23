import { beforeEach, describe, expect, it, vi } from "vitest";

const eventFindMany = vi.fn();
const rosterFindMany = vi.fn();
const receiptCreate = vi.fn();
const receiptDeleteMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    event: { findMany: (...args: unknown[]) => eventFindMany(...args) },
    rosterEntry: { findMany: (...args: unknown[]) => rosterFindMany(...args) },
    reminderReceipt: {
      create: (...args: unknown[]) => receiptCreate(...args),
      deleteMany: (...args: unknown[]) => receiptDeleteMany(...args),
    },
  },
}));

import {
  claimReminder,
  loadTodaysReminderWork,
  releaseReminder,
} from "@/lib/reminder-data";
import { endOfDayInZone } from "@/lib/calendar";

/// 7:00 AM Central on 15 July 2026 — when the cron actually runs.
const NOW = new Date("2026-07-15T12:00:00Z");

function row(id: string) {
  return {
    id,
    teamId: "team-1",
    type: "GAME" as const,
    startsAt: new Date("2026-07-15T22:30:00Z"),
    location: "Riverside Field 2",
    opponent: "Hawks",
    notes: null,
    team: { name: "Sharks" },
    rsvps: [],
  };
}

function rows(count: number) {
  return Array.from({ length: count }, (_, index) => row(`evt-${index}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  eventFindMany.mockResolvedValue([]);
  rosterFindMany.mockResolvedValue([]);
  receiptCreate.mockResolvedValue({ id: "receipt-1" });
  receiptDeleteMany.mockResolvedValue({ count: 1 });
});

describe("loadTodaysReminderWork — the query", () => {
  it("excludes archived teams, which is the only place that check lives", async () => {
    // The cron runs as the system with no requireTeamAccess to lean on, so
    // this filter is the whole of AC 5.
    await loadTodaysReminderWork(NOW);

    const [args] = eventFindMany.mock.calls[0];
    expect(args.where.team).toEqual({ archivedAt: null });
  });

  it("windows from now to the end of today in APP_TIMEZONE", async () => {
    await loadTodaysReminderWork(NOW);

    const [args] = eventFindMany.mock.calls[0];
    expect(args.where.startsAt.gte).toBe(NOW);
    // Not a UTC day: a 7:30 PM Central game is already tomorrow in UTC, and a
    // UTC window would skip it while picking up yesterday's evening games.
    expect(args.where.startsAt.lte).toEqual(endOfDayInZone(NOW));
    expect(args.where.startsAt.lte.toISOString()).toBe(
      "2026-07-16T04:59:59.999Z",
    );
  });

  it("lower-bounds at now, so an afternoon re-run skips the morning game", async () => {
    const afternoon = new Date("2026-07-15T20:00:00Z");

    await loadTodaysReminderWork(afternoon);

    expect(eventFindMany.mock.calls[0][0].where.startsAt.gte).toBe(afternoon);
  });

  it("does not read rosters for a day with no events", async () => {
    const work = await loadTodaysReminderWork(NOW);

    expect(rosterFindMany).not.toHaveBeenCalled();
    expect(work).toEqual({ events: [], truncated: false });
  });

  it("reads each team's roster once, however many events it has", async () => {
    eventFindMany.mockResolvedValue([row("evt-1"), row("evt-2")]);

    await loadTodaysReminderWork(NOW);

    expect(rosterFindMany).toHaveBeenCalledTimes(1);
    expect(rosterFindMany.mock.calls[0][0].where.teamId).toEqual({
      in: ["team-1"],
    });
  });
});

describe("loadTodaysReminderWork — truncation", () => {
  it("reports a normal day as complete", async () => {
    eventFindMany.mockResolvedValue(rows(3));

    const work = await loadTodaysReminderWork(NOW);

    expect(work.events).toHaveLength(3);
    expect(work.truncated).toBe(false);
  });

  it("asks for one more than the cap, so hitting it is detectable", async () => {
    await loadTodaysReminderWork(NOW);

    // Taking exactly the cap makes a full day and an overflowing one
    // indistinguishable.
    expect(eventFindMany.mock.calls[0][0].take).toBe(51);
  });

  it("is not truncated at exactly the cap", async () => {
    eventFindMany.mockResolvedValue(rows(50));

    const work = await loadTodaysReminderWork(NOW);

    expect(work.events).toHaveLength(50);
    expect(work.truncated).toBe(false);
  });

  it("flags truncation and drops the overflow rather than reporting a sweep", async () => {
    eventFindMany.mockResolvedValue(rows(51));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const work = await loadTodaysReminderWork(NOW);

    expect(work.events).toHaveLength(50);
    expect(work.truncated).toBe(true);
    expect(logged).toHaveBeenCalled();

    logged.mockRestore();
  });

  it("lets a read failure propagate — silence looks exactly like no events", async () => {
    eventFindMany.mockRejectedValue(new Error("connection lost"));

    await expect(loadTodaysReminderWork(NOW)).rejects.toThrow("connection lost");
  });
});

describe("claimReminder", () => {
  it("takes the slot", async () => {
    expect(await claimReminder("evt-1", "user-1")).toBe("claimed");
    expect(receiptCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { eventId: "evt-1", userId: "user-1" } }),
    );
  });

  // Both meta.target shapes seen across Prisma versions — an array of column
  // names and a single constraint-name string, as roster-rules.ts documents.
  it.each([
    ["an array of columns", { code: "P2002", meta: { target: ["eventId", "userId"] } }],
    ["a constraint name", { code: "P2002", meta: { target: "ReminderReceipt_eventId_userId_key" } }],
    ["no usable target", { code: "P2002" }],
  ])("reads a unique violation with %s as already-sent", async (_label, error) => {
    receiptCreate.mockRejectedValue(error);

    expect(await claimReminder("evt-1", "user-1")).toBe("already-sent");
  });

  // A transient failure must NOT read as "already sent": the caller would skip
  // the send, and the family would simply never be reminded.
  it("rethrows anything that is not a unique violation", async () => {
    receiptCreate.mockRejectedValue(new Error("connection pool timeout"));

    await expect(claimReminder("evt-1", "user-1")).rejects.toThrow(
      "connection pool timeout",
    );
  });
});

describe("releaseReminder", () => {
  it("gives the slot back", async () => {
    await releaseReminder("evt-1", "user-1");

    expect(receiptDeleteMany).toHaveBeenCalledWith({
      where: { eventId: "evt-1", userId: "user-1" },
    });
  });

  // Throwing here would abort the rest of the batch over a reminder that had
  // already failed to send.
  it("never throws", async () => {
    receiptDeleteMany.mockRejectedValue(new Error("database down"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(releaseReminder("evt-1", "user-1")).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalled();

    logged.mockRestore();
  });
});
