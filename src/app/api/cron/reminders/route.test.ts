import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

/// The loader returns the day's events plus whether it had to truncate them.
function work(events: ReminderEvent[], truncated = false) {
  return { events, truncated };
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
  loadTodaysReminderWork.mockResolvedValue(work([]));
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
    loadTodaysReminderWork.mockResolvedValue(
      work([
        event({
          roster: [
            { playerId: "player-1", playerName: "Jimmy", guardians: [ANNA] },
            { playerId: "player-2", playerName: "Sofia", guardians: [BEN] },
          ],
        }),
      ]),
    );

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
    loadTodaysReminderWork.mockResolvedValue(work([event()]));

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
    loadTodaysReminderWork.mockResolvedValue(work([event()]));

    await get();

    expect(claimReminder).toHaveBeenCalledWith("evt-1", "user-anna");
    expect(claimReminder).toHaveBeenCalledBefore(sendEmail);
  });

  it("does not re-send a pair a previous run already claimed", async () => {
    loadTodaysReminderWork.mockResolvedValue(work([event()]));
    claimReminder.mockResolvedValue("already-sent");

    const response = await get();

    expect(sendEmail).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ sent: 0, skipped: 1 });
  });

  it("sends only the unsent half when a re-run finds a partial batch", async () => {
    loadTodaysReminderWork.mockResolvedValue(
      work([
        event({
          roster: [
            { playerId: "player-1", playerName: "Jimmy", guardians: [ANNA] },
            { playerId: "player-2", playerName: "Sofia", guardians: [BEN] },
          ],
        }),
      ]),
    );
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
    loadTodaysReminderWork.mockResolvedValue(work([event()]));
    sendEmail.mockResolvedValue({ ok: false, reason: "resend down" });

    const response = await get();

    expect(releaseReminder).toHaveBeenCalledWith("evt-1", "user-anna");
    expect(await response.json()).toMatchObject({ sent: 0, failed: 1 });
  });

  it("releases the claim when the send throws", async () => {
    loadTodaysReminderWork.mockResolvedValue(work([event()]));
    sendEmail.mockRejectedValue(new Error("network"));

    const response = await get();

    expect(releaseReminder).toHaveBeenCalledWith("evt-1", "user-anna");
    expect(await response.json()).toMatchObject({ failed: 1 });
  });

  it("keeps going after one bad mailbox", async () => {
    loadTodaysReminderWork.mockResolvedValue(
      work([
        event({
          roster: [
            { playerId: "player-1", playerName: "Jimmy", guardians: [ANNA] },
            { playerId: "player-2", playerName: "Sofia", guardians: [BEN] },
          ],
        }),
      ]),
    );
    sendEmail
      .mockResolvedValueOnce({ ok: false, reason: "bounced" })
      .mockResolvedValueOnce({ ok: true });

    const response = await get();

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(await response.json()).toMatchObject({ sent: 1, failed: 1 });
  });

  it("does not release a claim it never took", async () => {
    loadTodaysReminderWork.mockResolvedValue(work([event()]));
    claimReminder.mockResolvedValue("already-sent");

    await get();

    expect(releaseReminder).not.toHaveBeenCalled();
  });

  // The dangerous case: a concurrent run holds the receipt and has already
  // mailed against it, and this run's own claim insert dies on a transient
  // database error. Releasing here would delete the other run's receipt and
  // the next run would re-mail the family — the duplicate the ledger exists
  // to prevent.
  it("does not release when the claim itself failed", async () => {
    loadTodaysReminderWork.mockResolvedValue(work([event()]));
    claimReminder.mockRejectedValue(new Error("connection pool timeout"));

    const response = await get();

    expect(releaseReminder).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ sent: 0, failed: 1 });
  });

  it("still releases a claim it did take when a later step throws", async () => {
    loadTodaysReminderWork.mockResolvedValue(work([event()]));
    sendEmail.mockRejectedValue(new Error("network"));

    await get();

    expect(releaseReminder).toHaveBeenCalledWith("evt-1", "user-anna");
  });

  it("keeps going to the next pair after a failed claim", async () => {
    loadTodaysReminderWork.mockResolvedValue(
      work([
        event({
          roster: [
            { playerId: "player-1", playerName: "Jimmy", guardians: [ANNA] },
            { playerId: "player-2", playerName: "Sofia", guardians: [BEN] },
          ],
        }),
      ]),
    );
    claimReminder
      .mockRejectedValueOnce(new Error("connection pool timeout"))
      .mockResolvedValueOnce("claimed");

    const response = await get();

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(await response.json()).toMatchObject({ sent: 1, failed: 1 });
  });
});

describe("GET /api/cron/reminders — truncated days", () => {
  it("reports a clean day as not truncated", async () => {
    loadTodaysReminderWork.mockResolvedValue(work([event()]));

    expect(await (await get()).json()).toMatchObject({ truncated: false });
  });

  // A cap that drops events silently makes a half-covered day read exactly
  // like a fully covered one.
  it("surfaces truncation rather than reporting a clean sweep", async () => {
    loadTodaysReminderWork.mockResolvedValue(work([event()], true));

    const response = await get();

    expect(await response.json()).toMatchObject({
      events: 1,
      sent: 1,
      truncated: true,
    });
  });
});

describe("GET /api/cron/reminders — push rides along", () => {
  beforeEach(() => {
    loadTodaysReminderWork.mockResolvedValue(work([event()]));
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
    loadTodaysReminderWork.mockResolvedValue(work([event({ location: null })]));

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
  const MAX_SENDS_PER_RUN = 200;

  // These cases need a couple of hundred sends, and the loop deliberately
  // paces them 600ms apart — two minutes of real waiting, well past any
  // sensible test timeout. The pacing reads the clock rather than sleeping a
  // fixed amount ("wait out only the remainder of the interval"), so a clock
  // that always reports a full interval has already passed makes every wait a
  // no-op without touching the code under test. The pacing itself is covered
  // by the timeout-coupling case below.
  beforeEach(() => {
    let clock = Date.parse("2026-07-15T12:00:00Z");
    vi.spyOn(Date, "now").mockImplementation(() => {
      clock += 1000;
      return clock;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /// One event whose roster is `count` single-guardian households, so the
  /// batch builder produces exactly `count` payloads in a stable order.
  function crowdedDay(count: number) {
    return work([
      event({
        roster: Array.from({ length: count }, (_, index) => ({
          playerId: `player-${index}`,
          playerName: `Kid ${index}`,
          guardians: [
            {
              userId: `user-${index}`,
              email: `parent${index}@example.com`,
              name: `Parent ${index}`,
            },
          ],
        })),
      }),
    ]);
  }

  it("keeps the send cap inside the route's own timeout", () => {
    // The coupling AGENTS.md calls out: cap x pacing must stay well under
    // maxDuration, or an oversized run times out half-finished.
    const MIN_SEND_INTERVAL_MS = 600;

    expect((MAX_SENDS_PER_RUN * MIN_SEND_INTERVAL_MS) / 1000).toBeLessThan(
      maxDuration,
    );
  });

  it("stops at the cap and reports what it did not attempt", async () => {
    loadTodaysReminderWork.mockResolvedValue(crowdedDay(MAX_SENDS_PER_RUN + 5));

    const response = await get();

    expect(sendEmail).toHaveBeenCalledTimes(MAX_SENDS_PER_RUN);
    expect(await response.json()).toMatchObject({
      sent: MAX_SENDS_PER_RUN,
      capped: 5,
    });
  });

  // The regression: the cap used to slice the *candidate* list, so a second
  // run spent its whole budget skipping the window the first run had already
  // sent and never reached the tail. Those families were never reminded that
  // day, and the summary reported a wall of `skipped` as though the work were
  // done.
  it("resumes into the unsent tail when the whole first window is already sent", async () => {
    loadTodaysReminderWork.mockResolvedValue(crowdedDay(MAX_SENDS_PER_RUN + 5));
    // Exactly what the previous run left behind.
    claimReminder.mockImplementation(async (_eventId: string, userId: string) => {
      const index = Number(userId.replace("user-", ""));
      return index < MAX_SENDS_PER_RUN ? "already-sent" : "claimed";
    });

    const response = await get();

    expect(sendEmail).toHaveBeenCalledTimes(5);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "parent200@example.com" }),
    );
    expect(await response.json()).toMatchObject({
      sent: 5,
      skipped: MAX_SENDS_PER_RUN,
      capped: 0,
    });
  });

  it("does not spend the budget on skips", async () => {
    loadTodaysReminderWork.mockResolvedValue(crowdedDay(10));
    claimReminder
      .mockResolvedValueOnce("already-sent")
      .mockResolvedValue("claimed");

    const response = await get();

    // Nine sends after one skip — a skip costs an insert, not a send slot.
    expect(sendEmail).toHaveBeenCalledTimes(9);
    expect(await response.json()).toMatchObject({ skipped: 1, capped: 0 });
  });

  it("reports nothing capped on an ordinary day", async () => {
    loadTodaysReminderWork.mockResolvedValue(work([event()]));

    expect(await (await get()).json()).toMatchObject({ capped: 0 });
  });
});
