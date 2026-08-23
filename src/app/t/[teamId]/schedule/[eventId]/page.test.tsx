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

vi.mock("@/lib/teams", () => ({
  getTeamById: (...args: unknown[]) => getTeamById(...args),
}));

vi.mock("@/lib/rsvps", () => ({
  listEventRsvps: (...args: unknown[]) => listEventRsvps(...args),
  guardedRosteredPlayerIds: (...args: unknown[]) => guardedRosteredPlayerIds(...args),
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
import EventPage from "./page";

const game = {
  id: "event-1",
  type: "GAME" as const,
  // 6:00 PM Central on 15 August 2026 (CDT, UTC-5).
  startsAt: new Date("2026-08-15T23:00:00Z"),
  location: "Field 3",
  opponent: "Hawks",
  notes: "Bring water",
};

async function render(searchParams: Record<string, string> = {}) {
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

const team = {
  id: "team-1",
  name: "Cubs",
  season: "Fall 2026",
  allPlay: true,
  archivedAt: null as Date | null,
  createdAt: new Date("2026-07-01T00:00:00Z"),
  calendarToken: "token",
};

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
  getEvent.mockResolvedValue(game);
  getTeamById.mockResolvedValue(team);
  getRoster.mockResolvedValue([]);
  listEventRsvps.mockResolvedValue([]);
  guardedRosteredPlayerIds.mockResolvedValue(new Set());
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

  it("explains a not-on-team refusal from the staff RSVP path", async () => {
    expect(await render({ error: "not-on-team" })).toContain(
      "That player is not on this team&#x27;s roster.",
    );
  });
});

describe("EventPage attendance", () => {
  it("shows a placeholder when the roster is empty", async () => {
    expect(await render()).toContain("No players on the roster yet.");
  });

  it("labels all three RSVP states distinctly in one render", async () => {
    getRoster.mockResolvedValue(rosterOfThree);
    listEventRsvps.mockResolvedValue([
      { playerId: "ava", attending: true, recordedById: null },
      { playerId: "ben", attending: false, recordedById: null },
      // Cy has no row at all — the third state.
    ]);

    const html = await render();

    expect(html).toContain("Going");
    expect(html).toContain("Not going");
    expect(html).toContain("No response");
  });

  it("styles no-response differently from declined, not just labels it", async () => {
    getRoster.mockResolvedValue(rosterOfThree);
    listEventRsvps.mockResolvedValue([
      { playerId: "ben", attending: false, recordedById: null },
    ]);

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

  it("offers a parent Going / Not going toggles only for players they guard", async () => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });
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

  // #54: staff answer for any rostered player — the coach's texted-absence
  // path. The action re-checks the role; this only renders the controls.
  it("offers a coach toggles on every row, guarded or not", async () => {
    getRoster.mockResolvedValue(roster);
    guardedRosteredPlayerIds.mockResolvedValue(new Set());

    const html = await render();

    expect(html.split('value="ava"').length - 1).toBe(2);
    expect(html.split('value="ben"').length - 1).toBe(2);
  });

  it("offers a coach Clear only where a response exists to clear", async () => {
    getRoster.mockResolvedValue(roster);
    listEventRsvps.mockResolvedValue([
      { playerId: "ava", attending: false, recordedById: null },
    ]);

    const html = await render();

    expect(html).toContain("Clear");
    // Ava has a row (three forms: Going / Not going / Clear); Ben has no
    // response, so there is nothing to clear and only the two toggles render.
    expect(html.split('value="ava"').length - 1).toBe(3);
    expect(html.split('value="ben"').length - 1).toBe(2);
  });

  it("never offers Clear to a parent, even on their own kid", async () => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });
    getRoster.mockResolvedValue(roster);
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["ava"]));
    listEventRsvps.mockResolvedValue([
      { playerId: "ava", attending: false, recordedById: null },
    ]);

    expect(await render()).not.toContain("Clear");
  });

  // AC2: a staff-recorded response is visually distinguishable — and the note
  // is text, so it reads the same for the family it is explaining things to.
  it("marks a staff-recorded response with a note beside the badge", async () => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });
    getRoster.mockResolvedValue(roster);
    listEventRsvps.mockResolvedValue([
      { playerId: "ava", attending: false, recordedById: "coach-1" },
      { playerId: "ben", attending: false, recordedById: null },
    ]);

    const html = await render();

    expect(html.split("Recorded by coach").length - 1).toBe(1);
  });

  it("shows no provenance note when every response is family-recorded", async () => {
    getRoster.mockResolvedValue(roster);
    listEventRsvps.mockResolvedValue([
      { playerId: "ava", attending: true, recordedById: null },
    ]);

    expect(await render()).not.toContain("Recorded by coach");
  });

  // Archived teams reject every write server-side, so the buttons are hidden
  // rather than shown and refused — same rule as team home's teamIsWritable.
  it("renders no RSVP controls on an archived team, for staff or family", async () => {
    getTeamById.mockResolvedValue({
      ...team,
      archivedAt: new Date("2026-08-01T00:00:00Z"),
    });
    getRoster.mockResolvedValue(roster);
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["ava"]));
    listEventRsvps.mockResolvedValue([
      { playerId: "ava", attending: false, recordedById: null },
    ]);

    const html = await render();

    // The states still read; only the writes disappear.
    expect(html).toContain("Not going");
    expect(html.split('value="ava"').length - 1).toBe(0);
    expect(html.split('value="ben"').length - 1).toBe(0);
    expect(html).not.toContain("Clear");
  });

  // A coach's list renders identical button labels on every row, so each
  // control carries the player's name for screen-reader and voice users.
  it("names the player in each RSVP button's accessible name", async () => {
    getRoster.mockResolvedValue(roster);
    listEventRsvps.mockResolvedValue([
      { playerId: "ava", attending: false, recordedById: null },
    ]);

    const html = await render();

    expect(html).toContain('aria-label="Ava is going"');
    expect(html).toContain('aria-label="Ava is not going"');
    expect(html).toContain('aria-label="Clear Ava&#x27;s response"');
    expect(html).toContain('aria-label="Ben is going"');
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

describe("EventPage duplicate", () => {
  it("offers a coach a Duplicate link into the add form's anchor", async () => {
    // Entering a season is the same fixture over and over, so the fastest new
    // event is a copy of an old one (#51 / C1). A link, not a mutation: a
    // clone would put a wrongly-dated fixture on the real schedule — pushing
    // RSVPs and the calendar feed — until somebody noticed.
    const html = await render();

    expect(html).toContain("duplicate=event-1");
    expect(html).toContain("#add-event");
    expect(html).toContain("Duplicate event");
  });

  it("hides it from a parent, who cannot add events", async () => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "u-1" });

    const html = await render();

    expect(html).not.toContain("Duplicate event");
  });

  it("carries the schedule the coach came from into the copy", async () => {
    const html = await render({ view: "list", past: "1" });

    expect(html).toContain("view=list");
  });
});

describe("EventPage return context", () => {
  it("sends the back link to the view the event was opened from", async () => {
    // Without this a coach working down a list is dropped onto this month's
    // grid the moment they open an event and come back.
    const html = await render({ view: "list" });

    expect(html).toContain('href="/t/team-1/schedule?view=list"');
  });

  it("posts that context with the edit and delete forms", async () => {
    const html = await render({ view: "list", confirm: "delete" });

    expect(html).toContain('name="view" value="list"');
  });

  it("falls back to the month grid when it was opened without context", async () => {
    const html = await render();

    expect(html).toContain('href="/t/team-1/schedule?view=month&amp;month=');
  });
});
