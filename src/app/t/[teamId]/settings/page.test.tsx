import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: vi.fn().mockResolvedValue({ role: "OWNER", userId: "user-1" }),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: vi.fn().mockResolvedValue({
    id: "team-1",
    name: "Sharks",
    season: "2026",
    allPlay: true,
    archivedAt: null,
    createdAt: new Date("2026-07-28"),
  }),
}));

describe("Team settings page", () => {
  it("should export a default function", async () => {
    const { default: TeamSettingsPage } = await import("./page");
    expect(typeof TeamSettingsPage).toBe("function");
  });
});
