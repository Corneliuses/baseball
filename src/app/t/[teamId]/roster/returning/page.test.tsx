import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const listReturningCandidates = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/roster", () => ({
  listReturningCandidates: (...args: unknown[]) => listReturningCandidates(...args),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { TeamAccessError } from "@/lib/team-access";

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "OWNER", userId: "owner-1" });
  listReturningCandidates.mockResolvedValue([]);
});

describe("ReturningPlayersPage", () => {
  it("should export a default function", async () => {
    const { default: ReturningPlayersPage } = await import("./page");
    expect(typeof ReturningPlayersPage).toBe("function");
  });

  it("calls notFound() for a non-owner", async () => {
    requireTeamAccess.mockRejectedValue(
      new TeamAccessError("nope", "insufficient-role"),
    );

    const { default: ReturningPlayersPage } = await import("./page");

    await expect(
      ReturningPlayersPage({
        params: Promise.resolve({ teamId: "team-1" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders an empty state when there are no candidates", async () => {
    const { default: ReturningPlayersPage } = await import("./page");

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

    const { default: ReturningPlayersPage } = await import("./page");

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
