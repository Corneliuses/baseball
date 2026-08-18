import { describe, it, expect, vi, beforeEach } from "vitest";

const findManyMemberships = vi.fn();
const findUniqueMembership = vi.fn();
const countMemberships = vi.fn();
const updateMembership = vi.fn();
const transaction = vi.fn();

// setMemberRole runs its check-and-update inside an interactive transaction,
// so the mock `tx` handed to the callback needs the same membership methods
// as `db` itself.
const tx = {
  membership: {
    findUnique: (...args: unknown[]) => findUniqueMembership(...args),
    count: (...args: unknown[]) => countMemberships(...args),
    update: (...args: unknown[]) => updateMembership(...args),
  },
};

vi.mock("./db", () => ({
  db: {
    membership: {
      findMany: (...args: unknown[]) => findManyMemberships(...args),
      findUnique: (...args: unknown[]) => findUniqueMembership(...args),
      count: (...args: unknown[]) => countMemberships(...args),
      update: (...args: unknown[]) => updateMembership(...args),
    },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

import {
  LastOwnerError,
  listCoachContacts,
  listDirectory,
  listTeamMembers,
  setMemberRole,
} from "./memberships";

beforeEach(() => {
  vi.clearAllMocks();
  transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
    callback(tx),
  );
});

describe("listCoachContacts", () => {
  it("filters to OWNER and COACH in the query itself", async () => {
    findManyMemberships.mockResolvedValue([]);

    await listCoachContacts("team-1");

    expect(findManyMemberships).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { teamId: "team-1", role: { in: ["OWNER", "COACH"] } },
      }),
    );
  });

  it("maps staff rows to flat contact records", async () => {
    findManyMemberships.mockResolvedValue([
      {
        userId: "user-1",
        role: "OWNER",
        user: { name: "Mel", email: "mel@example.com", phone: "555-9876" },
      },
    ]);

    const contacts = await listCoachContacts("team-1");

    expect(contacts).toEqual([
      {
        userId: "user-1",
        role: "OWNER",
        name: "Mel",
        email: "mel@example.com",
        phone: "555-9876",
      },
    ]);
  });

  it("returns an empty list when the query fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    findManyMemberships.mockRejectedValue(new Error("boom"));

    await expect(listCoachContacts("team-1")).resolves.toEqual([]);

    consoleError.mockRestore();
  });
});

describe("listTeamMembers", () => {
  it("scopes the query to the team", async () => {
    findManyMemberships.mockResolvedValue([]);

    await listTeamMembers("team-1");

    expect(findManyMemberships).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: "team-1" } }),
    );
  });

  it("maps membership rows to flat member records", async () => {
    findManyMemberships.mockResolvedValue([
      {
        userId: "user-1",
        role: "COACH",
        user: { name: "Sam", email: "sam@example.com", phone: null },
      },
    ]);

    const members = await listTeamMembers("team-1");

    expect(members).toEqual([
      {
        userId: "user-1",
        role: "COACH",
        name: "Sam",
        email: "sam@example.com",
        phone: null,
      },
    ]);
  });

  it("returns an empty array when the database throws", async () => {
    findManyMemberships.mockRejectedValue(new Error("connection refused"));

    await expect(listTeamMembers("team-1")).resolves.toEqual([]);
  });
});

describe("listDirectory", () => {
  it("scopes the query to the team", async () => {
    findManyMemberships.mockResolvedValue([]);

    await listDirectory("team-1");

    expect(findManyMemberships).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: "team-1" } }),
    );
  });

  it("scopes each member's guarded players to this team's roster", async () => {
    findManyMemberships.mockResolvedValue([]);

    await listDirectory("team-1");

    const call = findManyMemberships.mock.calls[0][0];
    expect(call.select.user.select.guardianOf.where).toEqual({
      player: { rosterEntries: { some: { teamId: "team-1" } } },
    });
  });

  it("maps a membership with kids on this team", async () => {
    findManyMemberships.mockResolvedValue([
      {
        userId: "user-1",
        role: "PARENT",
        user: {
          name: "Sam",
          email: "sam@example.com",
          phone: "555-1234",
          guardianOf: [{ player: { id: "player-1", name: "Ada" } }],
        },
      },
    ]);

    const directory = await listDirectory("team-1");

    expect(directory).toEqual([
      {
        userId: "user-1",
        role: "PARENT",
        name: "Sam",
        email: "sam@example.com",
        phone: "555-1234",
        players: [{ id: "player-1", name: "Ada" }],
      },
    ]);
  });

  it("shows a coach with no kids as an empty players list", async () => {
    findManyMemberships.mockResolvedValue([
      {
        userId: "user-2",
        role: "COACH",
        user: {
          name: "Coach Mel",
          email: "mel@example.com",
          phone: null,
          guardianOf: [],
        },
      },
    ]);

    const directory = await listDirectory("team-1");

    expect(directory[0].players).toEqual([]);
  });

  it("returns an empty array when the database throws", async () => {
    findManyMemberships.mockRejectedValue(new Error("connection refused"));

    await expect(listDirectory("team-1")).resolves.toEqual([]);
  });
});

describe("setMemberRole", () => {
  it("runs inside a Serializable transaction", async () => {
    findUniqueMembership.mockResolvedValue({ role: "PARENT" });

    await setMemberRole("team-1", "user-1", "COACH");

    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("scopes the lookup and the write to the given user and team", async () => {
    findUniqueMembership.mockResolvedValue({ role: "PARENT" });

    await setMemberRole("team-1", "user-1", "COACH");

    expect(findUniqueMembership).toHaveBeenCalledWith({
      where: { userId_teamId: { userId: "user-1", teamId: "team-1" } },
      select: { role: true },
    });
    expect(updateMembership).toHaveBeenCalledWith({
      where: { userId_teamId: { userId: "user-1", teamId: "team-1" } },
      data: { role: "COACH" },
    });
  });

  it("throws when no membership exists", async () => {
    findUniqueMembership.mockResolvedValue(null);

    await expect(setMemberRole("team-1", "user-1", "COACH")).rejects.toThrow();
    expect(updateMembership).not.toHaveBeenCalled();
  });

  it("allows demoting an owner when another owner remains", async () => {
    findUniqueMembership.mockResolvedValue({ role: "OWNER" });
    countMemberships.mockResolvedValue(1);

    await setMemberRole("team-1", "user-1", "COACH");

    // Counts OTHER owners, excluding the one being demoted — not the total,
    // so it can't be fooled by counting the very row it's about to change.
    expect(countMemberships).toHaveBeenCalledWith({
      where: { teamId: "team-1", role: "OWNER", userId: { not: "user-1" } },
    });
    expect(updateMembership).toHaveBeenCalled();
  });

  it("rejects demoting the team's only owner", async () => {
    findUniqueMembership.mockResolvedValue({ role: "OWNER" });
    countMemberships.mockResolvedValue(0);

    await expect(
      setMemberRole("team-1", "user-1", "COACH"),
    ).rejects.toThrow(LastOwnerError);
    expect(updateMembership).not.toHaveBeenCalled();
  });

  it("allows an owner-to-owner no-op change without checking for other owners", async () => {
    findUniqueMembership.mockResolvedValue({ role: "OWNER" });

    await setMemberRole("team-1", "user-1", "OWNER");

    expect(countMemberships).not.toHaveBeenCalled();
    expect(updateMembership).toHaveBeenCalled();
  });
});
