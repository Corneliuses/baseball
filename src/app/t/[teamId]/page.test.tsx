import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const getTeamById = vi.fn();
const listCoachContacts = vi.fn();
const nextEvent = vi.fn();
const guardedRosteredPlayerIds = vi.fn();
const listEventRsvps = vi.fn();
const getChart = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: (...args: unknown[]) => getTeamById(...args),
}));

vi.mock("@/lib/memberships", () => ({
  listCoachContacts: (...args: unknown[]) => listCoachContacts(...args),
}));

vi.mock("@/lib/schedule", () => ({
  nextEvent: (...args: unknown[]) => nextEvent(...args),
}));

vi.mock("@/lib/rsvps", () => ({
  guardedRosteredPlayerIds: (...args: unknown[]) => guardedRosteredPlayerIds(...args),
  listEventRsvps: (...args: unknown[]) => listEventRsvps(...args),
}));

vi.mock("@/lib/roster", () => ({
  getChart: (...args: unknown[]) => getChart(...args),
}));

/// The page renders the action as a form `action={}`; it is never called in
/// these tests, but importing the real module would pull in the database.
vi.mock("./schedule/actions", () => ({
  rsvpAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import TeamHomePage from "./page";

/// 6:00 PM Central on 15 August 2026 (CDT, UTC-5).
const GAME = {
  id: "event-1",
  type: "GAME" as const,
  startsAt: new Date("2026-08-15T23:00:00Z"),
  location: "Field 3",
  opponent: "Hawks",
  notes: null,
};

const PRACTICE = {
  id: "event-2",
  type: "PRACTICE" as const,
  startsAt: new Date("2026-08-12T23:00:00Z"),
  location: null,
  opponent: null,
  notes: "Bring a bat",
};

const REESE = {
  entryId: "entry-1",
  playerId: "player-1",
  playerName: "Reese",
  jerseyNumber: 12,
  battingOrder: 3,
  position: "SHORTSTOP" as const,
};

async function render(
  teamId = "team-1",
  searchParams: { error?: string; saved?: string } = {},
) {
  return renderToStaticMarkup(
    await TeamHomePage({
      params: Promise.resolve({ teamId }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

/// The page reads the clock to decide whether the next event has already
/// started, so these tests pin it. Well before both fixtures below.
const BEFORE_BOTH = new Date("2026-08-10T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(BEFORE_BOTH);
  requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
  listCoachContacts.mockResolvedValue([]);
  nextEvent.mockResolvedValue(null);
  guardedRosteredPlayerIds.mockResolvedValue(new Set());
  listEventRsvps.mockResolvedValue([]);
  getChart.mockResolvedValue([]);
  getTeamById.mockResolvedValue({
    id: "team-1",
    name: "Sluggers",
    season: "Fall 2026",
    allPlay: true,
    archivedAt: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TeamHomePage", () => {
  // Navigation moved to the layout's persistent TeamNav — its role gating is
  // covered in src/components/TeamNav.test.tsx. The old wall of outline buttons
  // must not creep back in. Pinned by destination rather than by "no team link
  // at all", which is what it used to say: #48's next-event card links to that
  // event, and that link is content — the thing the card is about — not
  // navigation to a section of the app.
  it("renders the team facts and no navigation links of its own", async () => {
    const html = await render();

    expect(html).toContain("Fall 2026");
    expect(html).toContain("All players bat and field");
    for (const section of ["roster", "chart", "directory", "settings", "members"]) {
      expect(html).not.toContain(`href="/t/team-1/${section}"`);
    }
  });

  it("flags an archived team as read-only", async () => {
    getTeamById.mockResolvedValue({
      id: "team-1",
      name: "Sluggers",
      season: "Fall 2026",
      allPlay: true,
      archivedAt: new Date("2026-01-01T00:00:00Z"),
    });

    const html = await render();

    expect(html).toContain("archived and read-only");
  });
});

describe("TeamHomePage next event", () => {
  it("shows the next game with its time, place and a link to the event", async () => {
    nextEvent.mockResolvedValue(GAME);

    const html = await render();

    expect(nextEvent).toHaveBeenCalledWith("team-1", BEFORE_BOTH);
    expect(html).toContain("Game vs Hawks");
    expect(html).toContain("Aug 15");
    expect(html).toContain("6:00");
    expect(html).toContain("Field 3");
    expect(html).toContain('href="/t/team-1/schedule/event-1"');
  });

  // Unlike readiness (#12), which is checking a chart a practice doesn't have.
  // A parent still has to drive to the practice.
  it("shows a practice too, with its notes", async () => {
    nextEvent.mockResolvedValue(PRACTICE);

    const html = await render();

    expect(html).toContain("Practice");
    expect(html).toContain("Bring a bat");
    expect(html).toContain("No location set.");
  });

  it("links the location to a map", async () => {
    nextEvent.mockResolvedValue(GAME);

    const html = await render();

    expect(html).toContain("https://maps.google.com/?q=Field%203");
  });

  it("says so quietly when nothing is scheduled", async () => {
    const html = await render();

    expect(html).toContain("Nothing scheduled yet");
    expect(html).not.toContain("Going");
  });

  it("shows the card to a coach as well as a parent", async () => {
    nextEvent.mockResolvedValue(GAME);
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });

    const html = await render();

    expect(html).toContain("Game vs Hawks");
  });
});

describe("TeamHomePage your players", () => {
  beforeEach(() => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });
    nextEvent.mockResolvedValue(GAME);
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["player-1"]));
    getChart.mockResolvedValue([REESE]);
  });

  it("summarises jersey, batting slot and position in one line", async () => {
    const html = await render();

    expect(guardedRosteredPlayerIds).toHaveBeenCalledWith("team-1", "user-1");
    expect(html).toContain("Reese");
    expect(html).toContain("#12");
    expect(html).toContain("Bats 3rd · SS");
  });

  // The rule fieldedPositions exists for — and the reason chartRole is shared
  // with the readiness page rather than copied.
  it("reads a null position as OF on an allPlay team", async () => {
    getChart.mockResolvedValue([{ ...REESE, position: null }]);

    const html = await render();

    expect(html).toContain("Bats 3rd · OF");
  });

  it("reads a null position as Bench on a selective team", async () => {
    getTeamById.mockResolvedValue({
      id: "team-1",
      name: "Sluggers",
      season: "Fall 2026",
      allPlay: false,
      archivedAt: null,
    });
    getChart.mockResolvedValue([
      { ...REESE, position: null, battingOrder: null },
      // A teammate who is placed: "Bench" is only meaningful on a team that
      // has a chart to be left out of.
      { ...REESE, entryId: "entry-9", playerId: "player-9", playerName: "Kit" },
    ]);

    const html = await render();

    expect(html).toContain("Bench");
  });

  // The view page's rule, which team home contradicted: a kid batting third
  // with no fielding spot is in the order. Calling that Bench would both
  // misdescribe a kid who is playing and disagree with /view, which lists them
  // in the order and on no bench at all.
  it("never calls a kid who is in the batting order benched", async () => {
    getTeamById.mockResolvedValue({
      id: "team-1",
      name: "Sluggers",
      season: "Fall 2026",
      allPlay: false,
      archivedAt: null,
    });
    getChart.mockResolvedValue([{ ...REESE, position: null }]);

    const html = await render();

    expect(html).toContain("Bats 3rd");
    expect(html).not.toContain("Bench");
  });

  // /view renders "No chart set yet" for the same data. Printing OF for every
  // kid on an allPlay team would assert a spot nobody has assigned.
  it("says no chart is set rather than inventing a position", async () => {
    getChart.mockResolvedValue([
      { ...REESE, battingOrder: null, position: null },
      { ...REESE, entryId: "entry-9", playerId: "player-9", battingOrder: null, position: null },
    ]);

    const html = await render();

    expect(html).toContain("No chart set yet");
    expect(html).not.toContain("OF");
    expect(html).not.toContain("Bench");
  });

  it("never shows another family's kid", async () => {
    getChart.mockResolvedValue([
      REESE,
      {
        entryId: "entry-2",
        playerId: "player-2",
        playerName: "SomeoneElse",
        jerseyNumber: 7,
        battingOrder: 1,
        position: "PITCHER" as const,
      },
    ]);

    const html = await render();

    expect(html).toContain("Reese");
    expect(html).not.toContain("SomeoneElse");
  });

  // getChart is a findMany with no orderBy, so an unsorted render would swap
  // two siblings between requests on the page a parent checks most often.
  it("orders siblings by jersey, not by whatever the query returned", async () => {
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["player-1", "player-3"]));
    // Deliberately handed over out of order — a page that renders the query's
    // order verbatim puts Reese (#12) first and fails here.
    getChart.mockResolvedValue([
      REESE,
      {
        ...REESE,
        entryId: "entry-3",
        playerId: "player-3",
        playerName: "Sam",
        jerseyNumber: 4,
      },
    ]);

    const html = await render();

    expect(html.indexOf("Sam")).toBeLessThan(html.indexOf("Reese"));
  });

  it("renders nothing at all for a member guarding no kids on this team", async () => {
    guardedRosteredPlayerIds.mockResolvedValue(new Set());

    const html = await render();

    expect(html).not.toContain("Your player");
    expect(html).not.toContain("Going");
    expect(getChart).not.toHaveBeenCalled();
    expect(listEventRsvps).not.toHaveBeenCalled();
  });
});

describe("TeamHomePage one-tap RSVP", () => {
  beforeEach(() => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });
    nextEvent.mockResolvedValue(GAME);
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["player-1"]));
    getChart.mockResolvedValue([REESE]);
  });

  it("posts both responses for the next event, marked as coming from home", async () => {
    const html = await render();

    expect(listEventRsvps).toHaveBeenCalledWith("team-1", "event-1");
    expect(html).toContain("Going");
    expect(html).toContain("Not going");
    expect(html).toContain('name="from" value="home"');
    expect(html).toContain('name="eventId" value="event-1"');
    expect(html).toContain('name="playerId" value="player-1"');
    expect(html).toContain('name="response" value="attending"');
    expect(html).toContain('name="response" value="declined"');
  });

  // Both the badge and the button have to move: "Going" appears on this page
  // whatever the answer is, so asserting that string alone would pass against
  // a page that ignored the RSVP entirely.
  it("shows the current answer, so a tap is a change and not a guess", async () => {
    listEventRsvps.mockResolvedValue([{ playerId: "player-1", attending: true }]);

    const html = await render();

    // The attending badge's own colour (RSVP_STYLE), and the Going button
    // filled rather than outlined.
    expect(html).toContain("text-primary");
    expect(html).toContain("bg-primary");
    expect(html).not.toContain("bg-destructive");
  });

  it("marks the declined answer instead when the family said no", async () => {
    listEventRsvps.mockResolvedValue([{ playerId: "player-1", attending: false }]);

    const html = await render();

    expect(html).toContain("Not going");
    expect(html).toContain("text-destructive");
    expect(html).toContain("bg-destructive");
    expect(html).not.toContain("bg-primary");
  });

  // no-response is a distinct state from declined — it means the family hasn't
  // answered, never that they said no.
  it("shows no-response rather than assuming an answer", async () => {
    const html = await render();

    expect(html).toContain("No response");
  });

  // AC 4: the write-rejection copy problem must not reappear. An archived team
  // rejects every write, so the buttons are hidden rather than shown and
  // refused — but the summary is still worth reading.
  it("hides the buttons on an archived team but keeps the summary", async () => {
    getTeamById.mockResolvedValue({
      id: "team-1",
      name: "Sluggers",
      season: "Fall 2026",
      allPlay: true,
      archivedAt: new Date("2026-01-01T00:00:00Z"),
    });

    const html = await render();

    expect(html).toContain("Bats 3rd · SS");
    expect(html).not.toContain("Not going");
    expect(html).not.toContain('name="from" value="home"');
  });

  it("renders no buttons when there is no event to answer for", async () => {
    nextEvent.mockResolvedValue(null);

    const html = await render();

    expect(html).toContain("Bats 3rd · SS");
    expect(html).not.toContain('name="from" value="home"');
    expect(listEventRsvps).not.toHaveBeenCalled();
  });

  // GAME_GRACE_MS keeps an event on the card for three hours after it starts,
  // which is right for a card that says "you are standing at this one" — but
  // that same id is the target of a write. On a doubleheader morning, tapping
  // "Not going" at 11am would otherwise decline the 9am game already played.
  it("stops offering to answer for an event that has already started", async () => {
    vi.setSystemTime(new Date(GAME.startsAt.getTime() + 40 * 60 * 1000));

    const html = await render();

    expect(html).toContain("Game vs Hawks");
    expect(html).not.toContain('name="from" value="home"');
    expect(html).not.toContain("Not going");
  });

  it("still shows the answer already given for an event in progress", async () => {
    vi.setSystemTime(new Date(GAME.startsAt.getTime() + 40 * 60 * 1000));
    listEventRsvps.mockResolvedValue([{ playerId: "player-1", attending: true }]);

    const html = await render();

    expect(html).toContain("text-primary");
  });

  it("still offers to answer right up to the start time", async () => {
    vi.setSystemTime(new Date(GAME.startsAt.getTime() - 1000));

    const html = await render();

    expect(html).toContain('name="from" value="home"');
  });

  it("reports what the action refused, in the parent's own words", async () => {
    const html = await render("team-1", { error: "access" });

    expect(html).toContain("You no longer have access to make this change.");
  });

  // The ?error= key is attacker-chosen. On a plain object literal
  // ?error=constructor resolves an Object.prototype member — truthy, so the
  // fallback never fires — and React throws on the non-renderable child.
  it("falls back rather than resolving an inherited member of the message table", async () => {
    for (const key of ["constructor", "__proto__", "toString"]) {
      const html = await render("team-1", { error: key });

      expect(html).toContain("Something went wrong.");
    }
  });

  it("confirms a saved RSVP", async () => {
    const html = await render("team-1", { saved: "1" });

    expect(html).toContain("Saved.");
  });

  it("prefers the error over the saved flag when both are present", async () => {
    const html = await render("team-1", { saved: "1", error: "event-gone" });

    expect(html).toContain("taken off the schedule");
    expect(html).not.toContain("Saved.");
  });
});

describe("TeamHomePage coach contacts", () => {
  const STAFF = [
    {
      userId: "user-9",
      role: "OWNER",
      name: "Mel",
      email: "mel@example.com",
      phone: "555-9876",
    },
    {
      userId: "user-8",
      role: "COACH",
      name: "Pat",
      email: "pat@example.com",
      phone: null,
    },
  ];

  it("shows a parent the coaching staff's contact card", async () => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });
    listCoachContacts.mockResolvedValue(STAFF);

    const html = await render();

    expect(listCoachContacts).toHaveBeenCalledWith("team-1");
    expect(html).toContain("Coaches");
    expect(html).toContain('href="mailto:mel@example.com"');
    expect(html).toContain('href="tel:555-9876"');
    expect(html).toContain("Pat");
  });

  it("does not fetch or render the card for a coach", async () => {
    const html = await render();

    expect(listCoachContacts).not.toHaveBeenCalled();
    expect(html).not.toContain("Coaches");
  });
});
