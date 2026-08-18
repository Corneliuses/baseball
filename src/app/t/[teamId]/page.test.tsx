import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const getTeamById = vi.fn();
const listCoachContacts = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: (...args: unknown[]) => getTeamById(...args),
}));

vi.mock("@/lib/memberships", () => ({
  listCoachContacts: (...args: unknown[]) => listCoachContacts(...args),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

async function render(teamId = "team-1") {
  const { default: TeamHomePage } = await import("./page");
  return renderToStaticMarkup(
    await TeamHomePage({ params: Promise.resolve({ teamId }) }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
  listCoachContacts.mockResolvedValue([]);
  getTeamById.mockResolvedValue({
    id: "team-1",
    name: "Sluggers",
    season: "Fall 2026",
    allPlay: true,
    archivedAt: null,
  });
});

describe("TeamHomePage navigation", () => {
  it("shows a coach the coach links but not owner-only ones", async () => {
    const html = await render();

    expect(html).toContain('href="/t/team-1/readiness"');
    expect(html).toContain('href="/t/team-1/chart"');
    expect(html).toContain('href="/t/team-1/directory"');
    expect(html).toContain('href="/t/team-1/roster"');
    expect(html).not.toContain('href="/t/team-1/settings"');
  });

  it("shows a parent only the parent links", async () => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });

    const html = await render();

    expect(html).not.toContain('href="/t/team-1/readiness"');
    expect(html).not.toContain('href="/t/team-1/chart"');
    expect(html).not.toContain('href="/t/team-1/directory"');
    expect(html).not.toContain('href="/t/team-1/settings"');
    // The parent's own surfaces are unaffected.
    expect(html).toContain('href="/t/team-1/view"');
    expect(html).toContain('href="/t/team-1/roster"');
    expect(html).toContain('href="/t/team-1/schedule"');
  });

  it("shows an owner the coach links plus settings", async () => {
    requireTeamAccess.mockResolvedValue({ role: "OWNER", userId: "user-1" });

    const html = await render();

    expect(html).toContain('href="/t/team-1/readiness"');
    expect(html).toContain('href="/t/team-1/directory"');
    expect(html).toContain('href="/t/team-1/settings"');
  });
});

describe("TeamHomePage coach contacts", () => {
  const STAFF = [
    {
      userId: "user-9",
      role: "OWNER",
      name: "Mel",
      email: "mel@example.com",
      phone: "555-9876",
    },
    {
      userId: "user-8",
      role: "COACH",
      name: "Pat",
      email: "pat@example.com",
      phone: null,
    },
  ];

  it("shows a parent the coaching staff's contact card", async () => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });
    listCoachContacts.mockResolvedValue(STAFF);

    const html = await render();

    expect(listCoachContacts).toHaveBeenCalledWith("team-1");
    expect(html).toContain("Coaches");
    expect(html).toContain('href="mailto:mel@example.com"');
    expect(html).toContain('href="tel:555-9876"');
    expect(html).toContain("Pat");
  });

  it("does not fetch or render the card for a coach", async () => {
    const html = await render();

    expect(listCoachContacts).not.toHaveBeenCalled();
    expect(html).not.toContain("Coaches");
  });
});
