import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueTeam = vi.fn();
const findManyEvents = vi.fn();

vi.mock("./db", () => ({
  db: {
    team: {
      findUnique: (...args: unknown[]) => findUniqueTeam(...args),
    },
    event: {
      findMany: (...args: unknown[]) => findManyEvents(...args),
    },
  },
}));

import {
  getCalendarToken,
  getTeamByCalendarToken,
  listAllEvents,
} from "./calendar-feed";

beforeEach(() => {
  vi.clearAllMocks();
  findUniqueTeam.mockResolvedValue(null);
  findManyEvents.mockResolvedValue([]);
});

describe("getTeamByCalendarToken", () => {
  it("resolves by the unique token column, selecting display fields only", async () => {
    await getTeamByCalendarToken("tok-1");

    // The exact select list is the minors'-data posture: no memberships, no
    // roster, no user columns leave through the signed-out surface.
    expect(findUniqueTeam).toHaveBeenCalledWith({
      where: { calendarToken: "tok-1" },
      select: { id: true, name: true, season: true },
    });
  });

  it("returns null for an unknown token", async () => {
    expect(await getTeamByCalendarToken("nope")).toBeNull();
  });

  it("lets a database error propagate — an outage must 500, not 404", async () => {
    findUniqueTeam.mockRejectedValue(new Error("db down"));

    await expect(getTeamByCalendarToken("tok-1")).rejects.toThrow("db down");
  });
});

describe("getCalendarToken", () => {
  it("reads only the token column for the named team", async () => {
    findUniqueTeam.mockResolvedValue({ calendarToken: "tok-1" });

    expect(await getCalendarToken("team-1")).toBe("tok-1");
    expect(findUniqueTeam).toHaveBeenCalledWith({
      where: { id: "team-1" },
      select: { calendarToken: true },
    });
  });

  it("returns null for a team that doesn't exist", async () => {
    expect(await getCalendarToken("gone")).toBeNull();
  });
});

describe("listAllEvents", () => {
  it("scopes by teamId and selects event fields only, ascending", async () => {
    await listAllEvents("team-1");

    expect(findManyEvents).toHaveBeenCalledWith({
      where: { teamId: "team-1" },
      select: {
        id: true,
        type: true,
        startsAt: true,
        location: true,
        opponent: true,
        notes: true,
      },
      orderBy: { startsAt: "asc" },
    });
  });

  it("lets a database error propagate — an empty feed would sync as a deleted season", async () => {
    findManyEvents.mockRejectedValue(new Error("db down"));

    await expect(listAllEvents("team-1")).rejects.toThrow("db down");
  });
});
