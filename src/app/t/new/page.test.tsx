import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({
    id: "user-1",
    email: "owner@example.com",
    name: "Owner",
  }),
}));

describe("New team page", () => {
  it("should export a default function", async () => {
    const { default: NewTeamPage } = await import("./page");
    expect(typeof NewTeamPage).toBe("function");
  });
});
