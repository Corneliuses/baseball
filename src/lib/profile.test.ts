import { describe, it, expect, vi, beforeEach } from "vitest";

const findUniqueUser = vi.fn();
const updateUser = vi.fn();

vi.mock("./db", () => ({
  db: {
    user: {
      findUnique: (...args: unknown[]) => findUniqueUser(...args),
      update: (...args: unknown[]) => updateUser(...args),
    },
  },
}));

import { getProfile, updateProfile } from "./profile";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getProfile", () => {
  it("reads only the caller's own row, and only profile columns", async () => {
    findUniqueUser.mockResolvedValue({
      name: "Sam",
      email: "sam@example.com",
      phone: "555-1234",
    });

    const profile = await getProfile("user-1");

    expect(findUniqueUser).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { name: true, email: true, phone: true },
    });
    expect(profile).toEqual({
      name: "Sam",
      email: "sam@example.com",
      phone: "555-1234",
    });
  });

  // Unlike the list reads in teams.ts and memberships.ts, this one does not
  // swallow errors: a blank phone field would read as "no number on file",
  // which is the opposite of what an outage means.
  it("lets a database error propagate rather than reporting an empty profile", async () => {
    findUniqueUser.mockRejectedValue(new Error("connection lost"));

    await expect(getProfile("user-1")).rejects.toThrow("connection lost");
  });
});

describe("updateProfile", () => {
  it("writes name and phone to the given user", async () => {
    updateUser.mockResolvedValue({});

    await updateProfile("user-1", { name: "Sam", phone: "555-1234" });

    expect(updateUser).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { name: "Sam", phone: "555-1234" },
    });
  });

  it("clears both fields when handed nulls", async () => {
    updateUser.mockResolvedValue({});

    await updateProfile("user-1", { name: null, phone: null });

    expect(updateUser).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { name: null, phone: null },
    });
  });

  it("never writes email", async () => {
    updateUser.mockResolvedValue({});

    await updateProfile("user-1", { name: "Sam", phone: null });

    const [{ data }] = updateUser.mock.calls[0] as [{ data: object }];
    expect(data).not.toHaveProperty("email");
  });
});
