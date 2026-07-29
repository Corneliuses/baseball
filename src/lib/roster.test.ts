import { describe, it, expect, vi, beforeEach } from "vitest";

const findManyRosterEntries = vi.fn();
const findFirstRosterEntry = vi.fn();
const createRosterEntry = vi.fn();
const updateRosterEntry = vi.fn();
const deleteRosterEntry = vi.fn();

vi.mock("./db", () => ({
  db: {
    rosterEntry: {
      findMany: (...args: unknown[]) => findManyRosterEntries(...args),
      findFirst: (...args: unknown[]) => findFirstRosterEntry(...args),
      create: (...args: unknown[]) => createRosterEntry(...args),
      update: (...args: unknown[]) => updateRosterEntry(...args),
      delete: (...args: unknown[]) => deleteRosterEntry(...args),
    },
  },
}));

import {
  addPlayerToRoster,
  getRoster,
  getRosterEntry,
  removeRosterEntry,
  updateRosterEntry as updateRosterEntryFn,
} from "./roster";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getRoster", () => {
  it("scopes the query to the team", async () => {
    findManyRosterEntries.mockResolvedValue([]);

    await getRoster("team-1");

    expect(findManyRosterEntries).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: "team-1" } }),
    );
  });

  it("selects only name and dateOfBirth from Player, never a team-specific column", async () => {
    findManyRosterEntries.mockResolvedValue([]);

    await getRoster("team-1");

    const call = findManyRosterEntries.mock.calls[0][0];
    expect(call.select.player.select).toEqual({
      id: true,
      name: true,
      dateOfBirth: true,
    });
  });

  it("returns an empty array when the database throws", async () => {
    findManyRosterEntries.mockRejectedValue(new Error("connection refused"));

    await expect(getRoster("team-1")).resolves.toEqual([]);
  });
});

describe("getRosterEntry", () => {
  it("scopes the lookup to both entryId and teamId", async () => {
    findFirstRosterEntry.mockResolvedValue(null);

    await getRosterEntry("team-1", "entry-1");

    expect(findFirstRosterEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "entry-1", teamId: "team-1" },
      }),
    );
  });

  it("filters guardian memberships to this team", async () => {
    findFirstRosterEntry.mockResolvedValue(null);

    await getRosterEntry("team-1", "entry-1");

    const call = findFirstRosterEntry.mock.calls[0][0];
    const guardianSelect =
      call.select.player.select.guardians.select.user.select;
    expect(guardianSelect.memberships.where).toEqual({ teamId: "team-1" });
  });

  it("maps a guardian with a membership on this team to isMember: true", async () => {
    findFirstRosterEntry.mockResolvedValue({
      id: "entry-1",
      jerseyNumber: 7,
      player: {
        id: "player-1",
        name: "Ada",
        dateOfBirth: null,
        guardians: [
          {
            user: {
              id: "user-1",
              name: "Sam",
              email: "sam@example.com",
              phone: null,
              emailVerified: new Date("2026-04-01"),
              memberships: [{ role: "PARENT" }],
            },
          },
        ],
      },
    });

    const entry = await getRosterEntry("team-1", "entry-1");

    expect(entry?.guardians).toEqual([
      {
        id: "user-1",
        name: "Sam",
        email: "sam@example.com",
        phone: null,
        isMember: true,
        hasSignedIn: true,
      },
    ]);
  });

  // The distinction the UI depends on: linkGuardian creates the Membership up
  // front, so isMember is true from the moment a guardian is added. Only
  // emailVerified separates "invitation still outstanding" from "onboarded",
  // and the Resend button is gated on it.
  it("reports a linked but never-signed-in guardian as a member who has not signed in", async () => {
    findFirstRosterEntry.mockResolvedValue({
      id: "entry-1",
      jerseyNumber: 7,
      player: {
        id: "player-1",
        name: "Ada",
        dateOfBirth: null,
        guardians: [
          {
            user: {
              id: "user-1",
              name: null,
              email: "sam@example.com",
              phone: null,
              emailVerified: null,
              memberships: [{ role: "PARENT" }],
            },
          },
        ],
      },
    });

    const entry = await getRosterEntry("team-1", "entry-1");

    expect(entry?.guardians[0].isMember).toBe(true);
    expect(entry?.guardians[0].hasSignedIn).toBe(false);
  });

  it("maps a guardian with no membership on this team to isMember: false", async () => {
    findFirstRosterEntry.mockResolvedValue({
      id: "entry-1",
      jerseyNumber: null,
      player: { id: "player-1", name: "Ada", dateOfBirth: null, guardians: [
        {
          user: {
            id: "user-1",
            name: null,
            email: "sam@example.com",
            phone: null,
            emailVerified: null,
            memberships: [],
          },
        },
      ] },
    });

    const entry = await getRosterEntry("team-1", "entry-1");

    expect(entry?.guardians[0].isMember).toBe(false);
  });

  // Callers turn null into notFound(). Swallowing the error would render
  // "this player doesn't exist" during an outage — the bug getTeamById was
  // fixed for in #3.
  it("lets a database error propagate rather than reporting the player as missing", async () => {
    findFirstRosterEntry.mockRejectedValue(new Error("connection refused"));

    await expect(getRosterEntry("team-1", "entry-1")).rejects.toThrow(
      "connection refused",
    );
  });
});

describe("addPlayerToRoster", () => {
  it("writes only name and dateOfBirth to Player, and jerseyNumber to RosterEntry", async () => {
    createRosterEntry.mockResolvedValue({
      id: "entry-1",
      jerseyNumber: 7,
      player: { id: "player-1", name: "Ada", dateOfBirth: null },
    });

    await addPlayerToRoster("team-1", {
      name: "Ada",
      dateOfBirth: null,
      jerseyNumber: 7,
    });

    expect(createRosterEntry).toHaveBeenCalledWith({
      data: {
        team: { connect: { id: "team-1" } },
        jerseyNumber: 7,
        player: {
          create: { name: "Ada", dateOfBirth: null },
        },
      },
      select: expect.any(Object),
    });
  });

  it("propagates a write error rather than swallowing it", async () => {
    createRosterEntry.mockRejectedValue({
      code: "P2002",
      meta: { target: ["teamId", "jerseyNumber"] },
    });

    await expect(
      addPlayerToRoster("team-1", {
        name: "Ada",
        dateOfBirth: null,
        jerseyNumber: 7,
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("updateRosterEntry", () => {
  it("scopes the write to both entryId and teamId", async () => {
    updateRosterEntry.mockResolvedValue({
      id: "entry-1",
      jerseyNumber: 9,
      player: { id: "player-1", name: "Ada", dateOfBirth: null },
    });

    await updateRosterEntryFn("team-1", "entry-1", {
      name: "Ada",
      dateOfBirth: null,
      jerseyNumber: 9,
    });

    expect(updateRosterEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "entry-1", teamId: "team-1" },
      }),
    );
  });
});

describe("removeRosterEntry", () => {
  it("deletes only the roster entry, scoped to the team", async () => {
    deleteRosterEntry.mockResolvedValue({});

    await removeRosterEntry("team-1", "entry-1");

    expect(deleteRosterEntry).toHaveBeenCalledWith({
      where: { id: "entry-1", teamId: "team-1" },
    });
  });
});
