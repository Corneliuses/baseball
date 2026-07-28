import { describe, it, expect, vi } from "vitest";

vi.mock("./db", () => ({
  db: {
    team: {
      findMany: vi.fn(),
    },
  },
}));

import { getPublicTeams, getUserTeams } from "./teams";

describe("teams data functions", () => {
  describe("getPublicTeams", () => {
    it("should be a function", () => {
      expect(typeof getPublicTeams).toBe("function");
    });
  });

  describe("getUserTeams", () => {
    it("should be a function", () => {
      expect(typeof getUserTeams).toBe("function");
    });
  });
});
