import { describe, expect, it, vi } from "vitest";
import type { Adapter } from "next-auth/adapters";

import { withSingleLiveCode } from "./auth-adapter";

function fakeAdapter(overrides: Partial<Adapter> = {}): Adapter {
  return {
    createVerificationToken: vi.fn(async (token) => token),
    ...overrides,
  } as Adapter;
}

const TOKEN = {
  identifier: "parent@example.com",
  token: "hashed",
  expires: new Date("2026-08-28T12:10:00Z"),
};

describe("withSingleLiveCode", () => {
  it("prunes the address's other codes before minting one", async () => {
    const order: string[] = [];
    const prune = vi.fn(async () => {
      order.push("prune");
    });
    const base = fakeAdapter({
      createVerificationToken: vi.fn(async (token) => {
        order.push("create");
        return token;
      }),
    });

    await withSingleLiveCode(base, prune).createVerificationToken?.(TOKEN);

    expect(prune).toHaveBeenCalledWith("parent@example.com");
    // Order is the whole point: pruning after the create would delete the
    // code that was just handed to the person.
    expect(order).toEqual(["prune", "create"]);
  });

  it("returns whatever the wrapped adapter returns", async () => {
    const wrapped = withSingleLiveCode(fakeAdapter(), async () => {});

    await expect(wrapped.createVerificationToken?.(TOKEN)).resolves.toEqual(
      TOKEN,
    );
  });

  // A prune failure means the database is unreachable, and the create is about
  // to hit it too. Failing loudly beats quietly leaving the extra live codes
  // this wrapper exists to remove.
  it("does not mint a code when the prune fails", async () => {
    const base = fakeAdapter();
    const wrapped = withSingleLiveCode(base, async () => {
      throw new Error("connection lost");
    });

    await expect(wrapped.createVerificationToken?.(TOKEN)).rejects.toThrow(
      "connection lost",
    );
    expect(base.createVerificationToken).not.toHaveBeenCalled();
  });

  it("leaves the rest of the adapter alone", async () => {
    const getUserByEmail = vi.fn();
    const base = fakeAdapter({ getUserByEmail });

    expect(withSingleLiveCode(base, async () => {}).getUserByEmail).toBe(
      getUserByEmail,
    );
  });

  it("passes an adapter that cannot mint tokens straight through", () => {
    const base = { getUserByEmail: vi.fn() } as unknown as Adapter;

    expect(withSingleLiveCode(base, async () => {})).toBe(base);
  });
});
