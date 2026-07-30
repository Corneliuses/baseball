import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const getEvent = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/schedule", () => ({
  getEvent: (...args: unknown[]) => getEvent(...args),
}));

vi.mock("../actions", () => ({
  updateEventAction: vi.fn(),
  deleteEventAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { TeamAccessError } from "@/lib/team-access";

const game = {
  id: "event-1",
  type: "GAME" as const,
  // 6:00 PM Central on 15 August 2026 (CDT, UTC-5).
  startsAt: new Date("2026-08-15T23:00:00Z"),
  location: "Field 3",
  opponent: "Hawks",
  notes: "Bring water",
};

async function render(searchParams: Record<string, string> = {}) {
  const { default: EventPage } = await import("./page");
  return renderToStaticMarkup(
    await EventPage({
      params: Promise.resolve({ teamId: "team-1", eventId: "event-1" }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
  getEvent.mockResolvedValue(game);
});

describe("EventPage access", () => {
  it("scopes the lookup to the team in the URL", async () => {
    await render();

    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", { intent: "read" });
    expect(getEvent).toHaveBeenCalledWith("team-1", "event-1");
  });

  it("is readable by a parent", async () => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });

    await expect(render()).resolves.toBeDefined();
  });

  it("calls notFound() for someone with no membership", async () => {
    requireTeamAccess.mockRejectedValue(
      new TeamAccessError("nope", "no-membership"),
    );

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("calls notFound() for an event on another team", async () => {
    getEvent.mockResolvedValue(null);

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("lets a database outage propagate rather than reporting a 404", async () => {
    getEvent.mockRejectedValue(new Error("connection refused"));

    await expect(render()).rejects.toThrow("connection refused");
  });
});

describe("EventPage details", () => {
  it("renders the event in Central time, not UTC", async () => {
    const html = await render();

    expect(html).toContain("Game vs Hawks");
    expect(html).toContain("Sat, Aug 15, 2026 at 6:00 PM");
    expect(html).toContain("Field 3");
    expect(html).toContain("Bring water");
  });

  it("names a practice without an opponent", async () => {
    getEvent.mockResolvedValue({
      ...game,
      type: "PRACTICE",
      opponent: null,
      notes: null,
    });

    expect(await render()).toContain("Practice");
  });

  it("handles a game with no opponent recorded", async () => {
    getEvent.mockResolvedValue({ ...game, opponent: null });

    const html = await render();

    expect(html).toContain("Game");
    expect(html).not.toContain("vs ");
  });

  it("shows a placeholder when no location is set", async () => {
    getEvent.mockResolvedValue({ ...game, location: null });

    expect(await render()).toContain("No location set.");
  });
});

describe("EventPage coach controls", () => {
  it("pre-fills the edit form with the Central wall clock", async () => {
    const html = await render();

    expect(html).toContain("Edit event");
    // Not 2026-08-15T23:00, which is the UTC instant.
    expect(html).toContain('value="2026-08-15T18:00"');
  });

  it("hides edit and delete from a parent", async () => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });

    const html = await render();

    expect(html).not.toContain("Edit event");
    expect(html).not.toContain("Delete event");
  });

  it("shows an owner the controls", async () => {
    requireTeamAccess.mockResolvedValue({ role: "OWNER", userId: "user-1" });

    expect(await render()).toContain("Edit event");
  });

  it("asks for confirmation before offering the delete button", async () => {
    const html = await render();

    expect(html).toContain("confirm=delete");
    expect(html).not.toContain("Yes, delete it");
  });

  it("warns that RSVPs go with the event once confirming", async () => {
    const html = await render({ confirm: "delete" });

    expect(html).toContain("Yes, delete it");
    expect(html).toContain("Permanently delete this event and its RSVPs?");
    expect(html).toContain("Cancel");
  });

  it("does not offer the confirm step to a parent", async () => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });

    expect(await render({ confirm: "delete" })).not.toContain("Yes, delete it");
  });
});

describe("EventPage feedback", () => {
  it("renders a known error message", async () => {
    expect(await render({ error: "invalid-datetime" })).toContain(
      "Enter a valid date and time.",
    );
  });

  it("confirms a save", async () => {
    expect(await render({ saved: "1" })).toContain("Saved.");
  });
});
