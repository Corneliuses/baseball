import { describe, it, expect, vi, beforeEach } from "vitest";

const findManyTeams = vi.fn();
const findUniqueTeam = vi.fn();
const createTeamRow = vi.fn();
const updateTeamRow = vi.fn();

vi.mock("./db", () => ({
  db: {
    team: {
      findMany: (...args: unknown[]) => findManyTeams(...args),
      findUnique: (...args: unknown[]) => findUniqueTeam(...args),
      create: (...args: unknown[]) => createTeamRow(...args),
      update: (...args: unknown[]) => updateTeamRow(...args),
    },
  },
}));

import {
  getAllTeams,
  getMemberTeams,
  getTeamById,
  createTeam,
  updateTeam,
  archiveTeam,
  unarchiveTeam,
} from "./teams";

const TEAM_SELECT = {
  id: true,
  name: true,
  season: true,
  allPlay: true,
  archivedAt: true,
  createdAt: true,
};

const SAMPLE_TEAM = {
  id: "team-1",
  name: "Sharks",
  season: "2026",
  allPlay: true,
  archivedAt: null,
  createdAt: new Date("2026-07-28"),
};

beforeEach(() => {
  vi.clearAllMocks();
  findManyTeams.mockResolvedValue([]);
  findUniqueTeam.mockResolvedValue(null);
  createTeamRow.mockResolvedValue(SAMPLE_TEAM);
  updateTeamRow.mockResolvedValue(SAMPLE_TEAM);
});

describe("getAllTeams", () => {
  it("queries every team, ordered newest first", async () => {
    await getAllTeams();

    expect(findManyTeams).toHaveBeenCalledWith({
      select: TEAM_SELECT,
      orderBy: { createdAt: "desc" },
    });
  });

  it("returns an empty array when the query fails", async () => {
    findManyTeams.mockRejectedValue(new Error("db down"));

    await expect(getAllTeams()).resolves.toEqual([]);
  });
});

describe("getMemberTeams", () => {
  it("filters to the user's memberships, any archived state", async () => {
    await getMemberTeams("user-1");

    expect(findManyTeams).toHaveBeenCalledWith({
      where: { memberships: { some: { userId: "user-1" } } },
      select: TEAM_SELECT,
      orderBy: { createdAt: "desc" },
    });
  });

  it("returns an empty array when the query fails", async () => {
    findManyTeams.mockRejectedValue(new Error("db down"));

    await expect(getMemberTeams("user-1")).resolves.toEqual([]);
  });
});

describe("getTeamById", () => {
  it("queries by id", async () => {
    await getTeamById("team-1");

    expect(findUniqueTeam).toHaveBeenCalledWith({
      where: { id: "team-1" },
      select: TEAM_SELECT,
    });
  });

  it("lets a read failure propagate", async () => {
    findUniqueTeam.mockRejectedValue(new Error("db down"));

    await expect(getTeamById("team-1")).rejects.toThrow("db down");
  });
});

describe("createTeam", () => {
  it("issues one nested create — Team plus its owner Membership — not a $transaction", async () => {
    await createTeam({ name: "Sharks", season: "2026", allPlay: true }, "owner-1");

    expect(createTeamRow).toHaveBeenCalledTimes(1);
    expect(createTeamRow).toHaveBeenCalledWith({
      data: {
        name: "Sharks",
        season: "2026",
        allPlay: true,
        calendarToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        memberships: {
          create: { userId: "owner-1", role: "OWNER" },
        },
      },
      select: TEAM_SELECT,
    });
  });

  it("lets a write failure propagate rather than swallowing it", async () => {
    createTeamRow.mockRejectedValue(new Error("constraint violation"));

    await expect(
      createTeam({ name: "Sharks", season: null, allPlay: true }, "owner-1"),
    ).rejects.toThrow("constraint violation");
  });
});

describe("updateTeam", () => {
  it("updates only name, season, and allPlay", async () => {
    await updateTeam("team-1", { name: "Sharks", season: "2027", allPlay: false });

    expect(updateTeamRow).toHaveBeenCalledWith({
      where: { id: "team-1" },
      data: { name: "Sharks", season: "2027", allPlay: false },
      select: TEAM_SELECT,
    });
  });

  it("lets a write failure propagate", async () => {
    updateTeamRow.mockRejectedValue(new Error("not found"));

    await expect(
      updateTeam("team-1", { name: "Sharks", season: null, allPlay: true }),
    ).rejects.toThrow("not found");
  });
});

describe("archiveTeam", () => {
  it("sets archivedAt to the given timestamp", async () => {
    const now = new Date("2026-08-01T00:00:00Z");

    await archiveTeam("team-1", now);

    expect(updateTeamRow).toHaveBeenCalledWith({
      where: { id: "team-1" },
      data: { archivedAt: now },
      select: TEAM_SELECT,
    });
  });

  it("defaults to the current time", async () => {
    await archiveTeam("team-1");

    const call = updateTeamRow.mock.calls[0][0];
    expect(call.data.archivedAt).toBeInstanceOf(Date);
  });
});

describe("unarchiveTeam", () => {
  it("clears archivedAt", async () => {
    await unarchiveTeam("team-1");

    expect(updateTeamRow).toHaveBeenCalledWith({
      where: { id: "team-1" },
      data: { archivedAt: null },
      select: TEAM_SELECT,
    });
  });

  it("lets a write failure propagate", async () => {
    updateTeamRow.mockRejectedValue(new Error("not found"));

    await expect(unarchiveTeam("team-1")).rejects.toThrow("not found");
  });
});
