import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const getTeamById = vi.fn();
const getAllTeams = vi.fn();
const getMemberTeams = vi.fn();
const getCurrentUser = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: (...args: unknown[]) => getTeamById(...args),
  getAllTeams: (...args: unknown[]) => getAllTeams(...args),
  getMemberTeams: (...args: unknown[]) => getMemberTeams(...args),
}));

vi.mock("@/lib/session", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUser(...args),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  usePathname: () => "/t/team-1",
  useRouter: () => ({ push: vi.fn() }),
}));

async function render(teamId = "team-1") {
  const { default: TeamLayout } = await import("./layout");
  return renderToStaticMarkup(
    await TeamLayout({
      children: <p>page body</p>,
      params: Promise.resolve({ teamId }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });
  getCurrentUser.mockResolvedValue({
    id: "user-1",
    email: "parent@example.com",
    name: "Pat",
  });
  getMemberTeams.mockResolvedValue([
    { id: "team-1", name: "Sluggers", season: "Fall 2026", archivedAt: null },
  ]);
  getAllTeams.mockResolvedValue([]);
  getTeamById.mockResolvedValue({
    id: "team-1",
    name: "Sluggers",
    season: "Fall 2026",
    allPlay: true,
    archivedAt: null,
  });
});

describe("TeamLayout", () => {
  // Families accumulate teams across seasons, and / is the only page listing
  // them all. TeamSwitcher hides itself below two teams, so this link is the
  // sole way back for a single-team caller — it must render unconditionally.
  it("links back to team selection even when the caller has one team", async () => {
    const html = await render();

    expect(html).toContain('href="/"');
    expect(html).toContain("All teams");
  });

  it("renders the team name linking to the team home", async () => {
    const html = await render();

    expect(html).toContain("Sluggers");
    expect(html).toContain('href="/t/team-1"');
    expect(html).toContain("page body");
  });
});
