import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const getTeamById = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: (...args: unknown[]) => getTeamById(...args),
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
  getTeamById.mockResolvedValue({
    id: "team-1",
    name: "Sluggers",
    season: "Fall 2026",
    allPlay: true,
    archivedAt: null,
  });
});

describe("TeamHomePage navigation", () => {
  it("links a coach to next-game readiness", async () => {
    const html = await render();

    expect(html).toContain('href="/t/team-1/readiness"');
    expect(html).toContain("Next-game readiness");
  });

  it("does not show readiness to a parent", async () => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });

    const html = await render();

    expect(html).not.toContain('href="/t/team-1/readiness"');
    // The parent's own path to the chart is unaffected.
    expect(html).toContain('href="/t/team-1/view"');
  });

  it("shows readiness to an owner too", async () => {
    requireTeamAccess.mockResolvedValue({ role: "OWNER", userId: "user-1" });

    const html = await render();

    expect(html).toContain('href="/t/team-1/readiness"');
  });

  it("links a coach to the directory", async () => {
    const html = await render();

    expect(html).toContain('href="/t/team-1/directory"');
  });

  it("does not show the directory to a parent", async () => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });

    const html = await render();

    expect(html).not.toContain('href="/t/team-1/directory"');
    // The roster stays open to a parent — it is the team's players, not
    // every family's contact details.
    expect(html).toContain('href="/t/team-1/roster"');
  });

  it("shows the directory to an owner too", async () => {
    requireTeamAccess.mockResolvedValue({ role: "OWNER", userId: "user-1" });

    const html = await render();

    expect(html).toContain('href="/t/team-1/directory"');
  });
});
