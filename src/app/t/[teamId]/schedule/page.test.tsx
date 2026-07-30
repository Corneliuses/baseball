import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const listEventsInMonth = vi.fn();
const listUpcomingEvents = vi.fn();
const listPastEvents = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/schedule", () => ({
  listEventsInMonth: (...args: unknown[]) => listEventsInMonth(...args),
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
  const { default: SchedulePage } = await import("./page");
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
  listEventsInMonth.mockResolvedValue([]);
  listUpcomingEvents.mockResolvedValue([]);
  listPastEvents.mockResolvedValue([]);
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
    expect(listEventsInMonth).toHaveBeenCalledWith("team-1", {
      year: 2026,
      month: 8,
    });
  });

  it("falls back to the current month on a tampered param", async () => {
    await render({ view: "month", month: "garbage" });

    const [[, month]] = listEventsInMonth.mock.calls;
    expect(month.month).toBeGreaterThanOrEqual(1);
    expect(month.month).toBeLessThanOrEqual(12);
  });

  it("renders an event in its Central-time day cell", async () => {
    listEventsInMonth.mockResolvedValue([game]);

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

    expect(listEventsInMonth).not.toHaveBeenCalled();
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

  it("confirms a successful add", async () => {
    expect(await render({ added: "1" })).toContain("Event added.");
  });
});
