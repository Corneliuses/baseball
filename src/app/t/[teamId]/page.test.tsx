import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const getTeamById = vi.fn();
const listCoachContacts = vi.fn();
const nextEvents = vi.fn();
const guardedRosteredPlayerIds = vi.fn();
const listRsvpsForEvents = vi.fn();
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
  nextEvents: (...args: unknown[]) => nextEvents(...args),
}));

vi.mock("@/lib/rsvps", () => ({
  guardedRosteredPlayerIds: (...args: unknown[]) => guardedRosteredPlayerIds(...args),
  listRsvpsForEvents: (...args: unknown[]) => listRsvpsForEvents(...args),
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
import { POSITION_COORDS } from "@/components/diamond-geometry";
import { heroViewBox } from "@/components/MiniDiamondHero";

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

const LATER_GAME = {
  id: "event-3",
  type: "GAME" as const,
  startsAt: new Date("2026-08-22T23:00:00Z"),
  location: "Field 1",
  opponent: "Bears",
  notes: null,
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
  nextEvents.mockResolvedValue([]);
  guardedRosteredPlayerIds.mockResolvedValue(new Set());
  listRsvpsForEvents.mockResolvedValue([]);
  getChart.mockResolvedValue([]);
  getTeamById.mockResolvedValue({
    id: "team-1",
    name: "Sluggers",
    season: "Fall 2026",
    allPlay: true,
    groupMeUrl: null,
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
      groupMeUrl: null,
      archivedAt: new Date("2026-01-01T00:00:00Z"),
    });

    const html = await render();

    expect(html).toContain("archived and read-only");
  });

  it("seats the team GroupMe in the bleachers when the owner has shared one", async () => {
    getTeamById.mockResolvedValue({
      id: "team-1",
      name: "Sluggers",
      season: "Fall 2026",
      allPlay: true,
      groupMeUrl: "https://groupme.com/join_group/12345678/AbCdEfGh",
      archivedAt: null,
    });

    const html = await render();

    expect(html).toContain("Bleacher chatter");
    expect(html).toContain(
      'href="https://groupme.com/join_group/12345678/AbCdEfGh"',
    );
    expect(html).toContain("Join the chatter");
  });

  it("says nothing about GroupMe when no link is set", async () => {
    const html = await render();

    expect(html).not.toContain("GroupMe");
    expect(html).not.toContain("Bleacher chatter");
  });
});

describe("TeamHomePage next event", () => {
  it("shows the next game with its time, place and a link to the event", async () => {
    nextEvents.mockResolvedValue([GAME]);

    const html = await render();

    expect(nextEvents).toHaveBeenCalledWith("team-1", 3, BEFORE_BOTH);
    expect(html).toContain("Game vs Hawks");
    expect(html).toContain("Aug 15");
    expect(html).toContain("6:00");
    expect(html).toContain("Field 3");
    expect(html).toContain('href="/t/team-1/schedule/event-1"');
  });

  // Unlike readiness (#12), which is checking a chart a practice doesn't have.
  // A parent still has to drive to the practice.
  it("shows a practice too, with its notes", async () => {
    nextEvents.mockResolvedValue([PRACTICE]);

    const html = await render();

    expect(html).toContain("Practice");
    expect(html).toContain("Bring a bat");
    expect(html).toContain("No location set.");
  });

  it("links the location to a map", async () => {
    nextEvents.mockResolvedValue([GAME]);

    const html = await render();

    expect(html).toContain("https://maps.google.com/?q=Field%203");
  });

  it("says so quietly when nothing is scheduled", async () => {
    const html = await render();

    expect(html).toContain("Nothing scheduled yet");
    expect(html).not.toContain("Going");
  });

  it("shows all three upcoming events, each with its own details link", async () => {
    nextEvents.mockResolvedValue([PRACTICE, GAME, LATER_GAME]);

    const html = await render();

    expect(html).toContain("Practice");
    expect(html).toContain("Game vs Hawks");
    expect(html).toContain("Game vs Bears");
    expect(html).toContain('href="/t/team-1/schedule/event-1"');
    expect(html).toContain('href="/t/team-1/schedule/event-2"');
    expect(html).toContain('href="/t/team-1/schedule/event-3"');
  });

  it("shows however many there are when the team has fewer than three", async () => {
    nextEvents.mockResolvedValue([PRACTICE, GAME]);

    const html = await render();

    expect(html).toContain("Game vs Hawks");
    expect(html).not.toContain("Bears");
  });

  // AC 5: the event cards are the *only* thing a coach's view gains. This
  // asserts both roles rather than one, because the criterion is about the two
  // being the same — an earlier version of this test named the coach and then
  // overrode the role to PARENT, so it never checked the half it was named for.
  it("shows the cards to a coach and to a parent alike", async () => {
    nextEvents.mockResolvedValue([GAME]);

    requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
    const coachHtml = await render();

    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });
    const parentHtml = await render();

    expect(coachHtml).toContain("Game vs Hawks");
    expect(parentHtml).toContain("Game vs Hawks");
    expect(coachHtml).toContain("Field 3");
    expect(parentHtml).toContain("Field 3");
  });
});

describe("TeamHomePage your players", () => {
  beforeEach(() => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });
    nextEvents.mockResolvedValue([GAME]);
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["player-1"]));
    getChart.mockResolvedValue([REESE]);
  });

  it("shows the name, the jersey number worn big, and the chart line", async () => {
    const html = await render();

    expect(guardedRosteredPlayerIds).toHaveBeenCalledWith("team-1", "user-1");
    expect(html).toContain("Reese");
    // The jersey number rides in a JerseyDot, not as "#12" prose — the number
    // itself is the card's celebration.
    expect(html).toContain(">12<");
    // chartRole's exact sentence stays in the DOM (the marquee uppercases by
    // CSS only), so this page, readiness and /view keep saying the same thing.
    expect(html).toContain("Bats 3rd · SS");
  });

  it("leaves the jersey dot off a kid with no number rather than inventing one", async () => {
    getChart.mockResolvedValue([{ ...REESE, jerseyNumber: null }]);

    const html = await render();

    expect(html).toContain("Reese");
    expect(html).toContain("Bats 3rd · SS");
  });

  // Design-plan §2: one banana per screen, and on this screen — as on /view —
  // the banana is the reader's own kid. The marquee goes yellow only for a kid
  // the chart actually seats.
  it("spends the screen's banana on a kid with a spot in the chart", async () => {
    const html = await render();

    expect(html).toContain("bg-banana");
  });

  it("keeps the banana in its pocket for a substitute", async () => {
    getTeamById.mockResolvedValue({
      id: "team-1",
      name: "Sluggers",
      season: "Fall 2026",
      allPlay: false,
      archivedAt: null,
    });
    getChart.mockResolvedValue([
      { ...REESE, position: null, battingOrder: null },
      { ...REESE, entryId: "entry-9", playerId: "player-9", playerName: "Kit" },
    ]);

    const html = await render();

    expect(html).toContain("Substitute");
    expect(html).not.toContain("bg-banana");
  });

  it("keeps the banana in its pocket when no chart is set", async () => {
    getChart.mockResolvedValue([
      { ...REESE, battingOrder: null, position: null },
      { ...REESE, entryId: "entry-9", playerId: "player-9", battingOrder: null, position: null },
    ]);

    const html = await render();

    expect(html).not.toContain("bg-banana");
  });

  // The mini-diamond hero: the kid standing on the painted field, cropped to
  // their spot. The same FieldArt and coordinates the lineup pages draw, so
  // the card is a close-up of the board the parent opens next.
  it("puts a fielded kid on the painted field, cropped to their position", async () => {
    getChart.mockResolvedValue([{ ...REESE, position: "SHORTSTOP" }]);
    getTeamById.mockResolvedValue({
      id: "team-1",
      name: "Sluggers",
      season: "Fall 2026",
      allPlay: false,
      archivedAt: null,
    });

    const html = await render();

    expect(html).toContain("fill-grass");
    expect(html).toContain(`viewBox="${heroViewBox(POSITION_COORDS.SHORTSTOP)}"`);
  });

  it("frames an allPlay kid with no position in the outfield zone", async () => {
    getChart.mockResolvedValue([{ ...REESE, position: null }]);

    const html = await render();

    // outfieldZoneCoords(1) is CENTER_FIELD's spot by construction.
    expect(html).toContain("fill-grass");
    expect(html).toContain(`viewBox="${heroViewBox(POSITION_COORDS.CENTER_FIELD)}"`);
  });

  // A selective team's kid who bats but doesn't field is celebrated (they're
  // in the order) yet stands on no field — drawing them at a position would
  // assert a spot nobody assigned, the same lie the big diamonds refuse.
  it("draws no field for an order-only kid, but still celebrates them", async () => {
    getTeamById.mockResolvedValue({
      id: "team-1",
      name: "Sluggers",
      season: "Fall 2026",
      allPlay: false,
      archivedAt: null,
    });
    getChart.mockResolvedValue([{ ...REESE, position: null }]);

    const html = await render();

    expect(html).toContain("bg-banana");
    expect(html).not.toContain("fill-grass");
  });

  it("draws no field for a substitute or when no chart is set", async () => {
    getTeamById.mockResolvedValue({
      id: "team-1",
      name: "Sluggers",
      season: "Fall 2026",
      allPlay: false,
      archivedAt: null,
    });
    // A substitute on a team that does have a chart (the teammate is placed).
    getChart.mockResolvedValue([
      { ...REESE, position: null, battingOrder: null },
      { ...REESE, entryId: "entry-9", playerId: "player-9", playerName: "Kit" },
    ]);
    const substituteHtml = await render();

    // No chart at all: with no spot assigned there is nothing to frame.
    getChart.mockResolvedValue([{ ...REESE, position: null, battingOrder: null }]);
    const noChartHtml = await render();

    expect(substituteHtml).not.toContain("fill-grass");
    expect(noChartHtml).not.toContain("fill-grass");
  });

  it("announces the cards with the staggered lineup rise", async () => {
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["player-1", "player-3"]));
    getChart.mockResolvedValue([
      REESE,
      { ...REESE, entryId: "entry-3", playerId: "player-3", playerName: "Sam", jerseyNumber: 4 },
    ]);

    const html = await render();

    expect(html).toContain("animate-rise");
    // Staggered per card, like a lineup being read out — the second card waits
    // its turn.
    expect(html).toContain("animation-delay:40ms");
  });

  // The rule fieldedPositions exists for — and the reason chartRole is shared
  // with the readiness page rather than copied.
  it("reads a null position as OF on an allPlay team", async () => {
    getChart.mockResolvedValue([{ ...REESE, position: null }]);

    const html = await render();

    expect(html).toContain("Bats 3rd · OF");
  });

  it("reads a null position as Substitute on a selective team", async () => {
    getTeamById.mockResolvedValue({
      id: "team-1",
      name: "Sluggers",
      season: "Fall 2026",
      allPlay: false,
      archivedAt: null,
    });
    getChart.mockResolvedValue([
      { ...REESE, position: null, battingOrder: null },
      // A teammate who is placed: "Substitute" is only meaningful on a team
      // that has a chart to be left out of.
      { ...REESE, entryId: "entry-9", playerId: "player-9", playerName: "Kit" },
    ]);

    const html = await render();

    // The softer word, by request — never "Bench" on a page a family reads.
    expect(html).toContain("Substitute");
    expect(html).not.toContain("Bench");
  });

  // The view page's rule, which team home contradicted: a kid batting third
  // with no fielding spot is in the order. Calling that a substitute would
  // both misdescribe a kid who is playing and disagree with /view, which lists
  // them in the order and in no substitutes card at all.
  it("never calls a kid who is in the batting order a substitute", async () => {
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
    expect(html).not.toContain("Substitute");
  });

  it("reads a named outfield spot as that spot on an allPlay team", async () => {
    // LF/CF/RF are placeable there since the named-outfield revision, so a
    // pinned kid's marquee names the spot rather than the general outfield.
    getChart.mockResolvedValue([{ ...REESE, position: "CENTER_FIELD" }]);

    const html = await render();

    expect(html).toContain("Bats 3rd · CF");
  });

  it("does not claim a spot for a kid the diamond cannot seat", async () => {
    // The regression: three kids left at CF the moment allPlay is switched off
    // is a board /view seats ONE of — it lists the other two as substitutes.
    // Team home read the position column straight and told all three families
    // "CF", so two of them stood in the wrong place on Saturday while the page
    // two taps away said otherwise. Reese has the highest jersey here, so the
    // diamond seats a teammate and Reese is the one who must not read "CF".
    getTeamById.mockResolvedValue({
      id: "team-1",
      name: "Sluggers",
      season: "Fall 2026",
      allPlay: false,
      archivedAt: null,
    });
    getChart.mockResolvedValue([
      { ...REESE, position: "CENTER_FIELD" },
      {
        ...REESE,
        entryId: "entry-8",
        playerId: "player-8",
        playerName: "Kit",
        jerseyNumber: 2,
        position: "CENTER_FIELD" as const,
      },
    ]);

    const html = await render();

    expect(html).toContain("Bats 3rd");
    expect(html).not.toContain("CF");
  });

  it("still names the spot for the kid the diamond does seat", async () => {
    // The other half: the fix must not silence a legitimately seated kid.
    getTeamById.mockResolvedValue({
      id: "team-1",
      name: "Sluggers",
      season: "Fall 2026",
      allPlay: false,
      archivedAt: null,
    });
    getChart.mockResolvedValue([
      { ...REESE, jerseyNumber: 2, position: "CENTER_FIELD" },
      {
        ...REESE,
        entryId: "entry-8",
        playerId: "player-8",
        playerName: "Kit",
        jerseyNumber: 12,
        position: "CENTER_FIELD" as const,
      },
    ]);

    const html = await render();

    expect(html).toContain("Bats 3rd · CF");
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
    expect(html).not.toContain("Substitute");
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
    expect(listRsvpsForEvents).not.toHaveBeenCalled();
  });
});

describe("TeamHomePage one-tap RSVP", () => {
  beforeEach(() => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });
    nextEvents.mockResolvedValue([GAME]);
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["player-1"]));
    getChart.mockResolvedValue([REESE]);
  });

  it("posts both responses for the next event, marked as coming from home", async () => {
    const html = await render();

    expect(listRsvpsForEvents).toHaveBeenCalledWith("team-1", ["event-1"]);
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
    listRsvpsForEvents.mockResolvedValue([
      { eventId: "event-1", playerId: "player-1", attending: true },
    ]);

    const html = await render();

    // The attending badge's own colour (RSVP_STYLE), and the Going button
    // filled rather than outlined.
    expect(html).toContain("text-primary");
    expect(html).toContain("bg-primary");
    expect(html).not.toContain("bg-destructive");
  });

  it("marks the declined answer instead when the family said no", async () => {
    listRsvpsForEvents.mockResolvedValue([
      { eventId: "event-1", playerId: "player-1", attending: false },
    ]);

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
    nextEvents.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain("Bats 3rd · SS");
    expect(html).toContain("Nothing scheduled yet");
    expect(html).not.toContain('name="from" value="home"');
    // Asked for nothing rather than skipped: listRsvpsForEvents short-circuits
    // on an empty id list, so there is no query either way.
    expect(listRsvpsForEvents).toHaveBeenCalledWith("team-1", []);
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
    listRsvpsForEvents.mockResolvedValue([
      { eventId: "event-1", playerId: "player-1", attending: true },
    ]);

    const html = await render();

    expect(html).toContain("text-primary");
  });

  it("still offers to answer right up to the start time", async () => {
    vi.setSystemTime(new Date(GAME.startsAt.getTime() - 1000));

    const html = await render();

    expect(html).toContain('name="from" value="home"');
  });

  it("offers buttons for every upcoming event, each posting its own id", async () => {
    nextEvents.mockResolvedValue([PRACTICE, GAME, LATER_GAME]);

    const html = await render();

    expect(listRsvpsForEvents).toHaveBeenCalledWith("team-1", [
      "event-2",
      "event-1",
      "event-3",
    ]);
    for (const id of ["event-1", "event-2", "event-3"]) {
      expect(html).toContain(`name="eventId" value="${id}"`);
    }
    // Three events, one kid, two buttons each.
    expect(html.match(/name="from" value="home"/g)).toHaveLength(6);
  });

  // One read serves all three cards, so the rows have to be bucketed by event.
  // Sharing one state map across them would show the same answer on all three.
  it("keeps each event's answer to that event", async () => {
    nextEvents.mockResolvedValue([PRACTICE, GAME, LATER_GAME]);
    listRsvpsForEvents.mockResolvedValue([
      { eventId: "event-2", playerId: "player-1", attending: true },
      { eventId: "event-1", playerId: "player-1", attending: false },
    ]);

    const html = await render();

    // Going for the practice, Not going for the Hawks game, unanswered for the
    // Bears game — three different states on one page.
    expect(html).toContain("bg-primary");
    expect(html).toContain("bg-destructive");
    expect(html).toContain("No response");
  });

  it("answers for each kid separately when a parent has two", async () => {
    guardedRosteredPlayerIds.mockResolvedValue(new Set(["player-1", "player-3"]));
    getChart.mockResolvedValue([
      REESE,
      { ...REESE, entryId: "entry-3", playerId: "player-3", playerName: "Sam", jerseyNumber: 4 },
    ]);

    const html = await render();

    expect(html).toContain('name="playerId" value="player-1"');
    expect(html).toContain('name="playerId" value="player-3"');
    // One event, two kids, two buttons each.
    expect(html.match(/name="from" value="home"/g)).toHaveLength(4);
  });

  // Two practices, or two games against the same opponent, give every control
  // the identical accessible name — a voice or screen-reader user then has no
  // way to say which one they mean.
  it("names each button by its event, not just its kind", async () => {
    const thursday = { ...PRACTICE, id: "prac-1" };
    const saturday = {
      ...PRACTICE,
      id: "prac-2",
      startsAt: new Date("2026-08-14T23:00:00Z"),
    };
    nextEvents.mockResolvedValue([thursday, saturday]);

    const html = await render();

    const labels = [...html.matchAll(/aria-label="([^"]*going[^"]*)"/g)].map(
      (match) => match[1],
    );

    expect(labels).toHaveLength(4);
    expect(new Set(labels).size).toBe(4);
    for (const label of labels) {
      expect(label).toContain("Reese");
      expect(label).toContain("Practice");
    }
  });

  // The doubleheader, now actually solved rather than only made safe: the game
  // in progress loses its buttons while the noon game keeps them, so the parent
  // answers for the right one without leaving the page.
  it("drops the buttons on an event in progress but keeps them on the later one", async () => {
    const morning = { ...GAME, id: "morning", opponent: "Hawks" };
    const noon = {
      ...GAME,
      id: "noon",
      opponent: "Bears",
      startsAt: new Date(GAME.startsAt.getTime() + 3 * 60 * 60 * 1000),
    };
    nextEvents.mockResolvedValue([morning, noon]);
    vi.setSystemTime(new Date(GAME.startsAt.getTime() + 40 * 60 * 1000));

    const html = await render();

    expect(html).toContain("Game vs Hawks");
    expect(html).not.toContain('name="eventId" value="morning"');
    expect(html).toContain('name="eventId" value="noon"');
  });

  it("reports what the action refused, in the parent's own words", async () => {
    const html = await render("team-1", { error: "access" });

    expect(html).toContain("You no longer have access to make this change.");
  });

  // The staff path (#54) can also refuse from a home-origin post, so its code
  // needs words here too — same parity rule as the other shared codes.
  it("explains a not-on-team refusal from the staff RSVP path", async () => {
    const html = await render("team-1", { error: "not-on-team" });

    expect(html).toContain("That player is not on this team&#x27;s roster.");
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
