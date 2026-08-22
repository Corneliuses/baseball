import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RosterPage from "./page";

const requireTeamAccess = vi.fn();
const getRoster = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/roster", () => ({
  getRoster: (...args: unknown[]) => getRoster(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Roster page", () => {
  it("should export a default function", async () => {
    requireTeamAccess.mockResolvedValue({ role: "OWNER", userId: "user-1" });
    getRoster.mockResolvedValue([]);

    expect(typeof RosterPage).toBe("function");
  });

  it("renders players sorted by jersey number, unnumbered last", async () => {
    requireTeamAccess.mockResolvedValue({ role: "OWNER", userId: "user-1" });
    getRoster.mockResolvedValue([
      { id: "entry-2", jerseyNumber: null, player: { name: "Zed" } },
      { id: "entry-1", jerseyNumber: 9, player: { name: "Ada" } },
    ]);

    const result = await RosterPage({
      params: Promise.resolve({ teamId: "team-1" }),
      searchParams: Promise.resolve({}),
    });

    const markup = renderToStaticMarkup(result);
    expect(markup.indexOf("Ada")).toBeLessThan(markup.indexOf("Zed"));
  });

  // One of the twelve pages that really did crash on ?error=constructor before
  // the tables moved to messageTable: an inherited Object.prototype member is
  // truthy, so the ?? fallback never fired and React was handed a function.
  it("falls back rather than resolving an inherited member of the message table", async () => {
    requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
    getRoster.mockResolvedValue([]);

    for (const key of ["constructor", "__proto__", "toString"]) {
      const result = await RosterPage({
        params: Promise.resolve({ teamId: "team-1" }),
        searchParams: Promise.resolve({ error: key }),
      });

      expect(renderToStaticMarkup(result)).toContain("Something went wrong.");
    }
  });

  it("passes the caller's role through to gate the add-player form", async () => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });
    getRoster.mockResolvedValue([]);

    const result = await RosterPage({
      params: Promise.resolve({ teamId: "team-1" }),
      searchParams: Promise.resolve({}),
    });

    expect(renderToStaticMarkup(result)).not.toContain("Add a player");
  });

  it("shows the add-player form for a coach", async () => {
    requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
    getRoster.mockResolvedValue([]);

    const result = await RosterPage({
      params: Promise.resolve({ teamId: "team-1" }),
      searchParams: Promise.resolve({}),
    });

    expect(renderToStaticMarkup(result)).toContain("Add a player");
  });
});
