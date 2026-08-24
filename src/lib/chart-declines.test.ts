import { describe, it, expect, vi, beforeEach } from "vitest";

const nextGame = vi.fn();
const listEventRsvps = vi.fn();

vi.mock("@/lib/schedule", () => ({
  nextGame: (...args: unknown[]) => nextGame(...args),
}));

vi.mock("@/lib/rsvps", () => ({
  listEventRsvps: (...args: unknown[]) => listEventRsvps(...args),
}));

import { declinedEntryIds, loadDeclinedEntryIds } from "./chart-declines";

const entries = [
  { entryId: "entry-ava", playerId: "ava" },
  { entryId: "entry-ben", playerId: "ben" },
  { entryId: "entry-cal", playerId: "cal" },
];

const game = { id: "event-1", startsAt: new Date("2026-08-15T23:00:00Z") };

beforeEach(() => {
  vi.clearAllMocks();
  nextGame.mockResolvedValue(game);
  listEventRsvps.mockResolvedValue([]);
});

describe("declinedEntryIds", () => {
  it("returns the roster spots of players who said no", () => {
    const states = new Map<string, "attending" | "declined" | "no-response">([
      ["ava", "declined"],
      ["ben", "attending"],
      ["cal", "no-response"],
    ]);

    expect(declinedEntryIds(entries, states)).toEqual(["entry-ava"]);
  });

  it("treats silence as nothing to report", () => {
    // readiness.ts's rule, restated: a family that hasn't answered is most
    // likely coming, and badging them is the noise that trains a coach to
    // ignore every badge.
    expect(declinedEntryIds(entries, new Map())).toEqual([]);
  });

  it("keys on the roster spot, not the player", () => {
    // A player is global; the same kid on another team is a different entry.
    const states = new Map<string, "declined">([["cal", "declined"]]);

    expect(declinedEntryIds(entries, states)).toEqual(["entry-cal"]);
  });
});

describe("loadDeclinedEntryIds", () => {
  it("reports the declines on the team's next game", async () => {
    listEventRsvps.mockResolvedValue([
      { playerId: "ben", attending: false, recordedById: null },
    ]);

    await expect(loadDeclinedEntryIds("team-1", entries)).resolves.toEqual([
      "entry-ben",
    ]);
    expect(listEventRsvps).toHaveBeenCalledWith("team-1", "event-1");
  });

  it("reports nothing, and reads no RSVPs, with no game on the schedule", async () => {
    nextGame.mockResolvedValue(null);

    await expect(loadDeclinedEntryIds("team-1", entries)).resolves.toEqual([]);
    expect(listEventRsvps).not.toHaveBeenCalled();
  });

  it("is blind to who recorded the response", async () => {
    // #54: a coach may record a family's decline. It is still a decline.
    listEventRsvps.mockResolvedValue([
      { playerId: "ben", attending: false, recordedById: "coach-1" },
    ]);

    await expect(loadDeclinedEntryIds("team-1", entries)).resolves.toEqual([
      "entry-ben",
    ]);
  });

  it("lets a database outage propagate rather than drawing an all-clear board", async () => {
    listEventRsvps.mockRejectedValue(new Error("db down"));

    await expect(loadDeclinedEntryIds("team-1", entries)).rejects.toThrow(
      "db down",
    );
  });
});
