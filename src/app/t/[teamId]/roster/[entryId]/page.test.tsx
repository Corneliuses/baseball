import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const getRosterEntry = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/roster", () => ({
  getRosterEntry: (...args: unknown[]) => getRosterEntry(...args),
}));

const BASE_ENTRY = {
  id: "entry-1",
  jerseyNumber: 7,
  player: { id: "player-1", name: "Ada", dateOfBirth: null },
  guardians: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Roster entry page", () => {
  it("should export a default function", async () => {
    requireTeamAccess.mockResolvedValue({ role: "OWNER", userId: "user-1" });
    getRosterEntry.mockResolvedValue(BASE_ENTRY);

    const { default: RosterEntryPage } = await import("./page");
    expect(typeof RosterEntryPage).toBe("function");
  });

  it("shows the edit form for a coach", async () => {
    requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
    getRosterEntry.mockResolvedValue(BASE_ENTRY);

    const { default: RosterEntryPage } = await import("./page");
    const result = await RosterEntryPage({
      params: Promise.resolve({ teamId: "team-1", entryId: "entry-1" }),
      searchParams: Promise.resolve({}),
    });

    const markup = renderToStaticMarkup(result);
    expect(markup).toContain("Remove player");
  });

  it("hides edit and remove controls for a parent", async () => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });
    getRosterEntry.mockResolvedValue(BASE_ENTRY);

    const { default: RosterEntryPage } = await import("./page");
    const result = await RosterEntryPage({
      params: Promise.resolve({ teamId: "team-1", entryId: "entry-1" }),
      searchParams: Promise.resolve({}),
    });

    const markup = renderToStaticMarkup(result);
    expect(markup).not.toContain("Remove player");
    expect(markup).not.toContain("Save changes");
  });
});
