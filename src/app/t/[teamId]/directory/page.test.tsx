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

  // Covers a parent pasting the URL too: the loader turns every
  // TeamAccessError into notFound() without reading its reason, and the
  // minRole: "COACH" assertion above pins where the parent lockout actually
  // lives (team-access.test.ts proves a PARENT fails that gate).
  it("calls notFound() when access is refused, before fetching", async () => {
    requireTeamAccess.mockRejectedValue(new TeamAccessError("nope", "no-membership"));

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
