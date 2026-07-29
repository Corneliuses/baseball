import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getCurrentUser = vi.fn();
const getAllTeams = vi.fn();
const getMemberTeams = vi.fn();

vi.mock("@/lib/session", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUser(...args),
}));

vi.mock("@/lib/teams", () => ({
  getAllTeams: (...args: unknown[]) => getAllTeams(...args),
  getMemberTeams: (...args: unknown[]) => getMemberTeams(...args),
}));

const ORIGINAL_OWNER_EMAIL = process.env.OWNER_EMAIL;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OWNER_EMAIL = "owner@example.com";
  getAllTeams.mockResolvedValue([]);
  getMemberTeams.mockResolvedValue([]);
});

afterEach(() => {
  process.env.OWNER_EMAIL = ORIGINAL_OWNER_EMAIL;
});

describe("Home page", () => {
  it("should export a default function", async () => {
    getCurrentUser.mockResolvedValue(null);
    const { default: Home } = await import("./page");
    expect(typeof Home).toBe("function");
  });

  it("should run no team query when signed out", async () => {
    getCurrentUser.mockResolvedValue(null);
    const { default: Home } = await import("./page");

    await Home();

    expect(getAllTeams).not.toHaveBeenCalled();
    expect(getMemberTeams).not.toHaveBeenCalled();
  });

  it("should call getMemberTeams, not getAllTeams, for a signed-in non-owner", async () => {
    getCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "parent@example.com",
      name: "Parent",
    });
    const { default: Home } = await import("./page");

    await Home();

    expect(getMemberTeams).toHaveBeenCalledWith("user-1");
    expect(getAllTeams).not.toHaveBeenCalled();
  });

  it("should call getAllTeams for the signed-in owner", async () => {
    getCurrentUser.mockResolvedValue({
      id: "owner-1",
      email: "owner@example.com",
      name: "Owner",
    });
    const { default: Home } = await import("./page");

    await Home();

    expect(getAllTeams).toHaveBeenCalled();
  });
});
