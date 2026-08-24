import { beforeEach, describe, expect, it, vi } from "vitest";

const rosterFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    rosterEntry: { findMany: (...args: unknown[]) => rosterFindMany(...args) },
  },
}));

import {
  listTeamGuardians,
  loadGuardianRostersByTeamId,
} from "@/lib/guardians";

/// The shape the select returns, not the shape callers get — these tests are
/// about the mapping between the two.
function entry(
  teamId: string,
  playerId: string,
  playerName: string,
  guardians: { id: string; email: string; name: string | null }[],
) {
  return {
    teamId,
    player: {
      id: playerId,
      name: playerName,
      guardians: guardians.map((user) => ({ user })),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rosterFindMany.mockResolvedValue([]);
});

describe("loadGuardianRostersByTeamId", () => {
  it("reads through the roster, scoped to the teams asked for", async () => {
    await loadGuardianRostersByTeamId(["team-1", "team-2"]);

    const [args] = rosterFindMany.mock.calls[0];
    expect(args.where).toEqual({ teamId: { in: ["team-1", "team-2"] } });
  });

  it("orders by jersey then creation, so a partial run resumes in the same sequence", async () => {
    await loadGuardianRostersByTeamId(["team-1"]);

    const [args] = rosterFindMany.mock.calls[0];
    expect(args.orderBy).toEqual([
      { jerseyNumber: "asc" },
      { createdAt: "asc" },
    ]);
  });

  it("groups players under their own team", async () => {
    rosterFindMany.mockResolvedValue([
      entry("team-1", "p1", "Ava", []),
      entry("team-2", "p2", "Ben", []),
      entry("team-1", "p3", "Cal", []),
    ]);

    const byTeamId = await loadGuardianRostersByTeamId(["team-1", "team-2"]);

    expect(byTeamId.get("team-1")?.map((row) => row.playerName)).toEqual([
      "Ava",
      "Cal",
    ]);
    expect(byTeamId.get("team-2")?.map((row) => row.playerName)).toEqual(["Ben"]);
  });

  it("flattens the GuardianPlayer join into userId/email/name", async () => {
    rosterFindMany.mockResolvedValue([
      entry("team-1", "p1", "Ava", [
        { id: "u1", email: "one@example.com", name: "Dana" },
        { id: "u2", email: "two@example.com", name: null },
      ]),
    ]);

    const byTeamId = await loadGuardianRostersByTeamId(["team-1"]);

    expect(byTeamId.get("team-1")?.[0].guardians).toEqual([
      { userId: "u1", email: "one@example.com", name: "Dana" },
      { userId: "u2", email: "two@example.com", name: null },
    ]);
  });

  it("omits a team that has nobody rostered rather than mapping it to empty", async () => {
    rosterFindMany.mockResolvedValue([entry("team-1", "p1", "Ava", [])]);

    const byTeamId = await loadGuardianRostersByTeamId(["team-1", "team-2"]);

    expect(byTeamId.has("team-2")).toBe(false);
  });

  // The cron and the announcement both read "nobody" as a real state — no
  // reminders to send, nothing announced. A swallowed outage would assert that
  // state instead of failing, and a whole team would silently miss a game.
  it("propagates a database error instead of returning an empty map", async () => {
    rosterFindMany.mockRejectedValue(new Error("connection lost"));

    await expect(loadGuardianRostersByTeamId(["team-1"])).rejects.toThrow(
      "connection lost",
    );
  });
});

describe("listTeamGuardians", () => {
  it("returns that one team's roster", async () => {
    rosterFindMany.mockResolvedValue([
      entry("team-1", "p1", "Ava", [
        { id: "u1", email: "one@example.com", name: "Dana" },
      ]),
    ]);

    const roster = await listTeamGuardians("team-1");

    expect(roster).toEqual([
      {
        playerId: "p1",
        playerName: "Ava",
        guardians: [{ userId: "u1", email: "one@example.com", name: "Dana" }],
      },
    ]);
  });

  it("returns an empty roster for a team with nobody on it", async () => {
    expect(await listTeamGuardians("team-1")).toEqual([]);
  });
});
