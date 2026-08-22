import { beforeEach, describe, expect, it, vi } from "vitest";

const getTeamByCalendarToken = vi.fn();
const listAllEvents = vi.fn();

vi.mock("@/lib/calendar-feed", () => ({
  getTeamByCalendarToken: (...args: unknown[]) => getTeamByCalendarToken(...args),
  listAllEvents: (...args: unknown[]) => listAllEvents(...args),
}));

import { GET } from "./route";

const TEAM = { id: "team-1", name: "Sharks", season: "2026" };

function get(token: string) {
  return GET(new Request(`https://example.com/api/calendar/${token}`), {
    params: Promise.resolve({ token }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getTeamByCalendarToken.mockResolvedValue(TEAM);
  listAllEvents.mockResolvedValue([]);
});

describe("GET /api/calendar/[token]", () => {
  it("404s an unknown token with an empty body — no redirect, no hint", async () => {
    getTeamByCalendarToken.mockResolvedValue(null);

    const response = await get("nope");

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(listAllEvents).not.toHaveBeenCalled();
  });

  it("serves the token's team as text/calendar with polling-friendly caching", async () => {
    listAllEvents.mockResolvedValue([
      {
        id: "evt-1",
        type: "GAME",
        startsAt: new Date("2026-04-01T19:30:00Z"),
        location: null,
        opponent: "Hawks",
        notes: null,
      },
    ]);

    const response = await get("tok-1");

    expect(getTeamByCalendarToken).toHaveBeenCalledWith("tok-1");
    expect(listAllEvents).toHaveBeenCalledWith("team-1");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/calendar; charset=utf-8",
    );
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=3600");

    const body = await response.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("X-WR-CALNAME:Sharks 2026");
    expect(body).toContain("SUMMARY:Game vs Hawks");
  });

  it("serves a team with no events as a valid empty calendar, not an error", async () => {
    const response = await get("tok-1");

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).not.toContain("BEGIN:VEVENT");
  });

  it("lets a database error propagate — a 500 leaves subscribers' copies alone", async () => {
    getTeamByCalendarToken.mockRejectedValue(new Error("db down"));

    await expect(get("tok-1")).rejects.toThrow("db down");
  });
});
