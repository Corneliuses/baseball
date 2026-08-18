import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const listDirectory = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/memberships", () => ({
  listDirectory: (...args: unknown[]) => listDirectory(...args),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { TeamAccessError } from "@/lib/team-access";

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
  listDirectory.mockResolvedValue([]);
});

describe("DirectoryPage", () => {
  it("should export a default function", async () => {
    const { default: DirectoryPage } = await import("./page");
    expect(typeof DirectoryPage).toBe("function");
  });

  it("is visible to a coach", async () => {
    const { default: DirectoryPage } = await import("./page");

    await expect(
      DirectoryPage({ params: Promise.resolve({ teamId: "team-1" }) }),
    ).resolves.toBeDefined();
    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", {
      intent: "read",
      minRole: "COACH",
    });
  });

  it("calls notFound() for someone with no membership", async () => {
    requireTeamAccess.mockRejectedValue(new TeamAccessError("nope", "no-membership"));

    const { default: DirectoryPage } = await import("./page");

    await expect(
      DirectoryPage({ params: Promise.resolve({ teamId: "team-1" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  // A parent who pastes the URL gets a 404, not a page of other families'
  // phone numbers — requireTeamAccess raises insufficient-role for minRole
  // COACH and the loader treats it exactly like no membership at all.
  it("calls notFound() for a parent who pastes the URL", async () => {
    requireTeamAccess.mockRejectedValue(
      new TeamAccessError("Requires COACH, caller is PARENT", "insufficient-role"),
    );

    const { default: DirectoryPage } = await import("./page");

    await expect(
      DirectoryPage({ params: Promise.resolve({ teamId: "team-1" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listDirectory).not.toHaveBeenCalled();
  });

  it("renders a parent's kids on this team", async () => {
    listDirectory.mockResolvedValue([
      {
        userId: "user-1",
        role: "PARENT",
        name: "Sam",
        email: "sam@example.com",
        phone: "555-1234",
        players: [{ id: "player-1", name: "Ada" }, { id: "player-2", name: "Zed" }],
      },
    ]);

    const { default: DirectoryPage } = await import("./page");

    const html = renderToStaticMarkup(
      await DirectoryPage({ params: Promise.resolve({ teamId: "team-1" }) }),
    );

    expect(html).toContain("Sam");
    expect(html).toContain("sam@example.com");
    expect(html).toContain("555-1234");
    expect(html).toContain("Ada, Zed");
  });

  it("renders a coach with no kids and no phone on file", async () => {
    listDirectory.mockResolvedValue([
      {
        userId: "user-2",
        role: "COACH",
        name: "Coach Mel",
        email: "mel@example.com",
        phone: null,
        players: [],
      },
    ]);

    const { default: DirectoryPage } = await import("./page");

    const html = renderToStaticMarkup(
      await DirectoryPage({ params: Promise.resolve({ teamId: "team-1" }) }),
    );

    expect(html).toContain("Coach Mel");
    expect(html).toContain("—");
  });

  it("renders an empty state when there are no members", async () => {
    const { default: DirectoryPage } = await import("./page");

    const html = renderToStaticMarkup(
      await DirectoryPage({ params: Promise.resolve({ teamId: "team-1" }) }),
    );

    expect(html).toContain("No members yet.");
  });
});
