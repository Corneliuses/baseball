import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const upsert = vi.fn();
const deleteMany = vi.fn();

vi.mock("@/lib/session", () => ({
  getCurrentUser: () => getCurrentUser(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    pushSubscription: {
      upsert: (...args: unknown[]) => upsert(...args),
      deleteMany: (...args: unknown[]) => deleteMany(...args),
    },
  },
}));

import { DELETE, POST } from "./route";

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123";
const SUBSCRIPTION = {
  endpoint: ENDPOINT,
  keys: { p256dh: "public-bytes", auth: "auth-bytes" },
};

function post(body: unknown) {
  return POST(
    new Request("https://example.com/api/push/subscription", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function del(body: unknown) {
  return DELETE(
    new Request("https://example.com/api/push/subscription", {
      method: "DELETE",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({
    id: "user-1",
    email: "anna@example.com",
    name: "Anna",
  });
  upsert.mockResolvedValue({ id: "sub-1" });
  deleteMany.mockResolvedValue({ count: 1 });
});

describe("POST /api/push/subscription", () => {
  it("401s a signed-out caller without writing", async () => {
    getCurrentUser.mockResolvedValue(null);

    expect((await post(SUBSCRIPTION)).status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("stores the subscription against the session's user", async () => {
    const response = await post(SUBSCRIPTION);

    expect(response.status).toBe(201);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endpoint: ENDPOINT },
        create: {
          userId: "user-1",
          endpoint: ENDPOINT,
          p256dh: "public-bytes",
          auth: "auth-bytes",
        },
      }),
    );
  });

  it("moves ownership when a shared phone re-subscribes as someone else", async () => {
    await post(SUBSCRIPTION);

    const [args] = upsert.mock.calls[0];
    expect(args.update).toMatchObject({ userId: "user-1" });
  });

  it("400s a body that is not JSON", async () => {
    expect((await post("not json at all")).status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("400s a subscription that fails validation", async () => {
    const response = await post({ ...SUBSCRIPTION, endpoint: "http://x.test" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid-subscription" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("500s a failed write rather than reporting success", async () => {
    upsert.mockRejectedValue(new Error("database down"));

    expect((await post(SUBSCRIPTION)).status).toBe(500);
  });
});

describe("DELETE /api/push/subscription", () => {
  it("401s a signed-out caller without deleting", async () => {
    getCurrentUser.mockResolvedValue(null);

    expect((await del({ endpoint: ENDPOINT })).status).toBe(401);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("scopes the delete to the caller, so an endpoint alone is not a key", async () => {
    const response = await del({ endpoint: ENDPOINT });

    expect(response.status).toBe(200);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { endpoint: ENDPOINT, userId: "user-1" },
    });
  });

  it("400s a missing or non-string endpoint", async () => {
    expect((await del({})).status).toBe(400);
    expect((await del({ endpoint: 42 })).status).toBe(400);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("succeeds when the row is already gone — pruning may have won the race", async () => {
    deleteMany.mockResolvedValue({ count: 0 });

    expect((await del({ endpoint: ENDPOINT })).status).toBe(200);
  });

  it("500s a failed delete", async () => {
    deleteMany.mockRejectedValue(new Error("database down"));

    expect((await del({ endpoint: ENDPOINT })).status).toBe(500);
  });
});
