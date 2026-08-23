import { describe, expect, it } from "vitest";

import {
  buildReminderBatch,
  type ReminderEvent,
  type ReminderRosterEntry,
} from "@/lib/reminders";

const ANNA = { userId: "user-anna", email: "anna@example.com", name: "Anna" };
const BEN = { userId: "user-ben", email: "ben@example.com", name: "Ben" };

function rosterEntry(
  playerId: string,
  playerName: string,
  guardians: ReminderRosterEntry["guardians"],
): ReminderRosterEntry {
  return { playerId, playerName, guardians };
}

function event(overrides: Partial<ReminderEvent> = {}): ReminderEvent {
  return {
    id: "evt-1",
    teamId: "team-1",
    teamName: "Sharks",
    type: "GAME",
    startsAt: new Date("2026-07-15T23:30:00Z"),
    location: "Riverside Field 2",
    opponent: "Hawks",
    notes: "Arrive 30 minutes early.",
    roster: [rosterEntry("player-1", "Jimmy", [ANNA])],
    rsvps: [],
    ...overrides,
  };
}

describe("buildReminderBatch", () => {
  it("carries the event details and the guardian's own kid", () => {
    const [payload, ...rest] = buildReminderBatch([event()]);

    expect(rest).toHaveLength(0);
    expect(payload).toMatchObject({
      eventId: "evt-1",
      teamId: "team-1",
      teamName: "Sharks",
      userId: "user-anna",
      email: "anna@example.com",
      guardianName: "Anna",
      type: "GAME",
      location: "Riverside Field 2",
      opponent: "Hawks",
      notes: "Arrive 30 minutes early.",
    });
    expect(payload.kids).toEqual([
      { playerId: "player-1", name: "Jimmy", rsvp: "no-response" },
    ]);
  });

  it("sends one email per household, listing both kids", () => {
    const payloads = buildReminderBatch([
      event({
        roster: [
          rosterEntry("player-1", "Jimmy", [ANNA]),
          rosterEntry("player-2", "Sofia", [ANNA]),
        ],
      }),
    ]);

    expect(payloads).toHaveLength(1);
    expect(payloads[0].email).toBe("anna@example.com");
    expect(payloads[0].kids.map((k) => k.name)).toEqual(["Jimmy", "Sofia"]);
  });

  it("gives each guardian of one kid their own email", () => {
    const payloads = buildReminderBatch([
      event({ roster: [rosterEntry("player-1", "Jimmy", [ANNA, BEN])] }),
    ]);

    expect(payloads.map((p) => p.email)).toEqual([
      "anna@example.com",
      "ben@example.com",
    ]);
    expect(payloads[1].kids.map((k) => k.name)).toEqual(["Jimmy"]);
  });

  it("derives each kid's RSVP state, defaulting to no-response", () => {
    const payloads = buildReminderBatch([
      event({
        roster: [
          rosterEntry("player-1", "Jimmy", [ANNA]),
          rosterEntry("player-2", "Sofia", [ANNA]),
          rosterEntry("player-3", "Theo", [ANNA]),
        ],
        rsvps: [
          { playerId: "player-1", attending: true },
          { playerId: "player-2", attending: false },
        ],
      }),
    ]);

    expect(payloads[0].kids).toEqual([
      { playerId: "player-1", name: "Jimmy", rsvp: "attending" },
      { playerId: "player-2", name: "Sofia", rsvp: "declined" },
      { playerId: "player-3", name: "Theo", rsvp: "no-response" },
    ]);
  });

  it("reminds a family that already said yes", () => {
    const payloads = buildReminderBatch([
      event({ rsvps: [{ playerId: "player-1", attending: true }] }),
    ]);

    expect(payloads).toHaveLength(1);
    expect(payloads[0].kids[0].rsvp).toBe("attending");
  });

  it("tells a guardian nothing about another family's kids", () => {
    const payloads = buildReminderBatch([
      event({
        roster: [
          rosterEntry("player-1", "Jimmy", [ANNA]),
          rosterEntry("player-2", "Sofia", [BEN]),
        ],
      }),
    ]);

    const anna = payloads.find((p) => p.userId === "user-anna");
    expect(anna?.kids.map((k) => k.name)).toEqual(["Jimmy"]);
    expect(JSON.stringify(anna)).not.toContain("Sofia");
  });

  it("emails one payload per event, so a doubleheader sends twice", () => {
    const payloads = buildReminderBatch([
      event({ id: "evt-morning" }),
      event({ id: "evt-noon", opponent: "Bears" }),
    ]);

    expect(payloads.map((p) => p.eventId)).toEqual(["evt-morning", "evt-noon"]);
    expect(payloads.every((p) => p.userId === "user-anna")).toBe(true);
  });

  it("keys a guardian per event, never merging two events into one email", () => {
    const payloads = buildReminderBatch([
      event({ id: "evt-1", type: "PRACTICE", opponent: null }),
      event({ id: "evt-2" }),
    ]);

    expect(payloads[0].type).toBe("PRACTICE");
    expect(payloads[1].type).toBe("GAME");
  });

  it("skips a guardian with no email rather than sending to nowhere", () => {
    const payloads = buildReminderBatch([
      event({
        roster: [
          rosterEntry("player-1", "Jimmy", [
            { userId: "user-ghost", email: "", name: "Ghost" },
            ANNA,
          ]),
        ],
      }),
    ]);

    expect(payloads.map((p) => p.userId)).toEqual(["user-anna"]);
  });

  it("produces nothing for an event whose roster has no guardians", () => {
    expect(
      buildReminderBatch([
        event({ roster: [rosterEntry("player-1", "Jimmy", [])] }),
      ]),
    ).toEqual([]);
  });

  it("produces nothing for an empty roster or an empty day", () => {
    expect(buildReminderBatch([event({ roster: [] })])).toEqual([]);
    expect(buildReminderBatch([])).toEqual([]);
  });

  it("never lists the same kid twice for one guardian", () => {
    const payloads = buildReminderBatch([
      event({
        roster: [rosterEntry("player-1", "Jimmy", [ANNA, ANNA])],
      }),
    ]);

    expect(payloads).toHaveLength(1);
    expect(payloads[0].kids).toHaveLength(1);
  });
});
