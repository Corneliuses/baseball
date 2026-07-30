import { describe, expect, it } from "vitest";
import { buildRsvpStateMap, deriveRsvpState, type RsvpRow } from "@/lib/rsvp";

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
