import { describe, expect, it, vi, beforeEach } from "vitest";

const findUniqueTeam = vi.fn();
const getCurrentUser = vi.fn();

vi.mock("./db", () => ({
  db: {
    team: {
      findUnique: (...args: unknown[]) => findUniqueTeam(...args),
    },
  },
}));

vi.mock("./session", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUser(...args),
}));

import { checkTeamAccess, requireTeamAccess, TeamAccessError } from "@/lib/team-access";

const ACTIVE = null;
const ARCHIVED = new Date("2024-09-01");

describe("checkTeamAccess", () => {
  it("rejects a caller with no membership", () => {
    expect(() =>
      checkTeamAccess({ role: null, archivedAt: ACTIVE, intent: "read" }),
    ).toThrow(TeamAccessError);
  });

  it("rejects a parent attempting a coach-level action", () => {
    expect(() =>
      checkTeamAccess({
        role: "PARENT",
        archivedAt: ACTIVE,
        intent: "write",
        minRole: "COACH",
      }),
    ).toThrow(/Requires COACH/);
  });

  it("allows a coach to write on an active team", () => {
    expect(
      checkTeamAccess({
        role: "COACH",
        archivedAt: ACTIVE,
        intent: "write",
        minRole: "COACH",
      }),
    ).toBe("COACH");
  });

  it("allows reading an archived team", () => {
    expect(
      checkTeamAccess({ role: "PARENT", archivedAt: ARCHIVED, intent: "read" }),
    ).toBe("PARENT");
  });

  it("rejects writes to an archived team even for the owner", () => {
    expect(() =>
      checkTeamAccess({
        role: "OWNER",
        archivedAt: ARCHIVED,
        intent: "write",
        minRole: "OWNER",
      }),
    ).toThrow(/archived/);
  });

  it("checks role before archived status, so the error names the real problem", () => {
    try {
      checkTeamAccess({
        role: "PARENT",
        archivedAt: ARCHIVED,
        intent: "write",
        minRole: "COACH",
      });
      expect.unreachable();
    } catch (error) {
      expect((error as TeamAccessError).reason).toBe("insufficient-role");
    }
  });
});

describe("requireTeamAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "user-1", email: "sam@example.com", name: "Sam" });
    findUniqueTeam.mockResolvedValue({
      archivedAt: ACTIVE,
      memberships: [{ role: "PARENT" }],
    });
  });

  it("rejects when no one is signed in, without querying the team", async () => {
    getCurrentUser.mockResolvedValue(null);

    await expect(
      requireTeamAccess("team-1", { intent: "read" }),
    ).rejects.toThrow(TeamAccessError);
    expect(findUniqueTeam).not.toHaveBeenCalled();
  });

  it("rejects when the team does not exist", async () => {
    findUniqueTeam.mockResolvedValue(null);

    try {
      await requireTeamAccess("team-1", { intent: "read" });
      expect.unreachable();
    } catch (error) {
      expect((error as TeamAccessError).reason).toBe("no-membership");
    }
  });

  it("rejects when the caller holds no membership on this team", async () => {
    findUniqueTeam.mockResolvedValue({ archivedAt: ACTIVE, memberships: [] });

    try {
      await requireTeamAccess("team-1", { intent: "read" });
      expect.unreachable();
    } catch (error) {
      expect((error as TeamAccessError).reason).toBe("no-membership");
    }
  });

  it("rejects a role below minRole", async () => {
    findUniqueTeam.mockResolvedValue({
      archivedAt: ACTIVE,
      memberships: [{ role: "PARENT" }],
    });

    try {
      await requireTeamAccess("team-1", { intent: "write", minRole: "COACH" });
      expect.unreachable();
    } catch (error) {
      expect((error as TeamAccessError).reason).toBe("insufficient-role");
    }
  });

  it("rejects a write on an archived team", async () => {
    findUniqueTeam.mockResolvedValue({
      archivedAt: ARCHIVED,
      memberships: [{ role: "OWNER" }],
    });

    try {
      await requireTeamAccess("team-1", { intent: "write", minRole: "OWNER" });
      expect.unreachable();
    } catch (error) {
      expect((error as TeamAccessError).reason).toBe("archived");
    }
  });

  it("allows a read on an archived team", async () => {
    findUniqueTeam.mockResolvedValue({
      archivedAt: ARCHIVED,
      memberships: [{ role: "PARENT" }],
    });

    await expect(
      requireTeamAccess("team-1", { intent: "read" }),
    ).resolves.toEqual({ role: "PARENT", userId: "user-1" });
  });

  it("allows the unarchive shape — read intent, OWNER minRole — on an archived team", async () => {
    findUniqueTeam.mockResolvedValue({
      archivedAt: ARCHIVED,
      memberships: [{ role: "OWNER" }],
    });

    await expect(
      requireTeamAccess("team-1", { intent: "read", minRole: "OWNER" }),
    ).resolves.toEqual({ role: "OWNER", userId: "user-1" });
  });

  it("returns the caller's role and id on success", async () => {
    findUniqueTeam.mockResolvedValue({
      archivedAt: ACTIVE,
      memberships: [{ role: "COACH" }],
    });

    await expect(
      requireTeamAccess("team-1", { intent: "write", minRole: "COACH" }),
    ).resolves.toEqual({ role: "COACH", userId: "user-1" });
  });

  it("resolves role and archived status in a single query, filtered to the caller", async () => {
    await requireTeamAccess("team-1", { intent: "read" });

    expect(findUniqueTeam).toHaveBeenCalledTimes(1);
    expect(findUniqueTeam).toHaveBeenCalledWith({
      where: { id: "team-1" },
      select: {
        archivedAt: true,
        memberships: {
          where: { userId: "user-1" },
          select: { role: true },
        },
      },
    });
  });

  it("lets a database error propagate rather than converting it to a denial", async () => {
    findUniqueTeam.mockRejectedValue(new Error("connection refused"));

    await expect(
      requireTeamAccess("team-1", { intent: "read" }),
    ).rejects.toThrow("connection refused");
  });
});
