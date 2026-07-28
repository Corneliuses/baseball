import { describe, it, expect, vi, beforeEach } from "vitest";

const findManyInvitations = vi.fn();
const countMemberships = vi.fn();
const upsertMembership = vi.fn();
const updateInvitation = vi.fn();
const transaction = vi.fn();

vi.mock("./db", () => ({
  db: {
    invitation: {
      findMany: (...args: unknown[]) => findManyInvitations(...args),
      update: (...args: unknown[]) => updateInvitation(...args),
    },
    membership: {
      count: (...args: unknown[]) => countMemberships(...args),
      upsert: (...args: unknown[]) => upsertMembership(...args),
    },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

import { acceptInvitations, loadSignInContext } from "./invitations";

const NOW = new Date("2026-04-01T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  findManyInvitations.mockResolvedValue([]);
  countMemberships.mockResolvedValue(0);
  upsertMembership.mockReturnValue({ op: "upsert" });
  updateInvitation.mockReturnValue({ op: "update" });
  transaction.mockResolvedValue([]);
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
