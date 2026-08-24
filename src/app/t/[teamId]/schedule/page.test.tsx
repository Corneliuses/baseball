import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const listEventsInMonthGrid = vi.fn();
const listUpcomingEvents = vi.fn();
const listPastEvents = vi.fn();
const getCalendarToken = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/calendar-feed", () => ({
  getCalendarToken: (...args: unknown[]) => getCalendarToken(...args),
}));

vi.mock("@/lib/schedule", () => ({
  listEventsInMonthGrid: (...args: unknown[]) => listEventsInMonthGrid(...args),
  listUpcomingEvents: (...args: unknown[]) => listUpcomingEvents(...args),
  listPastEvents: (...args: unknown[]) => listPastEvents(...args),
}));

vi.mock("./actions", () => ({ createEventAction: vi.fn() }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { TeamAccessError } from "@/lib/team-access";
import SchedulePage, { maxDuration } from "./page";

const game = {
  id: "event-1",
  type: "GAME" as const,
  // 6:00 PM Central on 15 August 2026.
  startsAt: new Date("2026-08-15T23:00:00Z"),
  location: "Field 3",
  opponent: "Hawks",
  notes: null,
};

const practice = {
  id: "event-2",
  type: "PRACTICE" as const,
  startsAt: new Date("2026-08-18T23:30:00Z"),
  location: "Field 1",
  opponent: null,
  notes: null,
};

async function render(
  searchParams: Record<string, string> = {},
  teamId = "team-1",
) {
  return renderToStaticMarkup(
    await SchedulePage({
      params: Promise.resolve({ teamId }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
  listEventsInMonthGrid.mockResolvedValue([]);
  listUpcomingEvents.mockResolvedValue([]);
  listPastEvents.mockResolvedValue([]);
  getCalendarToken.mockResolvedValue("feed-token-1");
});

describe("SchedulePage access", () => {
  it("is readable by a parent", async () => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });

    await expect(render()).resolves.toBeDefined();
    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", { intent: "read" });
  });

  it("calls notFound() for someone with no membership", async () => {
    requireTeamAccess.mockRejectedValue(
      new TeamAccessError("nope", "no-membership"),
    );

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("lets a database outage propagate rather than reporting a 404", async () => {
    requireTeamAccess.mockRejectedValue(new Error("connection refused"));

    await expect(render()).rejects.toThrow("connection refused");
  });
});

describe("SchedulePage month view", () => {
  it("renders the grid by default", async () => {
    const html = await render({ month: "2026-08" });

    expect(html).toContain("August 2026");
    expect(html).toContain("Sun");
    expect(html).toContain("Sat");
    expect(listEventsInMonthGrid).toHaveBeenCalledWith("team-1", {
      year: 2026,
      month: 8,
    });
  });

  it("falls back to the current month on a tampered param", async () => {
    await render({ view: "month", month: "garbage" });

    const [[, month]] = listEventsInMonthGrid.mock.calls;
    expect(month.month).toBeGreaterThanOrEqual(1);
    expect(month.month).toBeLessThanOrEqual(12);
  });

  it("renders an event in its Central-time day cell", async () => {
    listEventsInMonthGrid.mockResolvedValue([game]);

    const html = await render({ view: "month", month: "2026-08" });

    expect(html).toContain("6:00 PM");
    expect(html).toContain("vs Hawks");
    expect(html).toContain("/t/team-1/schedule/event-1");
  });

  it("offers previous and next month navigation", async () => {
    const html = await render({ view: "month", month: "2026-08" });

    expect(html).toContain("month=2026-07");
    expect(html).toContain("month=2026-09");
  });

  it("rolls navigation over the year boundary", async () => {
    const html = await render({ view: "month", month: "2026-12" });

    expect(html).toContain("month=2027-01");
    expect(html).toContain("month=2026-11");
  });

  it("shows an empty state for a month with nothing in it", async () => {
    const html = await render({ view: "month", month: "2026-08" });

    expect(html).toContain("Nothing scheduled in August 2026.");
  });

  it("renders an event on a padding day borrowed from the previous month", async () => {
    // The August grid draws cells for 26-31 July. A cell that shows a date
    // must show that date's events rather than looking empty.
    listEventsInMonthGrid.mockResolvedValue([
      { ...game, id: "july-event", startsAt: new Date("2026-07-31T00:00:00Z") },
    ]);

    const html = await render({ view: "month", month: "2026-08" });

    expect(html).toContain("/t/team-1/schedule/july-event");
  });

  it("still calls the month empty when only a padding day has an event", async () => {
    // The grid query is wider than the month, so the empty state must ask
    // about this month specifically or it would wrongly claim August is busy.
    listEventsInMonthGrid.mockResolvedValue([
      { ...game, id: "july-event", startsAt: new Date("2026-07-31T00:00:00Z") },
    ]);

    const html = await render({ view: "month", month: "2026-08" });

    expect(html).toContain("Nothing scheduled in August 2026.");
  });

  it("does not call the month empty when the month itself has an event", async () => {
    listEventsInMonthGrid.mockResolvedValue([game]);

    const html = await render({ view: "month", month: "2026-08" });

    expect(html).not.toContain("Nothing scheduled in August 2026.");
  });

  it("does not query the list view's data", async () => {
    await render({ view: "month", month: "2026-08" });

    expect(listUpcomingEvents).not.toHaveBeenCalled();
    expect(listPastEvents).not.toHaveBeenCalled();
  });
});

describe("SchedulePage list view", () => {
  it("shows upcoming events by default", async () => {
    listUpcomingEvents.mockResolvedValue([game, practice]);

    const html = await render({ view: "list" });

    expect(html).toContain("Upcoming");
    expect(html).toContain("vs Hawks");
    expect(html).toContain("Practice");
    expect(html).toContain("Saturday, August 15");
    expect(listPastEvents).not.toHaveBeenCalled();
  });

  it("switches to past events behind the toggle", async () => {
    listPastEvents.mockResolvedValue([game]);

    const html = await render({ view: "list", past: "1" });

    expect(html).toContain("Past events");
    expect(html).toContain("Show upcoming");
    expect(listPastEvents).toHaveBeenCalled();
    expect(listUpcomingEvents).not.toHaveBeenCalled();
  });

  it("shows distinct empty states for upcoming and past", async () => {
    expect(await render({ view: "list" })).toContain("Nothing scheduled yet.");
    expect(await render({ view: "list", past: "1" })).toContain(
      "Nothing has happened yet.",
    );
  });

  it("does not query the month view's data", async () => {
    await render({ view: "list" });

    expect(listEventsInMonthGrid).not.toHaveBeenCalled();
  });
});

describe("SchedulePage create form", () => {
  it("is shown to a coach", async () => {
    const html = await render();

    expect(html).toContain("Add an event");
    expect(html).toContain('name="startsAt"');
    expect(html).toContain("Times are US Central.");
  });

  it("is shown to an owner", async () => {
    requireTeamAccess.mockResolvedValue({ role: "OWNER", userId: "user-1" });

    expect(await render()).toContain("Add an event");
  });

  it("is hidden from a parent", async () => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });

    const html = await render();

    expect(html).not.toContain("Add an event");
    expect(html).not.toContain('name="startsAt"');
  });
});

describe("SchedulePage feedback", () => {
  it("renders a known error message", async () => {
    expect(await render({ error: "invalid-datetime" })).toContain(
      "Enter a valid date and time.",
    );
  });

  it("falls back for an unrecognised error code", async () => {
    expect(await render({ error: "wat" })).toContain("Something went wrong.");
  });

  it("no longer confirms an add through a query param", async () => {
    // `createEventAction` stopped redirecting on success (#51 / C1) — the
    // reload was most of what made schedule entry cost ~60 interactions a
    // season. Confirmation now comes back as form state, where it can also
    // name the event and say which fields were kept, so nothing sets ?added=1
    // any more and the page must not pretend otherwise.
    const markup = await render({ added: "1" });

    expect(markup).not.toContain("Event added.");
  });

  it("anchors the add card so a Duplicate link can jump to it", async () => {
    const markup = await render();

    expect(markup).toContain('id="add-event"');
  });

  it("carries the current view into the form, for the one path that navigates", async () => {
    const markup = await render({ view: "list", past: "1" });

    expect(markup).toContain('name="view" value="list"');
    expect(markup).toContain('name="past" value="1"');
  });
});

describe("SchedulePage practice locations", () => {
  it("links a practice's location to a map in the list view", async () => {
    listUpcomingEvents.mockResolvedValue([practice]);

    const html = await render({ view: "list" });

    expect(html).toContain("https://maps.google.com/?q=Field%201");
  });
});

describe("SchedulePage season pass card", () => {
  it("shows the feed URL and a webcal link to every role, parents included", async () => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });

    const html = await render();

    expect(getCalendarToken).toHaveBeenCalledWith("team-1");
    expect(html).toContain("The whole season, in your pocket");
    // Host comes from absoluteUrl's env precedence — assert scheme and path,
    // not a particular deploy host.
    expect(html).toMatch(/https?:\/\/[^"&]*\/api\/calendar\/feed-token-1/);
    expect(html).toMatch(/webcal:\/\/[^"&]*\/api\/calendar\/feed-token-1/);
  });

  it("spends the schedule screen's one banana on the season pass stub — no more, no fewer", async () => {
    // Game tickets are clay and practices print plain, so the pass's stub is
    // the screen's single Banana Yellow element (design-plan.md §2).
    listUpcomingEvents.mockResolvedValue([game, practice]);

    const html = await render({ view: "list" });

    expect(html.match(/bg-banana/g)).toHaveLength(1);
    expect(html).toContain("Admit all");
  });

  it("omits the card rather than rendering a broken URL when the token is missing", async () => {
    getCalendarToken.mockResolvedValue(null);

    const html = await render();

    expect(html).not.toContain("The whole season, in your pocket");
    expect(html).not.toContain("/api/calendar/");
  });
});

/// #45 — this page hosts the deferred announcement fan-out's timeout, even
/// though nothing a human waits on is governed by it.
describe("SchedulePage announcement timeout", () => {
  it("declares the maxDuration that governs the deferred send loop", () => {
    // Coupled to MAX_RECIPIENTS (200) × MIN_SEND_INTERVAL_MS (600ms) = 120s in
    // ./actions.ts. The two move together — see AGENTS.md.
    expect(maxDuration).toBe(300);
  });
});
