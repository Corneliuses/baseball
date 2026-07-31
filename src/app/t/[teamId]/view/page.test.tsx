import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const nextGame = vi.fn();
const getChart = vi.fn();
const listEventRsvps = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/schedule", () => ({
  nextGame: (...args: unknown[]) => nextGame(...args),
}));

vi.mock("@/lib/roster", () => ({
  getChart: (...args: unknown[]) => getChart(...args),
}));

vi.mock("@/lib/rsvps", () => ({
  listEventRsvps: (...args: unknown[]) => listEventRsvps(...args),
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
  // 6:00 PM Central on 15 August 2026 (CDT, UTC-5).
  startsAt: new Date("2026-08-15T23:00:00Z"),
  location: "Field 3",
  opponent: "Hawks",
  notes: null,
};

const fullChart = [
  {
    playerId: "ava",
    playerName: "Ava",
    jerseyNumber: 7,
    battingOrder: 1,
    position: "SHORTSTOP" as const,
  },
  {
    playerId: "ben",
    playerName: "Ben",
    jerseyNumber: 12,
    battingOrder: 2,
    position: "PITCHER" as const,
  },
];

async function render(teamId = "team-1") {
  const { default: ViewPage } = await import("./page");
  return renderToStaticMarkup(
    await ViewPage({ params: Promise.resolve({ teamId }) }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });
  nextGame.mockResolvedValue(game);
  getChart.mockResolvedValue(fullChart);
  listEventRsvps.mockResolvedValue([]);
});

describe("ViewPage access", () => {
  it("is readable by a parent", async () => {
    await expect(render()).resolves.toBeDefined();
    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", { intent: "read" });
  });

  it("calls notFound() for someone with no membership", async () => {
    requireTeamAccess.mockRejectedValue(new TeamAccessError("nope", "no-membership"));

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("re-throws non-access errors instead of masking them as 404", async () => {
    requireTeamAccess.mockRejectedValue(new Error("db down"));

    await expect(render()).rejects.toThrow("db down");
  });
});

describe("ViewPage empty states", () => {
  it("shows a no-upcoming-game empty state and never calls the chart reads", async () => {
    nextGame.mockResolvedValue(null);

    const html = await render();

    expect(html).toContain("No upcoming game");
    expect(getChart).not.toHaveBeenCalled();
  });

  it("shows a no-chart-set-yet empty state when every roster entry is benched", async () => {
    getChart.mockResolvedValue([
      {
        playerId: "ava",
        playerName: "Ava",
        jerseyNumber: null,
        battingOrder: null,
        position: null,
      },
    ]);

    const html = await render();

    expect(html).toContain("No chart set yet");
  });

  it("still shows the next-game header on the no-chart empty state", async () => {
    getChart.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain("Hawks");
    expect(html).toContain("No chart set yet");
  });
});

describe("ViewPage chart rendering", () => {
  it("renders every position label from POSITION_LABELS", async () => {
    const html = await render();

    for (const label of ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"]) {
      expect(html).toContain(`>${label}<`);
    }
  });

  it("renders the batting order sorted ascending", async () => {
    const html = await render();
    // Scope to the batting-order list — the diamond above it renders players
    // in scorebook position order, not batting order, so searching the whole
    // page would find whichever player's position comes first on the field.
    const lineupHtml = html.slice(html.indexOf("Batting order"));

    expect(lineupHtml.indexOf("Ava")).toBeLessThan(lineupHtml.indexOf("Ben"));
  });

  it("keeps a declined player in their slot, greyed, tagged Not going", async () => {
    listEventRsvps.mockResolvedValue([{ playerId: "ava", attending: false }]);

    const html = await render();

    expect(html).toContain("Ava");
    expect(html).toContain("Not going");
  });

  it("tags a no-response player distinctly, never as out", async () => {
    listEventRsvps.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain("No response");
    expect(html).not.toMatch(/>Out</);
  });

  it("shows Going for an attending player", async () => {
    listEventRsvps.mockResolvedValue([{ playerId: "ben", attending: true }]);

    const html = await render();

    expect(html).toContain("Going");
  });

  it("shortens to a first name on the diamond but keeps the full name in the order", async () => {
    getChart.mockResolvedValue([
      {
        playerId: "ava",
        playerName: "Ava Castellanos",
        jerseyNumber: 7,
        battingOrder: 1,
        position: "SHORTSTOP" as const,
      },
    ]);

    const html = await render();
    const lineupHtml = html.slice(html.indexOf("Batting order"));

    // The marker carries the short form; the list carries the whole name.
    expect(html).toContain(">Ava</text>");
    expect(lineupHtml).toContain("Ava Castellanos");
  });

  it("exposes every position assignment to screen readers", async () => {
    const html = await render();

    // The SVG is aria-hidden, so the sr-only list is the only accessible path
    // to who is playing where.
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("sr-only");
    expect(html).toContain("SS:");
    expect(html).toContain("Ava");
    // Unassigned positions are announced too, not skipped.
    expect(html).toContain("Open");
  });

  it("does not show the RSVP legend when no chart is set", async () => {
    getChart.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain("No chart set yet");
    expect(html).not.toContain("RSVP is just for planning");
  });
});
