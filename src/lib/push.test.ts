import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const deleteMany = vi.fn();
const sendNotification = vi.fn();
const setVapidDetails = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    pushSubscription: {
      findMany: (...args: unknown[]) => findMany(...args),
      deleteMany: (...args: unknown[]) => deleteMany(...args),
    },
  },
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: (...args: unknown[]) => setVapidDetails(...args),
    sendNotification: (...args: unknown[]) => sendNotification(...args),
  },
}));

import { readVapidConfig, sendPushToUser } from "@/lib/push";

const PAYLOAD = {
  title: "Today: Game vs Hawks",
  body: "5:30 PM at Riverside Field 2",
  url: "https://app.example.com/t/team-1/schedule/evt-1",
};

function subscription(id: string, endpoint = `https://push.example.com/${id}`) {
  return { id, endpoint, p256dh: "key", auth: "auth" };
}

/// A web-push failure carries the HTTP status on `statusCode`.
function webPushError(statusCode: number) {
  return Object.assign(new Error(`push failed: ${statusCode}`), { statusCode });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("VAPID_PUBLIC_KEY", "public-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "private-key");
  vi.stubEnv("VAPID_SUBJECT", "mailto:coach@example.com");
  findMany.mockResolvedValue([subscription("sub-1")]);
  deleteMany.mockResolvedValue({ count: 0 });
  sendNotification.mockResolvedValue({ statusCode: 201 });
});

describe("readVapidConfig", () => {
  it("reads the trio from the environment", () => {
    expect(readVapidConfig()).toEqual({
      publicKey: "public-key",
      privateKey: "private-key",
      subject: "mailto:coach@example.com",
    });
  });

  it("is null when any part is missing — unconfigured is a normal state", () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    expect(readVapidConfig()).toBeNull();
  });
});

describe("sendPushToUser", () => {
  it("sends the payload as JSON to each registered device", async () => {
    findMany.mockResolvedValue([subscription("sub-1"), subscription("sub-2")]);

    const result = await sendPushToUser("user-1", PAYLOAD);

    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification).toHaveBeenCalledWith(
      {
        endpoint: "https://push.example.com/sub-1",
        keys: { p256dh: "key", auth: "auth" },
      },
      JSON.stringify(PAYLOAD),
    );
    expect(result).toEqual({ delivered: 2, pruned: 0, failed: 0 });
  });

  it("scopes the subscription read to the user", async () => {
    await sendPushToUser("user-1", PAYLOAD);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } }),
    );
  });

  it("does nothing when push is not configured", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "");

    const result = await sendPushToUser("user-1", PAYLOAD);

    expect(findMany).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
    expect(result).toEqual({ delivered: 0, pruned: 0, failed: 0 });
  });

  it("does nothing for a guardian who never opted in", async () => {
    findMany.mockResolvedValue([]);

    const result = await sendPushToUser("user-1", PAYLOAD);

    expect(sendNotification).not.toHaveBeenCalled();
    expect(result).toEqual({ delivered: 0, pruned: 0, failed: 0 });
  });

  it("prunes a subscription the push service reports as gone", async () => {
    sendNotification.mockRejectedValue(webPushError(410));

    const result = await sendPushToUser("user-1", PAYLOAD);

    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["sub-1"] } } });
    expect(result).toEqual({ delivered: 0, pruned: 1, failed: 0 });
  });

  it("prunes on 404 as well as 410", async () => {
    sendNotification.mockRejectedValue(webPushError(404));

    expect((await sendPushToUser("user-1", PAYLOAD)).pruned).toBe(1);
  });

  it("keeps a subscription that failed transiently", async () => {
    sendNotification.mockRejectedValue(webPushError(429));

    const result = await sendPushToUser("user-1", PAYLOAD);

    expect(deleteMany).not.toHaveBeenCalled();
    expect(result).toEqual({ delivered: 0, pruned: 0, failed: 1 });
  });

  it("prunes only the dead device of a two-device user", async () => {
    findMany.mockResolvedValue([subscription("sub-1"), subscription("sub-2")]);
    sendNotification
      .mockRejectedValueOnce(webPushError(410))
      .mockResolvedValueOnce({ statusCode: 201 });

    const result = await sendPushToUser("user-1", PAYLOAD);

    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["sub-1"] } } });
    expect(result).toEqual({ delivered: 1, pruned: 1, failed: 0 });
  });

  it("never throws when the subscription read fails", async () => {
    findMany.mockRejectedValue(new Error("database down"));

    await expect(sendPushToUser("user-1", PAYLOAD)).resolves.toEqual({
      delivered: 0,
      pruned: 0,
      failed: 0,
    });
  });

  it("never throws when pruning fails", async () => {
    sendNotification.mockRejectedValue(webPushError(410));
    deleteMany.mockRejectedValue(new Error("database down"));

    await expect(sendPushToUser("user-1", PAYLOAD)).resolves.toMatchObject({
      pruned: 1,
    });
  });

  it("configures VAPID from the environment before sending", async () => {
    await sendPushToUser("user-1", PAYLOAD);

    expect(setVapidDetails).toHaveBeenCalledWith(
      "mailto:coach@example.com",
      "public-key",
      "private-key",
    );
  });
});
