import { beforeEach, describe, expect, it, vi } from "vitest";

const loadTodaysReminderWork = vi.fn();
const claimReminder = vi.fn();
const releaseReminder = vi.fn();
const sendEmail = vi.fn();
const sendPushToUser = vi.fn();

vi.mock("@/lib/reminder-data", () => ({
  loadTodaysReminderWork: (...args: unknown[]) => loadTodaysReminderWork(...args),
  claimReminder: (...args: unknown[]) => claimReminder(...args),
  releaseReminder: (...args: unknown[]) => releaseReminder(...args),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));

vi.mock("@/lib/push", () => ({
  sendPushToUser: (...args: unknown[]) => sendPushToUser(...args),
}));

import { GET, maxDuration } from "./route";
import type { ReminderEvent } from "@/lib/reminders";

const SECRET = "cron-secret-value";

const ANNA = { userId: "user-anna", email: "anna@example.com", name: "Anna" };
const BEN = { userId: "user-ben", email: "ben@example.com", name: "Ben" };

function event(overrides: Partial<ReminderEvent> = {}): ReminderEvent {
  return {
    id: "evt-1",
    teamId: "team-1",
    teamName: "Sharks",
    type: "GAME",
    startsAt: new Date("2026-07-15T22:30:00Z"),
    location: "Riverside Field 2",
    opponent: "Hawks",
    notes: null,
    roster: [{ playerId: "player-1", playerName: "Jimmy", guardians: [ANNA] }],
    rsvps: [],
    ...overrides,
  };
}

function get(authorization: string | null = `Bearer ${SECRET}`) {
  const headers = new Headers();
  if (authorization !== null) {
    headers.set("authorization", authorization);
  }
  return GET(
    new Request("https://example.com/api/cron/reminders", { headers }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("AUTH_URL", "https://app.example.com");
  loadTodaysReminderWork.mockResolvedValue([]);
  claimReminder.mockResolvedValue("claimed");
  releaseReminder.mockResolvedValue(undefined);
  sendEmail.mockResolvedValue({ ok: true });
  sendPushToUser.mockResolvedValue({ delivered: 0, pruned: 0, failed: 0 });
});

describe("GET /api/cron/reminders — authorization", () => {
  it("401s with no Authorization header, without touching the database", async () => {
    const response = await get(null);

    expect(response.status).toBe(401);
    expect(loadTodaysReminderWork).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("401s on a wrong bearer token", async () => {
    expect((await get("Bearer wrong")).status).toBe(401);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("fails closed when CRON_SECRET is unset — an unconfigured deploy has no route", async () => {
    vi.stubEnv("CRON_SECRET", "");

    expect((await get(`Bearer ${SECRET}`)).status).toBe(401);
    expect(loadTodaysReminderWork).not.toHaveBeenCalled();
  });

  it("runs with the platform's bearer token", async () => {
    const response = await get();

    expect(response.status).toBe(200);
    expect(loadTodaysReminderWork).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/cron/reminders — sending", () => {
  it("asks for today's work as of now", async () => {
    await get();

    const [now] = loadTodaysReminderWork.mock.calls[0];
    expect(now).toBeInstanceOf(Date);
  });

  it("mails each guardian and reports the run", async () => {
    loadTodaysReminderWork.mockResolvedValue([
      event({
        roster: [
          { playerId: "player-1", playerName: "Jimmy", guardians: [ANNA] },
          { playerId: "player-2", playerName: "Sofia", guardians: [BEN] },
        ],
      }),
    ]);

    const response = await get();

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(await response.json()).toMatchObject({
      events: 1,
      candidates: 2,
      sent: 2,
      skipped: 0,
      failed: 0,
    });
  });

  it("sends a subject naming the team, the event and the local time", async () => {
    loadTodaysReminderWork.mockResolvedValue([event()]);

    await get();

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "anna@example.com",
        subject: "[Sharks] Today: Game vs Hawks, 5:30 PM",
      }),
    );
  });

  it("does nothing on a day with no events", async () => {
    const response = await get();

    expect(claimReminder).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ events: 0, sent: 0 });
  });
});

describe("GET /api/cron/reminders — duplicate protection", () => {
  it("claims each pair before sending it", async () => {
    loadTodaysReminderWork.mockResolvedValue([event()]);

    await get();

    expect(claimReminder).toHaveBeenCalledWith("evt-1", "user-anna");
    expect(claimReminder).toHaveBeenCalledBefore(sendEmail);
  });

  it("does not re-send a pair a previous run already claimed", async () => {
    loadTodaysReminderWork.mockResolvedValue([event()]);
    claimReminder.mockResolvedValue("already-sent");

    const response = await get();

    expect(sendEmail).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ sent: 0, skipped: 1 });
  });

  it("sends only the unsent half when a re-run finds a partial batch", async () => {
    loadTodaysReminderWork.mockResolvedValue([
      event({
        roster: [
          { playerId: "player-1", playerName: "Jimmy", guardians: [ANNA] },
          { playerId: "player-2", playerName: "Sofia", guardians: [BEN] },
        ],
      }),
    ]);
    claimReminder
      .mockResolvedValueOnce("already-sent")
      .mockResolvedValueOnce("claimed");

    const response = await get();

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "ben@example.com" }),
    );
    expect(await response.json()).toMatchObject({ sent: 1, skipped: 1 });
  });
});

describe("GET /api/cron/reminders — failure handling", () => {
  it("releases the claim when the send fails, so the next run retries", async () => {
    loadTodaysReminderWork.mockResolvedValue([event()]);
    sendEmail.mockResolvedValue({ ok: false, reason: "resend down" });

    const response = await get();

    expect(releaseReminder).toHaveBeenCalledWith("evt-1", "user-anna");
    expect(await response.json()).toMatchObject({ sent: 0, failed: 1 });
  });

  it("releases the claim when the send throws", async () => {
    loadTodaysReminderWork.mockResolvedValue([event()]);
    sendEmail.mockRejectedValue(new Error("network"));

    const response = await get();

    expect(releaseReminder).toHaveBeenCalledWith("evt-1", "user-anna");
    expect(await response.json()).toMatchObject({ failed: 1 });
  });

  it("keeps going after one bad mailbox", async () => {
    loadTodaysReminderWork.mockResolvedValue([
      event({
        roster: [
          { playerId: "player-1", playerName: "Jimmy", guardians: [ANNA] },
          { playerId: "player-2", playerName: "Sofia", guardians: [BEN] },
        ],
      }),
    ]);
    sendEmail
      .mockResolvedValueOnce({ ok: false, reason: "bounced" })
      .mockResolvedValueOnce({ ok: true });

    const response = await get();

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(await response.json()).toMatchObject({ sent: 1, failed: 1 });
  });

  it("does not release a claim it never took", async () => {
    loadTodaysReminderWork.mockResolvedValue([event()]);
    claimReminder.mockResolvedValue("already-sent");

    await get();

    expect(releaseReminder).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/reminders — push rides along", () => {
  beforeEach(() => {
    loadTodaysReminderWork.mockResolvedValue([event()]);
  });

  it("pushes after the email, with the same deep link", async () => {
    sendPushToUser.mockResolvedValue({ delivered: 1, pruned: 0, failed: 0 });

    const response = await get();

    expect(sendEmail).toHaveBeenCalledBefore(sendPushToUser);
    expect(sendPushToUser).toHaveBeenCalledWith("user-anna", {
      title: "[Sharks] Today: Game vs Hawks, 5:30 PM",
      body: "5:30 PM at Riverside Field 2",
      url: "https://app.example.com/t/team-1/schedule/evt-1",
    });
    expect(await response.json()).toMatchObject({ sent: 1, pushed: 1 });
  });

  it("counts devices reached, not people", async () => {
    sendPushToUser.mockResolvedValue({ delivered: 2, pruned: 1, failed: 0 });

    expect(await (await get()).json()).toMatchObject({ pushed: 2 });
  });

  it("omits the location from the body when there is none", async () => {
    loadTodaysReminderWork.mockResolvedValue([event({ location: null })]);

    await get();

    expect(sendPushToUser).toHaveBeenCalledWith(
      "user-anna",
      expect.objectContaining({ body: "5:30 PM" }),
    );
  });

  it("does not push for an email that failed", async () => {
    sendEmail.mockResolvedValue({ ok: false, reason: "bounced" });

    await get();

    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("does not push for a pair a previous run already handled", async () => {
    claimReminder.mockResolvedValue("already-sent");

    await get();

    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("keeps the delivered email when push throws — push never gates email", async () => {
    sendPushToUser.mockRejectedValue(new Error("vapid misconfigured"));

    const response = await get();

    expect(releaseReminder).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      sent: 1,
      failed: 0,
      pushed: 0,
    });
  });

  it("still sends email when push is unconfigured", async () => {
    sendPushToUser.mockResolvedValue({ delivered: 0, pruned: 0, failed: 0 });

    const response = await get();

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(await response.json()).toMatchObject({ sent: 1, pushed: 0 });
  });
});

describe("GET /api/cron/reminders — run limits", () => {
  it("keeps the send cap inside the route's own timeout", () => {
    // The coupling AGENTS.md calls out: cap x pacing must stay well under
    // maxDuration, or an oversized run times out half-finished.
    const MAX_SENDS_PER_RUN = 200;
    const MIN_SEND_INTERVAL_MS = 600;

    expect((MAX_SENDS_PER_RUN * MIN_SEND_INTERVAL_MS) / 1000).toBeLessThan(
      maxDuration,
    );
  });
});
