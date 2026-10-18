import { describe, it, expect, vi, beforeEach } from "vitest";

const createSession = vi.fn();
const findUniqueSession = vi.fn();
const deleteSession = vi.fn();

vi.mock("./db", () => ({
  db: {
    session: {
      create: (...args: unknown[]) => createSession(...args),
      findUnique: (...args: unknown[]) => findUniqueSession(...args),
      delete: (...args: unknown[]) => deleteSession(...args),
    },
  },
}));

import {
  SESSION_MAX_AGE_SECONDS,
  createUserSession,
  deleteUserSession,
  findLiveSession,
} from "./sessions";

const NOW = new Date("2026-04-01T12:00:00Z");
const USER = { id: "user-1", email: "pat@example.com", name: "Pat" };

beforeEach(() => {
  vi.clearAllMocks();
  createSession.mockImplementation(
    async ({ data }: { data: { sessionToken: string; expires: Date } }) => ({
      sessionToken: data.sessionToken,
      expires: data.expires,
    }),
  );
});

describe("createUserSession", () => {
  it("writes a random token expiring after the max age, with no id token", async () => {
    const session = await createUserSession("user-1", NOW);

    const { data } = createSession.mock.calls[0][0];
    expect(data.userId).toBe("user-1");
    expect(data.sessionToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(data).not.toHaveProperty("idToken");
    expect(session.expires.getTime()).toBe(
      NOW.getTime() + SESSION_MAX_AGE_SECONDS * 1000,
    );
  });

  it("stores the id token when one is given", async () => {
    await createUserSession("user-1", NOW, { idToken: "id.tok.en" });

    expect(createSession.mock.calls[0][0].data.idToken).toBe("id.tok.en");
  });

  it("never reuses a token", async () => {
    const a = await createUserSession("user-1", NOW);
    const b = await createUserSession("user-1", NOW);
    expect(a.sessionToken).not.toBe(b.sessionToken);
  });
});

describe("findLiveSession", () => {
  it("returns the row's user while it is live", async () => {
    findUniqueSession.mockResolvedValue({
      expires: new Date(NOW.getTime() + 1),
      user: USER,
    });

    await expect(findLiveSession("tok", NOW)).resolves.toEqual(USER);
    expect(findUniqueSession.mock.calls[0][0].where).toEqual({
      sessionToken: "tok",
    });
  });

  it("is null for an unknown token", async () => {
    findUniqueSession.mockResolvedValue(null);
    await expect(findLiveSession("tok", NOW)).resolves.toBeNull();
  });

  // Strict, as @auth/core compares it: dead at the expiry instant.
  it("is null at and after the expiry instant", async () => {
    findUniqueSession.mockResolvedValue({ expires: NOW, user: USER });
    await expect(findLiveSession("tok", NOW)).resolves.toBeNull();

    findUniqueSession.mockResolvedValue({
      expires: new Date(NOW.getTime() - 1),
      user: USER,
    });
    await expect(findLiveSession("tok", NOW)).resolves.toBeNull();
  });

  it("does not delete or extend an expired row", async () => {
    findUniqueSession.mockResolvedValue({ expires: NOW, user: USER });
    await findLiveSession("tok", NOW);
    expect(deleteSession).not.toHaveBeenCalled();
  });
});

describe("deleteUserSession", () => {
  it("deletes the row and returns its id token", async () => {
    deleteSession.mockResolvedValue({ idToken: "id.tok.en" });

    await expect(deleteUserSession("tok")).resolves.toEqual({
      idToken: "id.tok.en",
    });
    expect(deleteSession.mock.calls[0][0].where).toEqual({
      sessionToken: "tok",
    });
  });

  it("returns a null id token for a row that never had one", async () => {
    deleteSession.mockResolvedValue({ idToken: null });
    await expect(deleteUserSession("tok")).resolves.toEqual({ idToken: null });
  });

  // A double-tapped sign-out, or a row already swept.
  it("is null, not an error, when the row is already gone", async () => {
    deleteSession.mockRejectedValue(
      Object.assign(new Error("not found"), { code: "P2025" }),
    );
    await expect(deleteUserSession("tok")).resolves.toBeNull();
  });

  it("rethrows any other failure", async () => {
    deleteSession.mockRejectedValue(new Error("connection reset"));
    await expect(deleteUserSession("tok")).rejects.toThrow("connection reset");
  });
});
