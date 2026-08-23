import { describe, it, expect } from "vitest";

import {
  eventUrl,
  scheduleContextFrom,
  scheduleContextFromForm,
  scheduleQuery,
  scheduleUrl,
} from "./schedule-context";

const NOW = new Date("2026-08-10T12:00:00Z");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

describe("reading the context from search params", () => {
  it("defaults to the current month, like the page does", () => {
    expect(scheduleContextFrom({}, NOW)).toEqual({
      view: "month",
      month: "2026-08",
      past: false,
    });
  });

  it("keeps a list view and its past toggle", () => {
    expect(scheduleContextFrom({ view: "list", past: "1" }, NOW)).toEqual({
      view: "list",
      month: "2026-08",
      past: true,
    });
  });
});

describe("reading the context from a submitted form", () => {
  it("round-trips what the form carried", () => {
    expect(
      scheduleContextFromForm(
        form({ view: "month", month: "2026-04", past: "0" }),
        NOW,
      ),
    ).toEqual({ view: "month", month: "2026-04", past: false });
  });

  it("re-parses rather than trusting what was posted", () => {
    // The values arrive from hidden inputs, so they arrive from whatever the
    // POST carried. `parseMonthParam` never throws and falls back to the
    // current month, and anything that is not exactly "list" is month — so a
    // forged pair collapses to the safe default instead of reaching a redirect.
    expect(
      scheduleContextFromForm(
        form({ view: "../../evil", month: "<script>", past: "yes" }),
        NOW,
      ),
    ).toEqual({ view: "month", month: "2026-08", past: false });
  });

  it("survives a form with no context at all", () => {
    expect(scheduleContextFromForm(form({}), NOW)).toEqual({
      view: "month",
      month: "2026-08",
      past: false,
    });
  });
});

describe("building URLs from a context", () => {
  it("names the month explicitly so a redirect cannot drift to today", () => {
    // Dropping `month` was half of C1's damage: a coach entering next April's
    // fixtures was thrown back to the current month on every single submit.
    expect(scheduleUrl("team-1", scheduleContextFrom({ month: "2027-04" }, NOW))).toBe(
      "/t/team-1/schedule?view=month&month=2027-04",
    );
  });

  it("keeps a list view a list view", () => {
    // parseViewParam treats anything that is not exactly "list" as month, so
    // an omitted param is not neutral — it is a silent switch back to the grid.
    expect(
      scheduleUrl("team-1", scheduleContextFrom({ view: "list" }, NOW)),
    ).toBe("/t/team-1/schedule?view=list");
  });

  it("carries the past toggle only where it means something", () => {
    const past = scheduleContextFrom({ view: "list", past: "1" }, NOW);
    expect(scheduleQuery(past)).toBe("view=list&past=1");

    // The same flag on a month view would resurrect a toggle the coach cannot
    // see, so it is dropped rather than carried.
    const monthWithPast = { ...past, view: "month" as const };
    expect(scheduleQuery(monthWithPast)).toBe("view=month&month=2026-08");
  });

  it("appends extra params after the context", () => {
    expect(
      scheduleUrl("team-1", scheduleContextFrom({ view: "list" }, NOW), {
        error: "access",
      }),
    ).toBe("/t/team-1/schedule?view=list&error=access");
  });

  it("builds an event URL that remembers where it was opened from", () => {
    expect(
      eventUrl("team-1", "event-9", scheduleContextFrom({ view: "list" }, NOW), {
        saved: "1",
      }),
    ).toBe("/t/team-1/schedule/event-9?view=list&saved=1");
  });
});
