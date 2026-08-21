import { describe, it, expect, vi, beforeEach } from "vitest";

const findManyRsvps = vi.fn();
const upsertRsvpMock = vi.fn();
const findManyGuardianPlayers = vi.fn();

vi.mock("./db", () => ({
  db: {
    rsvp: {
      findMany: (...args: unknown[]) => findManyRsvps(...args),
      upsert: (...args: unknown[]) => upsertRsvpMock(...args),
    },
    guardianPlayer: {
      findMany: (...args: unknown[]) => findManyGuardianPlayers(...args),
    },
  },
}));

import {
  guardedRosteredPlayerIds,
  listEventRsvps,
  listRsvpsForEvents,
  upsertRsvp,
} from "./rsvps";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listEventRsvps", () => {
  it("scopes the query to the event and, through it, the team", async () => {
    findManyRsvps.mockResolvedValue([]);

    await listEventRsvps("team-1", "event-1");

    expect(findManyRsvps).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: "event-1", event: { teamId: "team-1" } },
      }),
    );
  });

  it("selects only playerId and attending", async () => {
    findManyRsvps.mockResolvedValue([]);

    await listEventRsvps("team-1", "event-1");

    expect(findManyRsvps).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { playerId: true, attending: true },
      }),
    );
  });

  it("propagates database errors rather than swallowing them", async () => {
    findManyRsvps.mockRejectedValue(new Error("connection lost"));

    await expect(listEventRsvps("team-1", "event-1")).rejects.toThrow(
      "connection lost",
    );
  });
});

describe("listRsvpsForEvents", () => {
  it("scopes the query to the named events and, through them, the team", async () => {
    findManyRsvps.mockResolvedValue([]);

    await listRsvpsForEvents("team-1", ["event-1", "event-2"]);

    expect(findManyRsvps).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          eventId: { in: ["event-1", "event-2"] },
          event: { teamId: "team-1" },
        },
      }),
    );
  });

  // eventId is what team home buckets on: without it every card would show the
  // same answer, which is exactly the per-event isolation this read exists for.
  it("selects eventId alongside playerId and attending", async () => {
    findManyRsvps.mockResolvedValue([]);

    await listRsvpsForEvents("team-1", ["event-1"]);

    expect(findManyRsvps).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { eventId: true, playerId: true, attending: true },
      }),
    );
  });

  it("asks the database nothing when there are no events", async () => {
    await expect(listRsvpsForEvents("team-1", [])).resolves.toEqual([]);

    expect(findManyRsvps).not.toHaveBeenCalled();
  });

  it("propagates database errors rather than swallowing them", async () => {
    findManyRsvps.mockRejectedValue(new Error("connection lost"));

    await expect(listRsvpsForEvents("team-1", ["event-1"])).rejects.toThrow(
      "connection lost",
    );
  });
});

describe("guardedRosteredPlayerIds", () => {
  it("intersects guardianship with roster membership on the given team", async () => {
    findManyGuardianPlayers.mockResolvedValue([]);

    await guardedRosteredPlayerIds("team-1", "user-1");

    expect(findManyGuardianPlayers).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-1",
          player: { rosterEntries: { some: { teamId: "team-1" } } },
        },
      }),
    );
  });

  it("returns the guarded, rostered player ids as a set", async () => {
    findManyGuardianPlayers.mockResolvedValue([
      { playerId: "ava" },
      { playerId: "ben" },
    ]);

    const result = await guardedRosteredPlayerIds("team-1", "user-1");

    expect(result).toEqual(new Set(["ava", "ben"]));
  });
});

describe("upsertRsvp", () => {
  it("upserts on the eventId_playerId unique with the given attendance", async () => {
    await upsertRsvp("event-1", "ava", true);

    expect(upsertRsvpMock).toHaveBeenCalledWith({
      where: { eventId_playerId: { eventId: "event-1", playerId: "ava" } },
      create: { eventId: "event-1", playerId: "ava", attending: true },
      update: { attending: true },
    });
  });
});
