import { describe, expect, it } from "vitest";
import {
  buildRsvpStateMap,
  buildRsvpStateMapsByEvent,
  deriveRsvpState,
  type RsvpRow,
} from "@/lib/rsvp";

describe("deriveRsvpState", () => {
  it("returns no-response when no row exists", () => {
    expect(deriveRsvpState(undefined)).toBe("no-response");
  });

  it("returns attending when the row's attending is true", () => {
    expect(deriveRsvpState({ attending: true })).toBe("attending");
  });

  it("returns declined when the row's attending is false", () => {
    expect(deriveRsvpState({ attending: false })).toBe("declined");
  });
});

describe("buildRsvpStateMap", () => {
  it("defaults every unrepresented player to no-response", () => {
    const map = buildRsvpStateMap(["ava", "ben", "cy"], []);

    expect(map.get("ava")).toBe("no-response");
    expect(map.get("ben")).toBe("no-response");
    expect(map.get("cy")).toBe("no-response");
  });

  it("covers all three states across a roster", () => {
    const rows: RsvpRow[] = [
      { playerId: "ava", attending: true },
      { playerId: "ben", attending: false },
    ];

    const map = buildRsvpStateMap(["ava", "ben", "cy"], rows);

    expect(map.get("ava")).toBe("attending");
    expect(map.get("ben")).toBe("declined");
    expect(map.get("cy")).toBe("no-response");
  });

  it("returns an empty map for an empty roster", () => {
    const rows: RsvpRow[] = [{ playerId: "ava", attending: true }];

    const map = buildRsvpStateMap([], rows);

    expect(map.size).toBe(0);
  });

  it("excludes a row for a player not in the roster", () => {
    const rows: RsvpRow[] = [{ playerId: "zed", attending: true }];

    const map = buildRsvpStateMap(["ava"], rows);

    expect(map.has("zed")).toBe(false);
    expect(map.get("ava")).toBe("no-response");
  });
});

describe("buildRsvpStateMapsByEvent", () => {
  const rows = [
    { eventId: "game", playerId: "ava", attending: true },
    { eventId: "game", playerId: "bo", attending: false },
    { eventId: "practice", playerId: "ava", attending: false },
  ];

  it("keeps each event's answers to that event", () => {
    const maps = buildRsvpStateMapsByEvent(["game", "practice"], ["ava", "bo"], rows);

    expect(maps.get("game")?.get("ava")).toBe("attending");
    expect(maps.get("game")?.get("bo")).toBe("declined");
    // The same player, the other event, the opposite answer — a single shared
    // state map would report "attending" here.
    expect(maps.get("practice")?.get("ava")).toBe("declined");
  });

  it("gives every requested event a map, even one nobody answered for", () => {
    const maps = buildRsvpStateMapsByEvent(["game", "silent"], ["ava"], rows);

    expect(maps.has("silent")).toBe(true);
    expect(maps.get("silent")?.get("ava")).toBe("no-response");
  });

  it("gives every player an entry, defaulting to no-response", () => {
    const maps = buildRsvpStateMapsByEvent(["practice"], ["ava", "bo"], rows);

    expect(maps.get("practice")?.get("bo")).toBe("no-response");
  });

  // Same rule as buildRsvpStateMap: this answers "where does this roster
  // stand", not "what rows exist".
  it("ignores rows for a player outside the list and events outside it", () => {
    const maps = buildRsvpStateMapsByEvent(["game"], ["ava"], [
      ...rows,
      { eventId: "game", playerId: "left-the-team", attending: true },
    ]);

    expect(maps.size).toBe(1);
    expect([...(maps.get("game") ?? [])].map(([id]) => id)).toEqual(["ava"]);
  });

  it("returns an empty map for no events", () => {
    expect(buildRsvpStateMapsByEvent([], ["ava"], rows).size).toBe(0);
  });
});
