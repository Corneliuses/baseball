import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const getEvent = vi.fn();
const getRoster = vi.fn();
const listEventRsvps = vi.fn();
const guardedRosteredPlayerIds = vi.fn();
const getTeamById = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/schedule", () => ({
  getEvent: (...args: unknown[]) => getEvent(...args),
}));

vi.mock("@/lib/roster", () => ({
  getRoster: (...args: unknown[]) => getRoster(...args),
}));

vi.mock("@/lib/rsvps", () => ({
  listEventRsvps: (...args: unknown[]) => listEventRsvps(...args),
  guardedRosteredPlayerIds: (...args: unknown[]) => guardedRosteredPlayerIds(...args),
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: (...args: unknown[]) => getTeamById(...args),
}));

vi.mock("../actions", () => ({
  updateEventAction: vi.fn(),
  deleteEventAction: vi.fn(),
  rsvpAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { TeamAccessError } from "@/lib/team-access";

const game = {
  id: "event-1",
  type: "GAME" as const,
  // 6:00 PM Central on 15 August 2026 (CDT, UTC-5). In the past relative to
  // any real test run, so RSVP-button tests use futureGame below.
  startsAt: new Date("2026-08-15T23:00:00Z"),
  location: "Field 3",
  opponent: "Hawks",
  notes: "Bring water",
};

/// RSVPs close for past events, so tests asserting live RSVP controls pin a
/// date that stays in the future.
const futureGame = { ...game, startsAt: new Date("2100-08-15T23:00:00Z") };

async function render(searchParams: Record<string, string> = {}) {
  const { default: EventPage } = await import("./page");
  return renderToStaticMarkup(
    await EventPage({
      params: Promise.resolve({ teamId: "team-1", eventId: "event-1" }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

const roster = [
  { id: "entry-1", jerseyNumber: 7, player: { id: "ava", name: "Ava", dateOfBirth: null } },
  { id: "entry-2", jerseyNumber: 12, player: { id: "ben", name: "Ben", dateOfBirth: null } },
];

const rosterOfThree = [
  ...roster,
  { id: "entry-3", jerseyNumber: 3, player: { id: "cy", name: "Cy", dateOfBirth: null } },
];

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
  getEvent.mockResolvedValue(game);
  getRoster.mockResolvedValue([]);
  listEventRsvps.mockResolvedValue([]);
  guardedRosteredPlayerIds.mockResolvedValue(new Set());
  getTeamById.mockResolvedValue({
    id: "team-1",
    name: "Sharks",
    allPlay: true,
    archivedAt: null,
  });
});

describe("EventPage access", () => {
  it("scopes the lookup to the team in the URL", async () => {
    await render();

    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", { intent: "read" });
    expect(getEvent).toHaveBeenCalledWith("team-1", "event-1");
  });

  it("is readable by a parent", async () => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });

    await expect(render()).resolves.toBeDefined();
  });

  it("calls notFound() for someone with no membership", async () => {
    requireTeamAccess.mockRejectedValue(
      new TeamAccessError("nope", "no-membership"),
    );

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("calls notFound() for an event on another team", async () => {
    getEvent.mockResolvedValue(null);

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("lets a database outage propagate rather than reporting a 404", async () => {
    getEvent.mockRejectedValue(new Error("connection refused"));

    await expect(render()).rejects.toThrow("connection refused");
  });
});

describe("EventPage details", () => {
  it("renders the event in Central time, not UTC", async () => {
    const html = await render();

    expect(html).toContain("Game vs Hawks");
    expect(html).toContain("Sat, Aug 15, 2026 at 6:00 PM");
    expect(html).toContain("Field 3");
    expect(html).toContain("Bring water");
  });

  it("names a practice without an opponent", async () => {
    getEvent.mockResolvedValue({
      ...game,
      type: "PRACTICE",
      opponent: null,
      notes: null,
    });

    expect(await render()).toContain("Practice");
  });

  it("handles a game with no opponent recorded", async () => {
    getEvent.mockResolvedValue({ ...game, opponent: null });

    const html = await render();

    expect(html).toContain("Game");
    expect(html).not.toContain("vs ");
  });

  it("shows a placeholder when no location is set", async () => {
    getEvent.mockResolvedValue({ ...game, location: null });

    expect(await render()).toContain("No location set.");
  });
});

describe("EventPage coach controls", () => {
  it("pre-fills the edit form with the Central wall clock", async () => {
    const html = await render();

    expect(html).toContain("Edit event");
    // Not 2026-08-15T23:00, which is the UTC instant.
    expect(html).toContain('value="2026-08-15T18:00"');
  });

  it("hides edit and delete from a parent", async () => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });

    const html = await render();

    expect(html).not.toContain("Edit event");
    expect(html).not.toContain("Delete event");
  });

  it("shows an owner the controls", async () => {
    requireTeamAccess.mockResolvedValue({ role: "OWNER", userId: "user-1" });

    expect(await render()).toContain("Edit event");
  });

  it("asks for confirmation before offering the delete button", async () => {
    const html = await render();

    expect(html).toContain("confirm=delete");
    expect(html).not.toContain("Yes, delete it");
  });

  it("warns that RSVPs go with the event once confirming", async () => {
    const html = await render({ confirm: "delete" });

    expect(html).toContain("Yes, delete it");
    expect(html).toContain("Permanently delete this event and its RSVPs?");
    expect(html).toContain("Cancel");
  });

  it("does not offer the confirm step to a parent", async () => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });

    expect(await render({ confirm: "delete" })).not.toContain("Yes, delete it");
  });
});

describe("EventPage feedback", () => {
  it("renders a known error message", async () => {
    expect(await render({ error: "invalid-datetime" })).toContain(
      "Enter a valid date and time.",
    );
  });

  it("confirms a save", async () => {
    expect(await render({ saved: "1" })).toContain("Saved.");
  });
});

describe("EventPage attendance", () => {
  it("shows a placeholder when the roster is empty", async () => {
    expect(await render()).toContain("No players on the roster yet.");
  });

  it("labels all three RSVP states distinctly in one render", async () => {
    getRoster.mockResolvedValue(rosterOfThree);
    listEventRsvps.mockResolvedValue([
      { playerId: "ava", attending: true },
      { playerId: "ben", attending: false },
      // Cy has no row at all — the third state.
    ]);

    const html = await render();

    expect(html).toContain("Going");
    expect(html).toContain("Not going");
    expect(html).toContain("No response");
  });

  it("styles no-response differently from declined, not just labels it", async () => {
    getRoster.mockResolvedValue(rosterOfThree);
    listEventRsvps.mockResolvedValue([{ playerId: "ben", attending: false }]);

    const html = await render();

    // The AC is a *visual* distinction, so assert the badge classes differ
    // rather than trusting the two labels alone. Matched with the full class
    // attribute: a bare "text-destructive" is also a substring of the delete
    // button's "text-destructive-foreground" and would pass vacuously.
    expect(html).toContain('class="text-xs text-destructive"');
    expect(html).toContain('class="text-xs text-muted-foreground"');
  });

  it("defaults every player with no Rsvp row to no-response", async () => {
    getRoster.mockResolvedValue(roster);
    listEventRsvps.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain("No response");
  });

  it("offers Going / Not going toggles only for players the caller guards", async () => {
    getEvent.mockResolvedValue(futureGame);
    getRoster.mockResolvedValue(roster);
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["ava"]));

    const html = await render();

    // Ava's row carries two rsvpAction forms (Going / Not going), each with a
    // hidden playerId input; Ben isn't guarded, so his row has none.
    const avaFormCount = html.split('value="ava"').length - 1;
    const benFormCount = html.split('value="ben"').length - 1;
    expect(avaFormCount).toBe(2);
    expect(benFormCount).toBe(0);
  });

  it("adds a Clear button once a guarded player has a response", async () => {
    getEvent.mockResolvedValue(futureGame);
    getRoster.mockResolvedValue(roster);
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["ava"]));
    listEventRsvps.mockResolvedValue([{ playerId: "ava", attending: true }]);

    const html = await render();

    // Going + Not going + Clear = three rsvpAction forms for Ava.
    expect(html.split('value="ava"').length - 1).toBe(3);
    expect(html).toContain("Clear");
    expect(html).toContain('value="clear"');
  });

  it("offers no Clear button while a player is still at no-response", async () => {
    getEvent.mockResolvedValue(futureGame);
    getRoster.mockResolvedValue(roster);
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["ava"]));

    const html = await render();

    expect(html).not.toContain('value="clear"');
  });

  it("closes RSVPs for a past event, keeping the states visible", async () => {
    // The shared fixture's 2026 date is already past.
    getRoster.mockResolvedValue(roster);
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["ava"]));
    listEventRsvps.mockResolvedValue([{ playerId: "ava", attending: true }]);

    const html = await render();

    expect(html).toContain("This event has already happened, so RSVPs are closed.");
    // The state badge stays; the buttons go.
    expect(html).toContain("Going");
    expect(html.split('value="ava"').length - 1).toBe(0);
  });

  it("closes RSVPs on an archived team and says why", async () => {
    getEvent.mockResolvedValue(futureGame);
    getTeamById.mockResolvedValue({
      id: "team-1",
      name: "Sharks",
      allPlay: true,
      archivedAt: new Date("2026-08-01"),
    });
    getRoster.mockResolvedValue(roster);
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["ava"]));

    const html = await render();

    expect(html).toContain("This team is archived and read-only");
    expect(html.split('value="ava"').length - 1).toBe(0);
  });

  it("hides the edit and delete controls on an archived team", async () => {
    getEvent.mockResolvedValue(futureGame);
    getTeamById.mockResolvedValue({
      id: "team-1",
      name: "Sharks",
      allPlay: true,
      archivedAt: new Date("2026-08-01"),
    });

    const html = await render();

    expect(html).not.toContain("Edit event");
    expect(html).not.toContain("Delete event");
  });

  it("lists players in the same order as the roster page, not database order", async () => {
    // getRoster has no orderBy, so the page must sort. Jerseys 7, 12, 3 come
    // back in that order and must render as 3, 7, 12 — matching sortRoster.
    getRoster.mockResolvedValue(rosterOfThree);

    const html = await render();

    expect(html.indexOf("Cy")).toBeLessThan(html.indexOf("Ava"));
    expect(html.indexOf("Ava")).toBeLessThan(html.indexOf("Ben"));
  });

  it("renders the attendance card for a practice, not just games", async () => {
    getEvent.mockResolvedValue({ ...game, type: "PRACTICE", opponent: null, notes: null });
    getRoster.mockResolvedValue(roster);

    const html = await render();

    expect(html).toContain("Attendance");
    expect(html).toContain("Ava");
  });

  it("scopes the roster, RSVP, and guardian lookups to this team and event", async () => {
    await render();

    expect(getRoster).toHaveBeenCalledWith("team-1");
    expect(listEventRsvps).toHaveBeenCalledWith("team-1", "event-1");
    expect(guardedRosteredPlayerIds).toHaveBeenCalledWith("team-1", "user-1");
  });
});

describe("EventPage location", () => {
  it("links the location to a map", async () => {
    const html = await render();

    expect(html).toContain("https://maps.google.com/?q=Field%203");
  });

  it("shows a quiet placeholder when no location is set", async () => {
    getEvent.mockResolvedValue({ ...game, location: null });

    const html = await render();

    expect(html).toContain("No location set.");
    expect(html).not.toContain("maps.google.com");
  });
});
