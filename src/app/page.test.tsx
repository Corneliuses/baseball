import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/teams", () => ({
  getPublicTeams: vi.fn().mockResolvedValue([
    {
      id: "team-1",
      name: "Test Team",
      season: "2026",
      allPlay: true,
      createdAt: new Date("2026-07-28"),
    },
  ]),
}));

describe("Home page", () => {
  it("should export a default function", async () => {
    // This is a server component; full integration testing happens in E2E tests
    // Unit test here only verifies the component is importable
    const { default: Home } = await import("./page");
    expect(typeof Home).toBe("function");
  });
});
