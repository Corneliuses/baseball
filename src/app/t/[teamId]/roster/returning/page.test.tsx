import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const listReturningCandidates = vi.fn();
const getRoster = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/roster", () => ({
  listReturningCandidates: (...args: unknown[]) => listReturningCandidates(...args),
  // Read only to name the player just added — they have left the candidate
  // list by then, so the roster is where their name lives.
  getRoster: (...args: unknown[]) => getRoster(...args),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { TeamAccessError } from "@/lib/team-access";
import ReturningPlayersPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "OWNER", userId: "owner-1" });
  listReturningCandidates.mockResolvedValue([]);
  getRoster.mockResolvedValue([]);
});

async function renderPage(searchParams: Record<string, string> = {}) {
  return renderToStaticMarkup(
    await ReturningPlayersPage({
      params: Promise.resolve({ teamId: "team-1" }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

describe("ReturningPlayersPage", () => {
  it("should export a default function", async () => {
    expect(typeof ReturningPlayersPage).toBe("function");
  });

  it("calls notFound() for a non-owner", async () => {
    requireTeamAccess.mockRejectedValue(
      new TeamAccessError("nope", "insufficient-role"),
    );

    await expect(
      ReturningPlayersPage({
        params: Promise.resolve({ teamId: "team-1" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders an empty state when there are no candidates", async () => {
    const html = renderToStaticMarkup(
      await ReturningPlayersPage({
        params: Promise.resolve({ teamId: "team-1" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain("No past players are available to add.");
  });

  it("renders a candidate's name, source teams, and guardian count", async () => {
    listReturningCandidates.mockResolvedValue([
      {
        playerId: "player-1",
        name: "Ada",
        dateOfBirth: null,
        teams: [{ id: "team-2", name: "Rec", season: "2025", archivedAt: null }],
        guardianCount: 2,
      },
    ]);

    const html = renderToStaticMarkup(
      await ReturningPlayersPage({
        params: Promise.resolve({ teamId: "team-1" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain("Ada");
    expect(html).toContain("Rec (2025)");
    expect(html).toContain("2 guardians");
  });
});

describe("ReturningPlayersPage after an add", () => {
  it("does not contradict itself when the last candidate is added", async () => {
    // Adding the final candidate empties the list, so the plain "none
    // available" line printed directly under the card announcing one was just
    // added — two statements that read as arguing with each other.
    listReturningCandidates.mockResolvedValue([]);
    getRoster.mockResolvedValue([
      {
        id: "entry-1",
        jerseyNumber: 7,
        player: { id: "player-1", name: "Ada", dateOfBirth: null },
      },
    ]);

    const markup = await renderPage({ added: "player-1" });

    expect(markup).toContain("Ada");
    expect(markup).toContain("That was the last one");
    expect(markup).not.toContain("No past players are available to add.");
  });

  it("keeps the filter on every row's form so an add returns to it", async () => {
    listReturningCandidates.mockResolvedValue([
      { playerId: "player-2", name: "Ada Two", teams: [], guardianCount: 0 },
    ]);

    const markup = await renderPage({ q: "ad" });

    expect(markup).toContain('name="q" value="ad"');
  });
});
