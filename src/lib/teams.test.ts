import { describe, it, expect, vi } from "vitest";

vi.mock("./db", () => ({
  db: {
    team: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { getPublicTeams, getUserTeams } from "./teams";

describe("teams data functions", () => {
  describe("getPublicTeams", () => {
    it("returns teams array (possibly empty)", async () => {
      const result = await getPublicTeams();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getUserTeams", () => {
    it("returns teams array for a user", async () => {
      const result = await getUserTeams("user-123");
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
