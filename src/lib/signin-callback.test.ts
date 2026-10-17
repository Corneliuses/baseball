import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueUser = vi.fn();
const findFirstUser = vi.fn();
const updateManyUsers = vi.fn();
const createUser = vi.fn();
const loadSignInContext = vi.fn();
const acceptInvitations = vi.fn();

vi.mock("./db", () => ({
  db: {
    user: {
      findUnique: (...args: unknown[]) => findUniqueUser(...args),
      findFirst: (...args: unknown[]) => findFirstUser(...args),
      updateMany: (...args: unknown[]) => updateManyUsers(...args),
      create: (...args: unknown[]) => createUser(...args),
    },
  },
}));

vi.mock("@/lib/invitations", () => ({
  loadSignInContext: (...args: unknown[]) => loadSignInContext(...args),
  acceptInvitations: (...args: unknown[]) => acceptInvitations(...args),
}));

import {
  completeSignIn,
  decideCallback,
  gateEmail,
  type CallbackClaims,
  type CallbackInput,
} from "./signin-callback";

const NOW = new Date("2026-10-17T12:00:00Z");
const LIVE_INVITATION = {
  expiresAt: new Date("2026-10-20T00:00:00Z"),
  acceptedAt: null,
};

const CLAIMS: CallbackClaims = {
  sub: "sub-sam",
  email: "Sam@Example.com",
  email_verified: true,
};

function input(overrides: Partial<CallbackInput> = {}): CallbackInput {
  return {
    claims: CLAIMS,
    userBySub: null,
    userByEmail: null,
    ownerEmail: "owner@example.com",
    invitations: [],
    hasMembership: false,
    now: NOW,
    ...overrides,
  };
}

describe("gateEmail", () => {
  it("is the linked row's email when there is one", () => {
    expect(
      gateEmail(CLAIMS, { id: "u1", email: "old@example.com" }),
    ).toBe("old@example.com");
  });

  it("is the normalized claim otherwise", () => {
    expect(gateEmail(CLAIMS, null)).toBe("sam@example.com");
  });
});

describe("decideCallback", () => {
  it("denies an unverified email before anything else, even a linked row", () => {
    expect(
      decideCallback(
        input({
          claims: { ...CLAIMS, email_verified: false },
          userBySub: { id: "u1", email: "sam@example.com" },
          hasMembership: true,
        }),
      ),
    ).toEqual({ kind: "deny", reason: "email-unverified" });
  });

  it("knows a linked row that the gate admits", () => {
    expect(
      decideCallback(
        input({
          userBySub: { id: "u1", email: "sam@example.com" },
          hasMembership: true,
        }),
      ),
    ).toEqual({ kind: "known", userId: "u1", email: "sam@example.com" });
  });

  it("denies a linked row the gate no longer admits (a removed member)", () => {
    expect(
      decideCallback(
        input({ userBySub: { id: "u1", email: "sam@example.com" } }),
      ),
    ).toEqual({ kind: "deny", reason: "no-invitation" });
  });

  it("lets sub win over a changed service email, gating on the row's own", () => {
    // The person changed their service address to one nobody invited; the
    // app still knows them as the owner address on the row.
    expect(
      decideCallback(
        input({
          claims: { ...CLAIMS, email: "new@example.com" },
          userBySub: { id: "u-owner", email: "owner@example.com" },
        }),
      ),
    ).toEqual({ kind: "known", userId: "u-owner", email: "owner@example.com" });
  });

  it("links an unlinked row found by email when the gate admits it", () => {
    expect(
      decideCallback(
        input({
          userByEmail: { id: "u2", email: "sam@example.com", authSub: null },
          invitations: [LIVE_INVITATION],
        }),
      ),
    ).toEqual({ kind: "link", userId: "u2", email: "sam@example.com" });
  });

  it("denies an unlinked row the gate refuses", () => {
    expect(
      decideCallback(
        input({
          userByEmail: { id: "u2", email: "sam@example.com", authSub: null },
        }),
      ),
    ).toEqual({ kind: "deny", reason: "no-invitation" });
  });

  it("refuses to re-link a row already linked to another sub", () => {
    // Someone proved an address whose app row belongs to a different service
    // account. Linking would hand them that family's teams.
    expect(
      decideCallback(
        input({
          userByEmail: {
            id: "u2",
            email: "sam@example.com",
            authSub: "sub-someone-else",
          },
          hasMembership: true,
        }),
      ),
    ).toEqual({ kind: "deny", reason: "account-conflict" });
  });

  it("treats a row already linked to this same sub as a link", () => {
    // Unreachable through the loader (userBySub would have found it), but the
    // pure table should not call a person a conflict with themselves.
    expect(
      decideCallback(
        input({
          userByEmail: { id: "u2", email: "sam@example.com", authSub: "sub-sam" },
          hasMembership: true,
        }),
      ),
    ).toEqual({ kind: "link", userId: "u2", email: "sam@example.com" });
  });

  it("creates a row for an invited address with none yet", () => {
    expect(
      decideCallback(input({ invitations: [LIVE_INVITATION] })),
    ).toEqual({ kind: "create", email: "sam@example.com" });
  });

  it("creates the owner's row on a fresh database", () => {
    expect(
      decideCallback(
        input({ claims: { ...CLAIMS, email: "Owner@Example.com" } }),
      ),
    ).toEqual({ kind: "create", email: "owner@example.com" });
  });

  it("denies an uninvited stranger", () => {
    expect(decideCallback(input())).toEqual({
      kind: "deny",
      reason: "no-invitation",
    });
  });

  it("does not count an expired invitation", () => {
    expect(
      decideCallback(
        input({
          invitations: [
            { expiresAt: new Date("2026-10-01T00:00:00Z"), acceptedAt: null },
          ],
        }),
      ),
    ).toEqual({ kind: "deny", reason: "no-invitation" });
  });
});

describe("completeSignIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("OWNER_EMAIL", "owner@example.com");
    findUniqueUser.mockResolvedValue(null);
    findFirstUser.mockResolvedValue(null);
    updateManyUsers.mockResolvedValue({ count: 1 });
    createUser.mockResolvedValue({ id: "u-new", email: "sam@example.com" });
    loadSignInContext.mockResolvedValue({ invitations: [], hasMembership: false });
    acceptInvitations.mockResolvedValue(0);
  });

  it("denies an unverified email without touching the database", async () => {
    await expect(
      completeSignIn({ ...CLAIMS, email_verified: false }, NOW),
    ).resolves.toEqual({ status: "denied", reason: "email-unverified" });
    expect(findUniqueUser).not.toHaveBeenCalled();
    expect(loadSignInContext).not.toHaveBeenCalled();
  });

  it("signs in a known row, gating on its own email and skipping the email lookup", async () => {
    findUniqueUser.mockResolvedValue({ id: "u1", email: "sam@old.example" });
    loadSignInContext.mockResolvedValue({ invitations: [], hasMembership: true });

    await expect(completeSignIn(CLAIMS, NOW)).resolves.toEqual({
      status: "signed-in",
      userId: "u1",
    });
    expect(findUniqueUser).toHaveBeenCalledWith({
      where: { authSub: "sub-sam" },
      select: { id: true, email: true },
    });
    expect(findFirstUser).not.toHaveBeenCalled();
    expect(loadSignInContext).toHaveBeenCalledWith("sam@old.example");
    expect(updateManyUsers).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
    expect(acceptInvitations).toHaveBeenCalledWith("u1", "sam@old.example", NOW);
  });

  it("looks a row up by email case-insensitively", async () => {
    await completeSignIn(CLAIMS, NOW);

    expect(findFirstUser).toHaveBeenCalledWith({
      where: { email: { equals: "sam@example.com", mode: "insensitive" } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        email: true,
        name: true,
        authSub: true,
        emailVerified: true,
      },
    });
    expect(loadSignInContext).toHaveBeenCalledWith("sam@example.com");
  });

  it("links an invitation-created row, stamping emailVerified", async () => {
    findFirstUser.mockResolvedValue({
      id: "u2",
      email: "Sam@Example.com",
      authSub: null,
      emailVerified: null,
    });
    loadSignInContext.mockResolvedValue({
      invitations: [LIVE_INVITATION],
      hasMembership: false,
    });

    await expect(completeSignIn(CLAIMS, NOW)).resolves.toEqual({
      status: "signed-in",
      userId: "u2",
    });
    expect(updateManyUsers).toHaveBeenCalledWith({
      where: { id: "u2", OR: [{ authSub: null }, { authSub: "sub-sam" }] },
      data: { authSub: "sub-sam", emailVerified: NOW },
    });
    // The row's own spelling, not the claim's: acceptInvitations matches
    // case-insensitively either way, but the row is the app's identity.
    expect(acceptInvitations).toHaveBeenCalledWith("u2", "Sam@Example.com", NOW);
  });

  it("keeps an existing emailVerified stamp when linking", async () => {
    const earlier = new Date("2026-05-01T00:00:00Z");
    findFirstUser.mockResolvedValue({
      id: "u2",
      email: "sam@example.com",
      authSub: null,
      emailVerified: earlier,
    });
    loadSignInContext.mockResolvedValue({ invitations: [], hasMembership: true });

    await completeSignIn(CLAIMS, NOW);

    expect(updateManyUsers).toHaveBeenCalledWith({
      where: { id: "u2", OR: [{ authSub: null }, { authSub: "sub-sam" }] },
      data: { authSub: "sub-sam" },
    });
  });

  it("fills a missing name from the claim when linking, never overwriting one", async () => {
    findFirstUser.mockResolvedValue({
      id: "u2",
      email: "sam@example.com",
      name: null,
      authSub: null,
      emailVerified: NOW,
    });
    loadSignInContext.mockResolvedValue({ invitations: [], hasMembership: true });

    await completeSignIn({ ...CLAIMS, name: "Sam Rivera" }, NOW);
    expect(updateManyUsers.mock.calls[0]?.[0].data).toEqual({
      authSub: "sub-sam",
      name: "Sam Rivera",
    });

    updateManyUsers.mockClear();
    findFirstUser.mockResolvedValue({
      id: "u2",
      email: "sam@example.com",
      name: "Samantha",
      authSub: null,
      emailVerified: NOW,
    });
    await completeSignIn({ ...CLAIMS, name: "Sam Rivera" }, NOW);
    expect(updateManyUsers.mock.calls[0]?.[0].data).toEqual({
      authSub: "sub-sam",
    });
  });

  it("fails rather than signing in when a concurrent login linked the row first", async () => {
    findFirstUser.mockResolvedValue({
      id: "u2",
      email: "sam@example.com",
      authSub: null,
      emailVerified: null,
    });
    loadSignInContext.mockResolvedValue({ invitations: [], hasMembership: true });
    updateManyUsers.mockResolvedValue({ count: 0 });

    await expect(completeSignIn(CLAIMS, NOW)).resolves.toEqual({
      status: "failed",
    });
    expect(acceptInvitations).not.toHaveBeenCalled();
  });

  it("creates a row for an invited coach who has none, with the Google name", async () => {
    loadSignInContext.mockResolvedValue({
      invitations: [LIVE_INVITATION],
      hasMembership: false,
    });

    await expect(
      completeSignIn({ ...CLAIMS, name: "Sam Rivera" }, NOW),
    ).resolves.toEqual({ status: "signed-in", userId: "u-new" });
    expect(createUser).toHaveBeenCalledWith({
      data: {
        email: "sam@example.com",
        emailVerified: NOW,
        authSub: "sub-sam",
        name: "Sam Rivera",
      },
      select: { id: true, email: true },
    });
    expect(acceptInvitations).toHaveBeenCalledWith("u-new", "sam@example.com", NOW);
  });

  it("creates without a name when the service has none", async () => {
    loadSignInContext.mockResolvedValue({
      invitations: [LIVE_INVITATION],
      hasMembership: false,
    });

    await completeSignIn(CLAIMS, NOW);

    expect(createUser.mock.calls[0]?.[0]).toMatchObject({
      data: { email: "sam@example.com" },
    });
    expect(createUser.mock.calls[0]?.[0].data).not.toHaveProperty("name");
  });

  it("surfaces a P2002 from two concurrent first logins as failed", async () => {
    loadSignInContext.mockResolvedValue({
      invitations: [LIVE_INVITATION],
      hasMembership: false,
    });
    createUser.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
        meta: { target: ["authSub"] },
      }),
    );

    await expect(completeSignIn(CLAIMS, NOW)).resolves.toEqual({
      status: "failed",
    });
    expect(acceptInvitations).not.toHaveBeenCalled();
  });

  it("denies a stranger without writing anything", async () => {
    await expect(completeSignIn(CLAIMS, NOW)).resolves.toEqual({
      status: "denied",
      reason: "no-invitation",
    });
    expect(createUser).not.toHaveBeenCalled();
    expect(updateManyUsers).not.toHaveBeenCalled();
    expect(acceptInvitations).not.toHaveBeenCalled();
  });

  it("denies an address whose row belongs to another service account", async () => {
    findFirstUser.mockResolvedValue({
      id: "u2",
      email: "sam@example.com",
      authSub: "sub-other",
      emailVerified: NOW,
    });
    loadSignInContext.mockResolvedValue({ invitations: [], hasMembership: true });

    await expect(completeSignIn(CLAIMS, NOW)).resolves.toEqual({
      status: "denied",
      reason: "account-conflict",
    });
    expect(updateManyUsers).not.toHaveBeenCalled();
  });

  it("admits the owner from OWNER_EMAIL", async () => {
    createUser.mockResolvedValue({ id: "u-owner", email: "owner@example.com" });

    await expect(
      completeSignIn({ ...CLAIMS, email: "owner@example.com" }, NOW),
    ).resolves.toEqual({ status: "signed-in", userId: "u-owner" });
  });

  it("fails closed when the gate's facts cannot be loaded", async () => {
    loadSignInContext.mockRejectedValue(new Error("database unreachable"));

    await expect(completeSignIn(CLAIMS, NOW)).resolves.toEqual({
      status: "failed",
    });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("still signs in when accepting invitations fails", async () => {
    findUniqueUser.mockResolvedValue({ id: "u1", email: "sam@example.com" });
    loadSignInContext.mockResolvedValue({
      invitations: [LIVE_INVITATION],
      hasMembership: false,
    });
    acceptInvitations.mockRejectedValue(new Error("transaction aborted"));

    await expect(completeSignIn(CLAIMS, NOW)).resolves.toEqual({
      status: "signed-in",
      userId: "u1",
    });
  });
});
