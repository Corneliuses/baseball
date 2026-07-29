import { describe, it, expect, vi, beforeEach } from "vitest";

const findManyInvitations = vi.fn();
const findUniqueInvitation = vi.fn();
const deleteManyInvitations = vi.fn();
const createInvitationRow = vi.fn();
const countMemberships = vi.fn();
const findUniqueMembership = vi.fn();
const upsertMembership = vi.fn();
const updateInvitation = vi.fn();
const upsertUser = vi.fn();
const upsertGuardianPlayer = vi.fn();
const deleteGuardianPlayer = vi.fn();
const transaction = vi.fn();

vi.mock("./db", () => ({
  db: {
    invitation: {
      findMany: (...args: unknown[]) => findManyInvitations(...args),
      findUnique: (...args: unknown[]) => findUniqueInvitation(...args),
      deleteMany: (...args: unknown[]) => deleteManyInvitations(...args),
      create: (...args: unknown[]) => createInvitationRow(...args),
      update: (...args: unknown[]) => updateInvitation(...args),
    },
    membership: {
      count: (...args: unknown[]) => countMemberships(...args),
      findUnique: (...args: unknown[]) => findUniqueMembership(...args),
      upsert: (...args: unknown[]) => upsertMembership(...args),
    },
    user: {
      upsert: (...args: unknown[]) => upsertUser(...args),
    },
    guardianPlayer: {
      upsert: (...args: unknown[]) => upsertGuardianPlayer(...args),
      delete: (...args: unknown[]) => deleteGuardianPlayer(...args),
    },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

import {
  acceptInvitations,
  createInvitation,
  getInvitationByToken,
  linkGuardian,
  listTeamInvitations,
  loadSignInContext,
  unlinkGuardian,
} from "./invitations";

const NOW = new Date("2026-04-01T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  findManyInvitations.mockResolvedValue([]);
  findUniqueInvitation.mockResolvedValue(null);
  deleteManyInvitations.mockReturnValue({ count: 0 });
  createInvitationRow.mockReturnValue({
    token: "generated-token",
    role: "PARENT",
    expiresAt: NOW,
  });
  countMemberships.mockResolvedValue(0);
  findUniqueMembership.mockResolvedValue(null);
  upsertMembership.mockReturnValue({ op: "upsert" });
  updateInvitation.mockReturnValue({ op: "update" });
  upsertUser.mockResolvedValue({ id: "user-1" });
  upsertGuardianPlayer.mockReturnValue({ op: "upsert-guardian" });
  deleteGuardianPlayer.mockResolvedValue({});
  // Mirrors real Prisma: $transaction([...]) resolves to the array of
  // results the calls inside it already produced.
  transaction.mockImplementation(async (arg: unknown) => arg);
});

describe("loadSignInContext", () => {
  it("matches the address case-insensitively", async () => {
    await loadSignInContext("Sam@Example.com");

    expect(findManyInvitations).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: "Sam@Example.com", mode: "insensitive" } },
      }),
    );
    expect(countMemberships).toHaveBeenCalledWith({
      where: {
        user: { email: { equals: "Sam@Example.com", mode: "insensitive" } },
      },
    });
  });

  it("trims the address before querying", async () => {
    await loadSignInContext("  sam@example.com  ");

    expect(findManyInvitations).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: "sam@example.com", mode: "insensitive" } },
      }),
    );
  });

  it("reports hasMembership false when the count is zero", async () => {
    const context = await loadSignInContext("sam@example.com");

    expect(context.hasMembership).toBe(false);
  });

  it("reports hasMembership true when the user is on any team", async () => {
    countMemberships.mockResolvedValue(2);

    const context = await loadSignInContext("sam@example.com");

    expect(context.hasMembership).toBe(true);
  });

  it("returns invitations in every state and lets the gate judge them", async () => {
    const rows = [
      { expiresAt: NOW, acceptedAt: null },
      { expiresAt: NOW, acceptedAt: NOW },
    ];
    findManyInvitations.mockResolvedValue(rows);

    const context = await loadSignInContext("sam@example.com");

    expect(context.invitations).toEqual(rows);
  });
});

describe("acceptInvitations", () => {
  it("selects only unaccepted, unexpired invitations", async () => {
    await acceptInvitations("user-1", "sam@example.com", NOW);

    expect(findManyInvitations).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          email: { equals: "sam@example.com", mode: "insensitive" },
          acceptedAt: null,
          expiresAt: { gt: NOW },
        },
      }),
    );
  });

  it("writes nothing when there is nothing pending", async () => {
    const consumed = await acceptInvitations("user-1", "sam@example.com", NOW);

    expect(consumed).toBe(0);
    expect(transaction).not.toHaveBeenCalled();
    expect(upsertMembership).not.toHaveBeenCalled();
    expect(updateInvitation).not.toHaveBeenCalled();
  });

  it("never modifies an existing membership — the upsert update is empty", async () => {
    findManyInvitations.mockResolvedValue([
      { id: "inv-1", teamId: "team-1", role: "COACH" },
    ]);

    await acceptInvitations("user-1", "sam@example.com", NOW);

    expect(upsertMembership).toHaveBeenCalledWith({
      where: { userId_teamId: { userId: "user-1", teamId: "team-1" } },
      update: {},
      create: { userId: "user-1", teamId: "team-1", role: "COACH" },
    });
  });

  it("marks each accepted invitation with the same timestamp", async () => {
    findManyInvitations.mockResolvedValue([
      { id: "inv-1", teamId: "team-1", role: "PARENT" },
    ]);

    await acceptInvitations("user-1", "sam@example.com", NOW);

    expect(updateInvitation).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { acceptedAt: NOW },
    });
  });

  it("accepts invitations to several teams in one transaction", async () => {
    findManyInvitations.mockResolvedValue([
      { id: "inv-1", teamId: "team-1", role: "PARENT" },
      { id: "inv-2", teamId: "team-2", role: "COACH" },
    ]);

    const consumed = await acceptInvitations("user-1", "sam@example.com", NOW);

    expect(consumed).toBe(2);
    expect(upsertMembership).toHaveBeenCalledTimes(2);
    expect(updateInvitation).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0][0]).toHaveLength(4);
  });

  it("carries each invitation's own role onto its team", async () => {
    findManyInvitations.mockResolvedValue([
      { id: "inv-1", teamId: "team-1", role: "PARENT" },
      { id: "inv-2", teamId: "team-2", role: "COACH" },
    ]);

    await acceptInvitations("user-1", "sam@example.com", NOW);

    expect(upsertMembership).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        create: { userId: "user-1", teamId: "team-1", role: "PARENT" },
      }),
    );
    expect(upsertMembership).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        create: { userId: "user-1", teamId: "team-2", role: "COACH" },
      }),
    );
  });
});

describe("createInvitation", () => {
  it("normalizes the email before writing", async () => {
    await createInvitation(
      { teamId: "team-1", email: "Sam@Example.com", role: "PARENT" },
      NOW,
    );

    expect(deleteManyInvitations).toHaveBeenCalledWith({
      where: { teamId: "team-1", email: "sam@example.com", acceptedAt: null },
    });
    expect(createInvitationRow).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          teamId: "team-1",
          email: "sam@example.com",
          role: "PARENT",
        }),
      }),
    );
  });

  it("deletes unaccepted invitations for the address before creating the new one, in one transaction", async () => {
    await createInvitation(
      { teamId: "team-1", email: "sam@example.com", role: "PARENT" },
      NOW,
    );

    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("sets expiresAt using the invitation TTL from now", async () => {
    await createInvitation(
      { teamId: "team-1", email: "sam@example.com", role: "PARENT" },
      NOW,
    );

    const call = createInvitationRow.mock.calls[0][0];
    const expiresAt = call.data.expiresAt as Date;
    expect(expiresAt.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("returns the created invitation's token, role, and expiry", async () => {
    createInvitationRow.mockReturnValue({
      token: "abc123",
      role: "COACH",
      expiresAt: NOW,
    });

    const created = await createInvitation(
      { teamId: "team-1", email: "sam@example.com", role: "COACH" },
      NOW,
    );

    expect(created).toEqual({ token: "abc123", role: "COACH", expiresAt: NOW });
  });
});

describe("getInvitationByToken", () => {
  it("looks up by token and flattens the team name", async () => {
    findUniqueInvitation.mockResolvedValue({
      teamId: "team-1",
      email: "sam@example.com",
      role: "PARENT",
      expiresAt: NOW,
      acceptedAt: null,
      team: { name: "Cubs" },
    });

    const invitation = await getInvitationByToken("tok-1");

    expect(findUniqueInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token: "tok-1" } }),
    );
    expect(invitation).toEqual({
      teamId: "team-1",
      teamName: "Cubs",
      email: "sam@example.com",
      role: "PARENT",
      expiresAt: NOW,
      acceptedAt: null,
    });
  });

  it("returns null for an unknown token", async () => {
    findUniqueInvitation.mockResolvedValue(null);

    await expect(getInvitationByToken("unknown")).resolves.toBeNull();
  });

  // /invite/[token] renders "this invitation isn't valid" on null. Swallowing
  // the error would send an invited parent back to their coach for a
  // replacement link that would fail identically.
  it("lets a database error propagate rather than reporting the token as unknown", async () => {
    findUniqueInvitation.mockRejectedValue(new Error("connection refused"));

    await expect(getInvitationByToken("tok-1")).rejects.toThrow(
      "connection refused",
    );
  });
});

describe("listTeamInvitations", () => {
  it("scopes the query to the team", async () => {
    findManyInvitations.mockResolvedValue([]);

    await listTeamInvitations("team-1");

    expect(findManyInvitations).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: "team-1" } }),
    );
  });

  it("returns an empty array when the database throws", async () => {
    findManyInvitations.mockRejectedValue(new Error("connection refused"));

    await expect(listTeamInvitations("team-1")).resolves.toEqual([]);
  });
});

describe("linkGuardian", () => {
  it("upserts the User by normalized email, never overwriting an existing name", async () => {
    await linkGuardian(
      { teamId: "team-1", playerId: "player-1", email: "Sam@Example.com" },
      NOW,
    );

    expect(upsertUser).toHaveBeenCalledWith({
      where: { email: "sam@example.com" },
      update: {},
      create: { email: "sam@example.com", name: null },
      select: { id: true },
    });
  });

  it("creates the GuardianPlayer link and the Membership in one transaction, never modifying an existing membership", async () => {
    upsertUser.mockResolvedValue({ id: "user-1" });

    await linkGuardian(
      { teamId: "team-1", playerId: "player-1", email: "sam@example.com" },
      NOW,
    );

    expect(upsertGuardianPlayer).toHaveBeenCalledWith({
      where: { userId_playerId: { userId: "user-1", playerId: "player-1" } },
      update: {},
      create: { userId: "user-1", playerId: "player-1" },
    });
    expect(upsertMembership).toHaveBeenCalledWith({
      where: { userId_teamId: { userId: "user-1", teamId: "team-1" } },
      update: {},
      create: { userId: "user-1", teamId: "team-1", role: "PARENT" },
    });
  });

  it("creates an invitation and reports membershipCreated: true for a brand-new guardian", async () => {
    upsertUser.mockResolvedValue({ id: "user-1" });
    findUniqueMembership.mockResolvedValue(null);
    createInvitationRow.mockReturnValue({
      token: "tok-1",
      role: "PARENT",
      expiresAt: NOW,
    });

    const result = await linkGuardian(
      { teamId: "team-1", playerId: "player-1", email: "sam@example.com" },
      NOW,
    );

    expect(result.membershipCreated).toBe(true);
    expect(result.invitation).toEqual({
      token: "tok-1",
      role: "PARENT",
      expiresAt: NOW,
    });
  });

  it("creates no invitation and reports membershipCreated: false for an already-member guardian", async () => {
    upsertUser.mockResolvedValue({ id: "user-1" });
    findUniqueMembership.mockResolvedValue({ userId: "user-1" });

    const result = await linkGuardian(
      { teamId: "team-1", playerId: "player-2", email: "sam@example.com" },
      NOW,
    );

    expect(result.membershipCreated).toBe(false);
    expect(result.invitation).toBeNull();
    expect(deleteManyInvitations).not.toHaveBeenCalled();
    expect(createInvitationRow).not.toHaveBeenCalled();
  });
});

describe("unlinkGuardian", () => {
  it("deletes only the GuardianPlayer row, scoped to both ids", async () => {
    await unlinkGuardian("player-1", "user-1");

    expect(deleteGuardianPlayer).toHaveBeenCalledWith({
      where: { userId_playerId: { userId: "user-1", playerId: "player-1" } },
    });
  });
});
