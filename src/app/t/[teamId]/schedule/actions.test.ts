import { describe, it, expect, vi, beforeEach } from "vitest";

const requireTeamAccess = vi.fn();
const getEvent = vi.fn();
const createEvent = vi.fn();
const updateEvent = vi.fn();
const deleteEvent = vi.fn();
const guardedRosteredPlayerIds = vi.fn();
const upsertRsvp = vi.fn();

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
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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

import { TeamAccessError } from "@/lib/team-access";
import {
  createEventAction,
  deleteEventAction,
  rsvpAction,
  updateEventAction,
} from "./actions";

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

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
  getEvent.mockResolvedValue({
    id: "event-1",
    type: "GAME",
    startsAt: new Date("2026-08-15T23:00:00Z"),
    location: "Field 3",
    opponent: "Hawks",
    notes: null,
  });
  createEvent.mockResolvedValue({ id: "event-1" });
  updateEvent.mockResolvedValue({ id: "event-1" });
  deleteEvent.mockResolvedValue(undefined);
  guardedRosteredPlayerIds.mockResolvedValue(new Set(["player-1"]));
  upsertRsvp.mockResolvedValue(undefined);
});

describe("createEventAction", () => {
  it("requires COACH and a writable team", async () => {
    await redirectUrlOf(() => createEventAction(form(validEvent)));

    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", WRITE_ACCESS);
  });

  it("converts the coach's wall clock to a Central-anchored UTC instant", async () => {
    await redirectUrlOf(() => createEventAction(form(validEvent)));

    const [[teamId, input]] = createEvent.mock.calls;
    expect(teamId).toBe("team-1");
    // 6:00 PM Central in August (CDT, UTC-5) is 23:00Z — not 18:00Z, which is
    // what a naive `new Date(...)` on a UTC server would have stored.
    expect(input.startsAt.toISOString()).toBe("2026-08-15T23:00:00.000Z");
    expect(input.type).toBe("GAME");
    expect(input.location).toBe("Field 3");
  });

  it("stores blank optional fields as null rather than empty strings", async () => {
    await redirectUrlOf(() =>
      createEventAction(
        form({ ...validEvent, location: "", opponent: "", notes: "  " }),
      ),
    );

    const [[, input]] = createEvent.mock.calls;
    expect(input.location).toBeNull();
    expect(input.opponent).toBeNull();
    expect(input.notes).toBeNull();
  });

  it("redirects back with an error on a blank start time, without writing", async () => {
    const url = await redirectUrlOf(() =>
      createEventAction(form({ ...validEvent, startsAt: "" })),
    );

    expect(url).toBe("/t/team-1/schedule?error=invalid-datetime");
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("rejects a malformed start time", async () => {
    const url = await redirectUrlOf(() =>
      createEventAction(form({ ...validEvent, startsAt: "next tuesday" })),
    );

    expect(url).toBe("/t/team-1/schedule?error=invalid-datetime");
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("rejects a date that does not exist", async () => {
    const url = await redirectUrlOf(() =>
      createEventAction(form({ ...validEvent, startsAt: "2026-02-30T18:00" })),
    );

    expect(url).toBe("/t/team-1/schedule?error=invalid-datetime");
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("rejects an event type outside the enum", async () => {
    const url = await redirectUrlOf(() =>
      createEventAction(form({ ...validEvent, type: "SCRIMMAGE" })),
    );

    expect(url).toBe("/t/team-1/schedule?error=invalid-type");
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("rejects an over-long location", async () => {
    const url = await redirectUrlOf(() =>
      createEventAction(form({ ...validEvent, location: "x".repeat(201) })),
    );

    expect(url).toBe("/t/team-1/schedule?error=invalid-location");
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("redirects with ?error=access when the caller is a parent or the team is archived", async () => {
    requireTeamAccess.mockRejectedValue(
      new TeamAccessError("Requires COACH", "insufficient-role"),
    );

    const url = await redirectUrlOf(() => createEventAction(form(validEvent)));

    expect(url).toBe("/t/team-1/schedule?error=access");
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("throws on a missing team id rather than guessing", async () => {
    const data = form(validEvent);
    data.delete("teamId");

    await expect(createEventAction(data)).rejects.toThrow("Invalid team ID");
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

    expect(url).toBe("/t/team-1/schedule");
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it("redirects to the event with a saved flag on success", async () => {
    const url = await redirectUrlOf(() => updateEventAction(updateForm));

    expect(url).toBe("/t/team-1/schedule/event-1?saved=1");
  });

  it("sends validation errors back to the event page, not the schedule", async () => {
    const url = await redirectUrlOf(() =>
      updateEventAction(form({ ...validEvent, eventId: "event-1", startsAt: "" })),
    );

    expect(url).toBe("/t/team-1/schedule/event-1?error=invalid-datetime");
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
    expect(url).toBe("/t/team-1/schedule");
  });

  it("redirects with ?error=access for a parent or an archived team", async () => {
    requireTeamAccess.mockRejectedValue(new TeamAccessError("archived", "archived"));

    const url = await redirectUrlOf(() => deleteEventAction(deleteForm));

    expect(url).toBe("/t/team-1/schedule/event-1?error=access");
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

  it("upserts attending: true for an attending response", async () => {
    await redirectUrlOf(() => rsvpAction(rsvpForm));

    expect(upsertRsvp).toHaveBeenCalledWith("event-1", "player-1", true);
  });

  it("upserts attending: false for a declined response", async () => {
    await redirectUrlOf(() =>
      rsvpAction(form({ ...Object.fromEntries(rsvpForm), response: "declined" })),
    );

    expect(upsertRsvp).toHaveBeenCalledWith("event-1", "player-1", false);
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

  it("refuses to write when the caller does not guard the named player", async () => {
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["someone-elses-kid"]));

    const url = await redirectUrlOf(() => rsvpAction(rsvpForm));

    expect(url).toBe("/t/team-1/schedule/event-1?error=not-your-player");
    expect(upsertRsvp).not.toHaveBeenCalled();
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
