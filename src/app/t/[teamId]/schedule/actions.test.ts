import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const requireTeamAccess = vi.fn();
const getEvent = vi.fn();
const createEvent = vi.fn();
const updateEvent = vi.fn();
const deleteEvent = vi.fn();
const guardedRosteredPlayerIds = vi.fn();
const upsertRsvp = vi.fn();
const clearRsvp = vi.fn();
const isPlayerRostered = vi.fn();
const listTeamGuardians = vi.fn();
const listTeamMembers = vi.fn();
const getTeamById = vi.fn();
const sendEmail = vi.fn();
const sendPushToUser = vi.fn();

vi.mock("@/lib/guardians", () => ({
  listTeamGuardians: (...args: unknown[]) => listTeamGuardians(...args),
}));

vi.mock("@/lib/memberships", () => ({
  listTeamMembers: (...args: unknown[]) => listTeamMembers(...args),
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: (...args: unknown[]) => getTeamById(...args),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));

vi.mock("@/lib/push", () => ({
  sendPushToUser: (...args: unknown[]) => sendPushToUser(...args),
}));

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/schedule", () => ({
  getEvent: (...args: unknown[]) => getEvent(...args),
  createEvent: (...args: unknown[]) => createEvent(...args),
  updateEvent: (...args: unknown[]) => updateEvent(...args),
  deleteEvent: (...args: unknown[]) => deleteEvent(...args),
}));

vi.mock("@/lib/rsvps", () => ({
  guardedRosteredPlayerIds: (...args: unknown[]) => guardedRosteredPlayerIds(...args),
  upsertRsvp: (...args: unknown[]) => upsertRsvp(...args),
  clearRsvp: (...args: unknown[]) => clearRsvp(...args),
  isPlayerRostered: (...args: unknown[]) => isPlayerRostered(...args),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/// `after` callbacks are captured, not run. That mirrors production — Next runs
/// them once the response is finished — and it is what lets these tests assert
/// the two halves separately: what the coach sees immediately, and what
/// actually gets sent afterwards.
const afterCallbacks: (() => unknown)[] = [];

vi.mock("next/server", () => ({
  after: (callback: () => unknown) => {
    afterCallbacks.push(callback);
  },
}));

/// Run the deferred work the action scheduled, as the platform would.
async function flushAfter(): Promise<void> {
  const pending = afterCallbacks.splice(0);
  for (const callback of pending) {
    await callback();
  }
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT:")) {
      throw error;
    }
  },
}));

import { revalidatePath } from "next/cache";

import { TeamAccessError } from "@/lib/team-access";
import {
  createEventAction,
  deleteEventAction,
  rsvpAction,
  updateEventAction,
} from "./actions";
import {
  ADD_EVENT_INITIAL_STATE,
  type AddEventState,
} from "./event-form-state";

const WRITE_ACCESS = { intent: "write", minRole: "COACH" } as const;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

const validEvent = {
  teamId: "team-1",
  type: "GAME",
  startsAt: "2026-08-15T18:00",
  location: "Field 3",
  opponent: "Hawks",
  notes: "Bring water",
};

/// Every action redirects on success, and redirect() throws — so the
/// assertions below catch the redirect and inspect its URL.
async function redirectUrlOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("NEXT_REDIRECT:")) {
      return message.slice("NEXT_REDIRECT:".length);
    }
    throw error;
  }
  throw new Error("Expected a redirect, but the action returned normally");
}

/// `createEventAction` is shaped for `useActionState`, so it takes the previous
/// state ahead of the form — and, on every path but lost access, it now
/// *returns* that state instead of redirecting. That is the fix for C1: no
/// navigation means the page stays put, the view stays put, and the form keeps
/// what is worth keeping.
function addEvent(data: FormData): Promise<AddEventState> {
  return createEventAction(ADD_EVENT_INITIAL_STATE, data);
}

/// Narrow to one branch of the returned state, failing the test rather than
/// the type checker when a call took the other one.
function added(state: AddEventState) {
  expect(state.status).toBe("added");
  if (state.status !== "added") throw new Error("unreachable");
  return state;
}

function rejected(state: AddEventState) {
  expect(state.status).toBe("invalid");
  if (state.status !== "invalid") throw new Error("unreachable");
  return state;
}

/// The RSVP gate compares an event's start against the wall clock, so this
/// suite pins the clock rather than letting real time drift past the fixture
/// and silently change which branch every test takes.
const NOW = new Date("2026-08-10T12:00:00Z");
const STARTED = "2026-08-10T11:00:00Z";

/// One household per player. The announcement fan-out paces sends 600ms apart,
/// so a fixture with five guardians costs three real seconds — keep them small
/// and assert the grouping in `announcements.test.ts`, where it is free.
function guardian(userId: string, email: string) {
  return { userId, email, name: null };
}

function rosterOf(...guardians: { userId: string; email: string }[]) {
  return guardians.map((g, index) => ({
    playerId: `player-${index}`,
    playerName: `Kid ${index}`,
    guardians: [{ ...g, name: null }],
  }));
}

/// Every `href` anywhere in a rendered element tree.
function hrefsIn(node: unknown): string[] {
  if (!node || typeof node !== "object") {
    return [];
  }
  if (Array.isArray(node)) {
    return node.flatMap(hrefsIn);
  }
  const props = (node as { props?: Record<string, unknown> }).props;
  if (!props) {
    return [];
  }
  const own = typeof props.href === "string" ? [props.href] : [];
  return [...own, ...hrefsIn(props.children)];
}

const EVENT = {
  id: "event-1",
  type: "GAME",
  startsAt: new Date("2026-08-15T23:00:00Z"),
  location: "Field 3",
  opponent: "Hawks",
  notes: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks.length = 0;
  // Frozen, not advancing. The RSVP gate compares an event's start against
  // `new Date()` and one test below sits a single second the right side of it,
  // so a clock that ticks with real time turns that test into a race a loaded
  // runner loses. The announcement suite — the only one that waits on the
  // 600ms send pacing — re-installs an advancing clock for itself.
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
  getEvent.mockResolvedValue(EVENT);
  createEvent.mockResolvedValue(EVENT);
  // Nobody on the roster by default, so the tests that are about event
  // *creation* don't pay for a fan-out. The announcement suite sets its own.
  listTeamGuardians.mockResolvedValue([]);
  listTeamMembers.mockResolvedValue([
    { userId: "user-1", role: "COACH", name: "Coach", email: "coach@example.com", phone: null },
  ]);
  getTeamById.mockResolvedValue({ id: "team-1", name: "Sharks" });
  sendEmail.mockResolvedValue({ ok: true });
  sendPushToUser.mockResolvedValue({ delivered: 1, pruned: 0, failed: 0 });
  updateEvent.mockResolvedValue({ id: "event-1" });
  deleteEvent.mockResolvedValue(undefined);
  guardedRosteredPlayerIds.mockResolvedValue(new Set(["player-1"]));
  upsertRsvp.mockResolvedValue(undefined);
  clearRsvp.mockResolvedValue(undefined);
  isPlayerRostered.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createEventAction", () => {
  it("requires COACH and a writable team", async () => {
    await addEvent(form(validEvent));

    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", WRITE_ACCESS);
  });

  it("converts the coach's wall clock to a Central-anchored UTC instant", async () => {
    await addEvent(form(validEvent));

    const [[teamId, input]] = createEvent.mock.calls;
    expect(teamId).toBe("team-1");
    // 6:00 PM Central in August (CDT, UTC-5) is 23:00Z — not 18:00Z, which is
    // what a naive `new Date(...)` on a UTC server would have stored.
    expect(input.startsAt.toISOString()).toBe("2026-08-15T23:00:00.000Z");
    expect(input.type).toBe("GAME");
    expect(input.location).toBe("Field 3");
  });

  it("stores blank optional fields as null rather than empty strings", async () => {
    await addEvent(form({ ...validEvent, location: "", opponent: "", notes: "  " }));

    const [[, input]] = createEvent.mock.calls;
    expect(input.location).toBeNull();
    expect(input.opponent).toBeNull();
    expect(input.notes).toBeNull();
  });

  it("does not navigate on success, which is what kept the coach in place", async () => {
    // The whole of C1's ~60 interactions was in the old redirect: it reloaded
    // the page, reset five fields, dropped view/month and scrolled to the top
    // — every time, for every game of a twelve-game season.
    const state = await addEvent(form(validEvent));

    expect(state.status).toBe("added");
  });

  it("keeps type, location and opponent for the next event, and never the date", async () => {
    const state = added(await addEvent(form(validEvent)));

    expect(state.keep).toEqual({
      type: "GAME",
      // Always cleared: two events cannot share a start time, and a stale one
      // sitting in the box is the single most dangerous thing to keep.
      startsAt: "",
      location: "Field 3",
      opponent: "Hawks",
      // Notes are about one occasion, so they clear with the date.
      notes: "",
    });
  });

  it("names the event it just added, since three quick adds look alike", async () => {
    const state = added(await addEvent(form(validEvent)));

    expect(state.summary).toContain("Game");
    expect(state.summary).toContain("2026");
  });

  it("hands back what was typed on a blank start time, without writing", async () => {
    const state = rejected(await addEvent(form({ ...validEvent, startsAt: "" })));

    expect(state.code).toBe("invalid-datetime");
    expect(state.field).toBe("startsAt");
    // The rest of the form survives — that is the point of returning.
    expect(state.values.location).toBe("Field 3");
    expect(state.values.opponent).toBe("Hawks");
    expect(state.values.notes).toBe("Bring water");
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("rejects a malformed start time", async () => {
    const state = rejected(
      await addEvent(form({ ...validEvent, startsAt: "next tuesday" })),
    );

    expect(state.code).toBe("invalid-datetime");
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("rejects a date that does not exist", async () => {
    const state = rejected(
      await addEvent(form({ ...validEvent, startsAt: "2026-02-30T18:00" })),
    );

    expect(state.code).toBe("invalid-datetime");
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("rejects an event type outside the enum", async () => {
    const state = rejected(await addEvent(form({ ...validEvent, type: "SCRIMMAGE" })));

    expect(state.code).toBe("invalid-type");
    expect(state.field).toBe("type");
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("rejects an over-long location", async () => {
    const state = rejected(
      await addEvent(form({ ...validEvent, location: "x".repeat(201) })),
    );

    expect(state.code).toBe("invalid-location");
    // The field the error is marked against, not just its code — this is what
    // keeps a screen reader from being told the date and time are the problem
    // when the location was what failed.
    expect(state.field).toBe("location");
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("names the field for every error code, not only the ones exercised above", async () => {
    const opponent = rejected(
      await addEvent(form({ ...validEvent, opponent: "x".repeat(201) })),
    );
    expect(opponent.field).toBe("opponent");

    const notes = rejected(
      await addEvent(form({ ...validEvent, notes: "x".repeat(2001) })),
    );
    expect(notes.field).toBe("notes");
  });

  it("redirects with ?error=access when the caller is a parent or the team is archived", async () => {
    requireTeamAccess.mockRejectedValue(
      new TeamAccessError("Requires COACH", "insufficient-role"),
    );

    const url = await redirectUrlOf(() => addEvent(form(validEvent)));

    expect(url).toBe("/t/team-1/schedule?view=month&month=2026-08&error=access");
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("sends a list-view coach back to their list, not to the grid", async () => {
    // parseViewParam treats anything that is not exactly "list" as month, so
    // dropping the param silently threw a coach working down a list back onto
    // this month's calendar (C1).
    requireTeamAccess.mockRejectedValue(
      new TeamAccessError("Requires COACH", "insufficient-role"),
    );

    const url = await redirectUrlOf(() =>
      addEvent(form({ ...validEvent, view: "list", past: "1" })),
    );

    expect(url).toBe("/t/team-1/schedule?view=list&past=1&error=access");
  });

  it("re-parses the context rather than trusting it", async () => {
    // The context arrives from hidden inputs, so it arrives from whatever the
    // POST carried. A forged month must not reach a redirect verbatim.
    requireTeamAccess.mockRejectedValue(
      new TeamAccessError("Requires COACH", "insufficient-role"),
    );

    const url = await redirectUrlOf(() =>
      addEvent(form({ ...validEvent, view: "whatever", month: "not-a-month" })),
    );

    expect(url).toBe("/t/team-1/schedule?view=month&month=2026-08&error=access");
  });

  it("throws on a missing team id rather than guessing", async () => {
    const data = form(validEvent);
    data.delete("teamId");

    await expect(addEvent(data)).rejects.toThrow("Invalid team ID");
  });
});

/// #45 — the announcement fan-out. The rules worth pinning here are the ones
/// that only exist once the action, the roster and Resend are in the same
/// place: grouping is tested in `announcements.test.ts` and wording in the two
/// email builders' suites, all without any of this machinery.
describe("createEventAction — announcing the event", () => {
  // Only this suite lets the clock run. The fan-out paces its sends with
  // setTimeout, and against the frozen clock the rest of the file needs, that
  // promise never resolves — the suite times out rather than failing. Re-pin
  // the system time so the past-event gate still reads NOW.
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
  });

  async function add(): Promise<AddEventState> {
    return createEventAction(ADD_EVENT_INITIAL_STATE, form(validEvent));
  }

  // The half the coach experiences: the action returns before a single message
  // has been sent, and says how many are coming.
  describe("what the action returns", () => {
    it("reports the audience without having sent anything yet", async () => {
      listTeamGuardians.mockResolvedValue(
        rosterOf(guardian("u-1", "one@example.com"), guardian("u-2", "two@example.com")),
      );

      const state = await add();

      expect(state).toMatchObject({
        status: "added",
        announcement: { status: "sending", recipients: 2 },
      });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("schedules the fan-out for after the response", async () => {
      listTeamGuardians.mockResolvedValue(rosterOf(guardian("u-1", "one@example.com")));

      await add();

      expect(afterCallbacks).toHaveLength(1);
    });

    it("says there is nobody to tell when no guardian is linked yet", async () => {
      const state = await add();

      expect(state).toMatchObject({ announcement: { status: "none" } });
      expect(afterCallbacks).toHaveLength(0);
    });

    // The one announcement failure still knowable while the coach is looking at
    // the page. Everything after this reports by email.
    it("reports a roster it could not read, and schedules nothing", async () => {
      listTeamGuardians.mockRejectedValue(new Error("connection lost"));

      const state = await add();

      expect(createEvent).toHaveBeenCalledTimes(1);
      expect(state).toMatchObject({
        status: "added",
        announcement: { status: "failed" },
      });
      expect(afterCallbacks).toHaveLength(0);
    });

    // AC6 — a coach back-filling last week's game must not mail the team.
    it("announces nothing for an event whose start time has already passed", async () => {
      listTeamGuardians.mockResolvedValue(rosterOf(guardian("u-1", "one@example.com")));
      createEvent.mockResolvedValue({ ...EVENT, startsAt: new Date(STARTED) });

      const state = await add();

      expect(state).toMatchObject({ announcement: { status: "none" } });
      expect(listTeamGuardians).not.toHaveBeenCalled();
    });

    it("reads recipients from the roster, never from the posted form", async () => {
      await createEventAction(
        ADD_EVENT_INITIAL_STATE,
        form({ ...validEvent, email: "attacker@example.com" }),
      );

      expect(listTeamGuardians).toHaveBeenCalledWith("team-1");
      expect(sendEmail).not.toHaveBeenCalled();
    });

    // 30 rejected a 16-player roster with both parents linked. 200 is a
    // runaway guard, and it truncates-and-reports rather than refusing.
    it("accepts a roster far past the old cap", async () => {
      listTeamGuardians.mockResolvedValue(
        rosterOf(
          ...Array.from({ length: 40 }, (_, i) =>
            guardian(`u-${i}`, `p${i}@example.com`),
          ),
        ),
      );

      const state = await add();

      expect(state).toMatchObject({
        announcement: { status: "sending", recipients: 40 },
      });
    });
  });

  // The deferred half, run as the platform would run it.
  describe("once the deferred work runs", () => {
    it("emails every guardian on the roster", async () => {
      listTeamGuardians.mockResolvedValue(
        rosterOf(guardian("u-1", "one@example.com"), guardian("u-2", "two@example.com")),
      );

      await add();
      await flushAfter();

      const announced = sendEmail.mock.calls
        .map(([args]) => args.to)
        .filter((to: string) => to !== "coach@example.com");
      expect(announced).toEqual(["one@example.com", "two@example.com"]);
    });

    it("points Reply-To and List-Unsubscribe at the coach who added it", async () => {
      listTeamGuardians.mockResolvedValue(rosterOf(guardian("u-1", "one@example.com")));

      await add();
      await flushAfter();

      const [args] = sendEmail.mock.calls[0];
      expect(args.replyTo).toBe("coach@example.com");
      expect(args.listUnsubscribe).toBe("coach@example.com");
    });

    it("links to the event page, where the RSVP buttons are", async () => {
      listTeamGuardians.mockResolvedValue(rosterOf(guardian("u-1", "one@example.com")));

      await add();
      await flushAfter();

      const [args] = sendEmail.mock.calls[0];
      expect(args.subject).toContain("Sharks");
      // The template is called as a function, so `react` is the rendered tree
      // rather than an element holding the props — walk it for the href. This
      // is the one assertion that the id the action created is the id a parent
      // taps, which neither builder's suite can see.
      expect(
        hrefsIn(args.react).some((href) =>
          href.endsWith("/t/team-1/schedule/event-1"),
        ),
      ).toBe(true);
    });

    it("one bad mailbox does not lose the rest of the batch", async () => {
      listTeamGuardians.mockResolvedValue(
        rosterOf(guardian("u-1", "one@example.com"), guardian("u-2", "two@example.com")),
      );
      sendEmail
        .mockResolvedValueOnce({ ok: false, reason: "bad mailbox" })
        .mockResolvedValue({ ok: true });

      await add();
      await flushAfter();

      expect(sendEmail.mock.calls.map(([args]) => args.to)).toContain(
        "two@example.com",
      );
    });

    // A deferred rejection is an unhandled error in a background task nobody is
    // watching — strictly worse than one that reports itself by email.
    it("survives sendEmail throwing outright", async () => {
      listTeamGuardians.mockResolvedValue(
        rosterOf(guardian("u-1", "one@example.com"), guardian("u-2", "two@example.com")),
      );
      sendEmail
        .mockRejectedValueOnce(new Error("socket hang up"))
        .mockResolvedValue({ ok: true });

      await add();

      await expect(flushAfter()).resolves.toBeUndefined();
      expect(sendEmail.mock.calls.map(([args]) => args.to)).toContain(
        "two@example.com",
      );
    });

    // AC7 / Decision 8 — push follows a delivered email and can never turn one
    // into a failure.
    it("pushes only after the email actually went", async () => {
      listTeamGuardians.mockResolvedValue(
        rosterOf(guardian("u-1", "one@example.com"), guardian("u-2", "two@example.com")),
      );
      sendEmail
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValue({ ok: false, reason: "bad mailbox" });

      await add();
      await flushAfter();

      expect(sendPushToUser).toHaveBeenCalledTimes(1);
      expect(sendPushToUser.mock.calls[0][0]).toBe("u-1");
    });

    it("a throwing push does not stop the fan-out", async () => {
      listTeamGuardians.mockResolvedValue(
        rosterOf(guardian("u-1", "one@example.com"), guardian("u-2", "two@example.com")),
      );
      sendPushToUser.mockRejectedValue(new Error("web-push exploded"));

      await add();
      await flushAfter();

      expect(sendEmail.mock.calls.map(([args]) => args.to)).toContain(
        "two@example.com",
      );
    });

    it("still announces when the coach's own address cannot be resolved", async () => {
      listTeamGuardians.mockResolvedValue(rosterOf(guardian("u-1", "one@example.com")));
      listTeamMembers.mockResolvedValue([]);

      await add();
      await flushAfter();

      const [args] = sendEmail.mock.calls[0];
      expect(args.replyTo).toBeUndefined();
      expect(args.listUnsubscribe).toBeUndefined();
    });
  });

  // The channel that carries the outcome, since the returned state cannot.
  // Without it a coach has no way of learning three families were never told.
  describe("the coach's receipt", () => {
    function receipt() {
      return sendEmail.mock.calls
        .map(([args]) => args)
        .find((args: { to: string }) => args.to === "coach@example.com");
    }

    it("reports a clean run", async () => {
      listTeamGuardians.mockResolvedValue(rosterOf(guardian("u-1", "one@example.com")));

      await add();
      await flushAfter();

      expect(receipt()?.subject).toBe(
        "[Sharks] Game vs Hawks announced to 1 parent",
      );
    });

    it("leads with the number that needs acting on when sends failed", async () => {
      listTeamGuardians.mockResolvedValue(
        rosterOf(guardian("u-1", "one@example.com"), guardian("u-2", "two@example.com")),
      );
      sendEmail
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: false, reason: "bad mailbox" })
        .mockResolvedValue({ ok: true });

      await add();
      await flushAfter();

      expect(receipt()?.subject).toBe(
        "[Sharks] 1 parent not told about Game vs Hawks",
      );
    });

    // It answers one person about their own action — not a list they belong to.
    it("carries no List-Unsubscribe", async () => {
      listTeamGuardians.mockResolvedValue(rosterOf(guardian("u-1", "one@example.com")));

      await add();
      await flushAfter();

      expect(receipt()?.listUnsubscribe).toBeUndefined();
    });

    it("is skipped rather than sent nowhere when no coach address resolves", async () => {
      listTeamGuardians.mockResolvedValue(rosterOf(guardian("u-1", "one@example.com")));
      listTeamMembers.mockResolvedValue([]);

      await add();
      await flushAfter();

      expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    // Nobody is left to tell, so it is logged and dropped — never rethrown out
    // of a background task.
    it("does not throw when the receipt itself fails", async () => {
      listTeamGuardians.mockResolvedValue(rosterOf(guardian("u-1", "one@example.com")));
      sendEmail
        .mockResolvedValueOnce({ ok: true })
        .mockRejectedValueOnce(new Error("Resend is down"));

      await add();

      await expect(flushAfter()).resolves.toBeUndefined();
    });
  });
});

// AC4 — a change-notification is a follow-up, and needs a diff this does not
// compute. The check is here so adding one is a deliberate act.
describe("updateEventAction — deliberately silent", () => {
  it("sends nothing when an event is edited", async () => {
    listTeamGuardians.mockResolvedValue(rosterOf(guardian("u-1", "one@example.com")));

    await redirectUrlOf(() =>
      updateEventAction(form({ ...validEvent, eventId: "event-1" })),
    );
    await flushAfter();

    expect(afterCallbacks).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendPushToUser).not.toHaveBeenCalled();
  });
});

describe("updateEventAction", () => {
  const updateForm = form({ ...validEvent, eventId: "event-1" });

  it("requires COACH and a writable team", async () => {
    await redirectUrlOf(() => updateEventAction(updateForm));

    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", WRITE_ACCESS);
  });

  it("resolves the event through getEvent so the id is scoped to this team", async () => {
    await redirectUrlOf(() => updateEventAction(updateForm));

    expect(getEvent).toHaveBeenCalledWith("team-1", "event-1");
    expect(updateEvent).toHaveBeenCalled();
  });

  it("refuses to write when the event belongs to another team", async () => {
    // A coach on team A POSTing team B's event id: getEvent is scoped, so it
    // returns null and the action bails out to the schedule.
    getEvent.mockResolvedValue(null);

    const url = await redirectUrlOf(() => updateEventAction(updateForm));

    expect(url).toBe("/t/team-1/schedule?view=month&month=2026-08");
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it("redirects to the event with a saved flag on success", async () => {
    const url = await redirectUrlOf(() => updateEventAction(updateForm));

    expect(url).toBe(
      "/t/team-1/schedule/event-1?view=month&month=2026-08&saved=1",
    );
  });

  it("sends validation errors back to the event page, not the schedule", async () => {
    const url = await redirectUrlOf(() =>
      updateEventAction(form({ ...validEvent, eventId: "event-1", startsAt: "" })),
    );

    expect(url).toBe(
      "/t/team-1/schedule/event-1?view=month&month=2026-08&error=invalid-datetime",
    );
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it("throws on a missing event id", async () => {
    await expect(updateEventAction(form(validEvent))).rejects.toThrow(
      "Invalid event ID",
    );
  });
});

describe("deleteEventAction", () => {
  const deleteForm = form({ teamId: "team-1", eventId: "event-1" });

  it("requires COACH and a writable team", async () => {
    await redirectUrlOf(() => deleteEventAction(deleteForm));

    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", WRITE_ACCESS);
  });

  it("refuses to delete an event belonging to another team", async () => {
    // Without the teamId scope this would cascade another team's RSVPs.
    getEvent.mockResolvedValue(null);

    await redirectUrlOf(() => deleteEventAction(deleteForm));

    expect(deleteEvent).not.toHaveBeenCalled();
  });

  it("deletes and returns to the schedule", async () => {
    const url = await redirectUrlOf(() => deleteEventAction(deleteForm));

    expect(deleteEvent).toHaveBeenCalledWith("team-1", "event-1");
    expect(url).toBe("/t/team-1/schedule?view=month&month=2026-08");
  });

  it("redirects with ?error=access for a parent or an archived team", async () => {
    requireTeamAccess.mockRejectedValue(new TeamAccessError("archived", "archived"));

    const url = await redirectUrlOf(() => deleteEventAction(deleteForm));

    expect(url).toBe(
      "/t/team-1/schedule/event-1?view=month&month=2026-08&error=access",
    );
    expect(deleteEvent).not.toHaveBeenCalled();
  });
});

describe("rsvpAction", () => {
  const rsvpForm = form({
    teamId: "team-1",
    eventId: "event-1",
    playerId: "player-1",
    response: "attending",
  });

  it("requires a writable team, open to any role (no minRole)", async () => {
    await redirectUrlOf(() => rsvpAction(rsvpForm));

    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", { intent: "write" });
  });

  it("resolves the event through getEvent so the id is scoped to this team", async () => {
    await redirectUrlOf(() => rsvpAction(rsvpForm));

    expect(getEvent).toHaveBeenCalledWith("team-1", "event-1");
  });

  // The null fourth argument is provenance (#54): a guardian's own answer is
  // family-recorded, and writing null on every family tap is what erases a
  // coach's earlier entry without special casing.
  it("upserts attending: true, family-recorded, for an attending response", async () => {
    await redirectUrlOf(() => rsvpAction(rsvpForm));

    expect(upsertRsvp).toHaveBeenCalledWith("event-1", "player-1", true, null);
  });

  it("upserts attending: false, family-recorded, for a declined response", async () => {
    await redirectUrlOf(() =>
      rsvpAction(form({ ...Object.fromEntries(rsvpForm), response: "declined" })),
    );

    expect(upsertRsvp).toHaveBeenCalledWith("event-1", "player-1", false, null);
  });

  it("redirects to the event with a saved flag on success", async () => {
    const url = await redirectUrlOf(() => rsvpAction(rsvpForm));

    expect(url).toBe("/t/team-1/schedule/event-1?saved=1");
  });

  it("rejects a response value outside the enum, without writing", async () => {
    const url = await redirectUrlOf(() =>
      rsvpAction(form({ ...Object.fromEntries(rsvpForm), response: "maybe" })),
    );

    expect(url).toBe("/t/team-1/schedule/event-1?error=invalid-rsvp");
    expect(upsertRsvp).not.toHaveBeenCalled();
  });

  it("refuses to write when the event belongs to another team", async () => {
    getEvent.mockResolvedValue(null);

    const url = await redirectUrlOf(() => rsvpAction(rsvpForm));

    expect(url).toBe("/t/team-1/schedule");
    expect(upsertRsvp).not.toHaveBeenCalled();
  });

  it("refuses to write when a parent does not guard the named player", async () => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["someone-elses-kid"]));

    const url = await redirectUrlOf(() => rsvpAction(rsvpForm));

    expect(url).toBe("/t/team-1/schedule/event-1?error=not-your-player");
    expect(upsertRsvp).not.toHaveBeenCalled();
    // A parent never reaches the staff path's roster question.
    expect(isPlayerRostered).not.toHaveBeenCalled();
  });

  it("redirects with ?error=access when the team is archived", async () => {
    requireTeamAccess.mockRejectedValue(new TeamAccessError("archived", "archived"));

    const url = await redirectUrlOf(() => rsvpAction(rsvpForm));

    expect(url).toBe("/t/team-1/schedule/event-1?error=access");
    expect(upsertRsvp).not.toHaveBeenCalled();
  });

  it("throws on a missing player id rather than guessing", async () => {
    const data = form({ teamId: "team-1", eventId: "event-1", response: "attending" });

    await expect(rsvpAction(data)).rejects.toThrow("Invalid player ID");
  });
});

/// #54: staff (COACH+) may answer for any rostered player — the texted
/// "Mason's out Saturday" finally has somewhere to land. The path never skips
/// team/event scoping, and provenance rides the same upsert as the state.
describe("rsvpAction on the staff path", () => {
  const unguardedForm = form({
    teamId: "team-1",
    eventId: "event-1",
    playerId: "other-family-kid",
    response: "declined",
  });

  it("lets a coach record for a rostered player they do not guard", async () => {
    const url = await redirectUrlOf(() => rsvpAction(unguardedForm));

    expect(isPlayerRostered).toHaveBeenCalledWith("team-1", "other-family-kid");
    expect(upsertRsvp).toHaveBeenCalledWith(
      "event-1",
      "other-family-kid",
      false,
      "user-1",
    );
    expect(url).toBe("/t/team-1/schedule/event-1?saved=1");
  });

  it("lets an owner record too — the check is COACH+, not COACH exactly", async () => {
    requireTeamAccess.mockResolvedValue({ role: "OWNER", userId: "owner-1" });

    await redirectUrlOf(() => rsvpAction(unguardedForm));

    expect(upsertRsvp).toHaveBeenCalledWith(
      "event-1",
      "other-family-kid",
      false,
      "owner-1",
    );
  });

  // Guardianship is checked first, so a coach answering for their own kid
  // records as the family — "Recorded by coach" on your own child, tapped by
  // you, would be noise.
  it("records a coach's own kid as family, not staff", async () => {
    await redirectUrlOf(() =>
      rsvpAction(form({ ...Object.fromEntries(unguardedForm), playerId: "player-1" })),
    );

    expect(upsertRsvp).toHaveBeenCalledWith("event-1", "player-1", false, null);
    expect(isPlayerRostered).not.toHaveBeenCalled();
  });

  // Role alone must never authorize a raw playerId: players are global
  // (Decision 15), so without the roster check a crafted form could RSVP
  // another team's kid onto this event.
  it("refuses a player who is not rostered on this team", async () => {
    isPlayerRostered.mockResolvedValue(false);

    const url = await redirectUrlOf(() => rsvpAction(unguardedForm));

    expect(url).toBe("/t/team-1/schedule/event-1?error=not-on-team");
    expect(upsertRsvp).not.toHaveBeenCalled();
  });

  it("clears a response by deleting the row, never by writing one", async () => {
    const url = await redirectUrlOf(() =>
      rsvpAction(form({ ...Object.fromEntries(unguardedForm), response: "clear" })),
    );

    expect(clearRsvp).toHaveBeenCalledWith("event-1", "other-family-kid");
    expect(upsertRsvp).not.toHaveBeenCalled();
    expect(url).toBe("/t/team-1/schedule/event-1?saved=1");
  });

  // AC3's "no special casing" cuts both ways: clear is authorized like any
  // other response, so a guardian clearing their own kid also works.
  it("accepts clear from a guardian for their own kid", async () => {
    await redirectUrlOf(() =>
      rsvpAction(
        form({
          teamId: "team-1",
          eventId: "event-1",
          playerId: "player-1",
          response: "clear",
        }),
      ),
    );

    expect(clearRsvp).toHaveBeenCalledWith("event-1", "player-1");
  });

  it("still rejects an archived team before any staff logic runs", async () => {
    requireTeamAccess.mockRejectedValue(new TeamAccessError("archived", "archived"));

    const url = await redirectUrlOf(() => rsvpAction(unguardedForm));

    expect(url).toBe("/t/team-1/schedule/event-1?error=access");
    expect(upsertRsvp).not.toHaveBeenCalled();
    expect(clearRsvp).not.toHaveBeenCalled();
  });
});

/// #48 posts the same action from team home, where the whole point is that the
/// parent never leaves the page. `from` moves the redirect target and nothing
/// else — every check above still runs, which is why these cases assert the
/// refusals land at home too rather than only the happy path.
describe("rsvpAction posted from team home", () => {
  const homeForm = form({
    teamId: "team-1",
    eventId: "event-1",
    playerId: "player-1",
    response: "attending",
    from: "home",
  });

  it("runs the identical authorization checks", async () => {
    await redirectUrlOf(() => rsvpAction(homeForm));

    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", { intent: "write" });
    expect(getEvent).toHaveBeenCalledWith("team-1", "event-1");
    expect(guardedRosteredPlayerIds).toHaveBeenCalledWith("team-1", "user-1");
    expect(upsertRsvp).toHaveBeenCalledWith("event-1", "player-1", true, null);
  });

  it("redirects back to team home on success", async () => {
    const url = await redirectUrlOf(() => rsvpAction(homeForm));

    expect(url).toBe("/t/team-1?saved=1");
  });

  it("revalidates team home as well as the event page", async () => {
    await redirectUrlOf(() => rsvpAction(homeForm));

    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/t/[teamId]", "page");
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith(
      "/t/[teamId]/schedule/[eventId]",
      "page",
    );
  });

  it("keeps a bad response value at home rather than stranding the parent", async () => {
    const url = await redirectUrlOf(() =>
      rsvpAction(form({ ...Object.fromEntries(homeForm), response: "maybe" })),
    );

    expect(url).toBe("/t/team-1?error=invalid-rsvp");
    expect(upsertRsvp).not.toHaveBeenCalled();
  });

  it("keeps a not-your-player refusal at home", async () => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["someone-elses-kid"]));

    const url = await redirectUrlOf(() => rsvpAction(homeForm));

    expect(url).toBe("/t/team-1?error=not-your-player");
    expect(upsertRsvp).not.toHaveBeenCalled();
  });

  // The archived case AC 4 is about: the buttons are hidden at render, so
  // reaching here means the team was archived between load and tap. The copy
  // has to land where the parent is standing.
  it("keeps an archived-team refusal at home", async () => {
    requireTeamAccess.mockRejectedValue(new TeamAccessError("archived", "archived"));

    const url = await redirectUrlOf(() => rsvpAction(homeForm));

    expect(url).toBe("/t/team-1?error=access");
    expect(upsertRsvp).not.toHaveBeenCalled();
  });

  it("says so at home when the event was deleted under the parent", async () => {
    getEvent.mockResolvedValue(null);

    const url = await redirectUrlOf(() => rsvpAction(homeForm));

    expect(url).toBe("/t/team-1?error=event-gone");
    expect(upsertRsvp).not.toHaveBeenCalled();
  });

  // Team home hides these buttons once an event starts, but a dashboard left
  // open through first pitch still holds a form that posts. The gate has to
  // hold on the server too, or the render is the only thing enforcing it.
  it("refuses a stale home form for an event that has already started", async () => {
    getEvent.mockResolvedValue({ ...EVENT, startsAt: new Date(STARTED) });

    const url = await redirectUrlOf(() => rsvpAction(homeForm));

    expect(url).toBe("/t/team-1?error=event-started");
    expect(upsertRsvp).not.toHaveBeenCalled();
  });

  it("still accepts a home answer right up to the start time", async () => {
    getEvent.mockResolvedValue({ ...EVENT, startsAt: new Date(NOW.getTime() + 1000) });

    await redirectUrlOf(() => rsvpAction(homeForm));

    expect(upsertRsvp).toHaveBeenCalledWith("event-1", "player-1", true, null);
  });

  // Disambiguation, not authorization: the event page has always allowed a late
  // answer on purpose — a parent realising at 9:15 they cannot make the 9:00
  // game is telling the coach something useful, and readiness still shows that
  // game. Only team home's page-selected event is ambiguous, because there the
  // page chose it rather than the parent.
  it("leaves the event page free to record a late answer", async () => {
    getEvent.mockResolvedValue({ ...EVENT, startsAt: new Date(STARTED) });

    const url = await redirectUrlOf(() =>
      rsvpAction(
        form({
          teamId: "team-1",
          eventId: "event-1",
          playerId: "player-1",
          response: "attending",
        }),
      ),
    );

    expect(url).toBe("/t/team-1/schedule/event-1?saved=1");
    expect(upsertRsvp).toHaveBeenCalledWith("event-1", "player-1", true, null);
  });

  // `from` is an enum, so nothing a form can carry turns it into a redirect
  // target of the caller's choosing — anything unrecognised is the event page.
  it("ignores an unrecognised from value instead of trusting it", async () => {
    const url = await redirectUrlOf(() =>
      rsvpAction(
        form({ ...Object.fromEntries(homeForm), from: "https://evil.example.com" }),
      ),
    );

    expect(url).toBe("/t/team-1/schedule/event-1?saved=1");
  });
});
