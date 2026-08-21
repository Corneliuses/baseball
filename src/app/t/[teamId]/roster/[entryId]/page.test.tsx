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

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { TeamAccessError } from "@/lib/team-access";
import RosterEntryPage from "./page";

const BASE_ENTRY = {
  id: "entry-1",
  jerseyNumber: 7,
  player: { id: "player-1", name: "Ada", dateOfBirth: null },
  guardians: [],
};

const ENTRY_WITH_GUARDIAN = {
  ...BASE_ENTRY,
  guardians: [
    {
      id: "user-9",
      name: "Sam",
      email: "sam@example.com",
      phone: "555-1234",
      isMember: true,
      hasSignedIn: true,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Roster entry page", () => {
  it("should export a default function", async () => {
    requireTeamAccess.mockResolvedValue({ role: "OWNER", userId: "user-1" });
    getRosterEntry.mockResolvedValue(BASE_ENTRY);

    expect(typeof RosterEntryPage).toBe("function");
  });

  it("shows the edit form for a coach", async () => {
    requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
    getRosterEntry.mockResolvedValue(BASE_ENTRY);

    const result = await RosterEntryPage({
      params: Promise.resolve({ teamId: "team-1", entryId: "entry-1" }),
      searchParams: Promise.resolve({}),
    });

    const markup = renderToStaticMarkup(result);
    expect(markup).toContain("Remove player");
  });

  it("requires COACH and shows guardian contact details", async () => {
    requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
    getRosterEntry.mockResolvedValue(ENTRY_WITH_GUARDIAN);

    const markup = renderToStaticMarkup(
      await RosterEntryPage({
        params: Promise.resolve({ teamId: "team-1", entryId: "entry-1" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", {
      intent: "read",
      minRole: "COACH",
    });
    expect(markup).toContain("Guardians");
    expect(markup).toContain("sam@example.com");
    expect(markup).toContain("555-1234");
  });

  it("asks for confirmation before removing a player", async () => {
    requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
    getRosterEntry.mockResolvedValue(BASE_ENTRY);

    const markup = renderToStaticMarkup(
      await RosterEntryPage({
        params: Promise.resolve({ teamId: "team-1", entryId: "entry-1" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(markup).toContain("confirm=remove");
    expect(markup).not.toContain("Yes, remove them");
  });

  it("names the player in the removal confirm step", async () => {
    requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
    getRosterEntry.mockResolvedValue(BASE_ENTRY);

    const markup = renderToStaticMarkup(
      await RosterEntryPage({
        params: Promise.resolve({ teamId: "team-1", entryId: "entry-1" }),
        searchParams: Promise.resolve({ confirm: "remove" }),
      }),
    );

    expect(markup).toContain("Yes, remove them");
    expect(markup).toContain("Remove Ada from this roster?");
  });

  it("asks for per-guardian confirmation before unlinking", async () => {
    requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
    getRosterEntry.mockResolvedValue(ENTRY_WITH_GUARDIAN);

    const markup = renderToStaticMarkup(
      await RosterEntryPage({
        params: Promise.resolve({ teamId: "team-1", entryId: "entry-1" }),
        searchParams: Promise.resolve({}),
      }),
    );

    // & renders as &amp; in static markup.
    expect(markup).toContain("confirm=unlink&amp;guardian=user-9");
    expect(markup).not.toContain("Yes, unlink");
  });

  it("confirms an unlink on the named guardian's row only", async () => {
    requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
    getRosterEntry.mockResolvedValue(ENTRY_WITH_GUARDIAN);

    const markup = renderToStaticMarkup(
      await RosterEntryPage({
        params: Promise.resolve({ teamId: "team-1", entryId: "entry-1" }),
        searchParams: Promise.resolve({ confirm: "unlink", guardian: "user-9" }),
      }),
    );

    expect(markup).toContain("Yes, unlink");
    expect(markup).toContain("Unlink Sam from Ada?");
  });

  // The route is coach-and-above like /directory: the page is the roster
  // admin surface and carries every linked guardian's contact details, so a
  // parent gets a 404 — and the guardian data is never even fetched.
  it("calls notFound() below COACH, before fetching the entry", async () => {
    requireTeamAccess.mockRejectedValue(
      new TeamAccessError("Requires COACH", "insufficient-role"),
    );

    await expect(
      RosterEntryPage({
        params: Promise.resolve({ teamId: "team-1", entryId: "entry-1" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getRosterEntry).not.toHaveBeenCalled();
  });
});
