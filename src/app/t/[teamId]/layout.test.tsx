import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

/// Every rendered anchor (open tag through close tag) pointing at one href.
/// The layout renders TeamNav underneath, whose Home tab shares the team-home
/// href — so a bare toContain on an href or a label can be satisfied by the
/// wrong element entirely. Assertions here read the content of the anchor
/// they name. Anchors never nest, so the lazy match is safe.
function linksTo(html: string, href: string): string[] {
  return [...html.matchAll(/<a [^>]*>[\s\S]*?<\/a>/g)]
    .map((match) => match[0])
    .filter((anchor) => anchor.includes(`href="${href}"`));
}

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
  getTeamById.mockResolvedValue({
    id: "team-1",
    name: "Sluggers",
    season: "Fall 2026",
    allPlay: true,
    archivedAt: null,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("TeamLayout", () => {
  // The back link must render unconditionally — see the comment in layout.tsx.
  // This case pins the load-bearing half: one team, so TeamSwitcher hides
  // itself and this link is the only way back to /.
  it("links back to team selection even when the caller has one team", async () => {
    const html = await render();

    expect(html).not.toContain("<select");

    const [backLink, ...rest] = linksTo(html, "/");
    expect(backLink).toBeDefined();
    expect(rest).toHaveLength(0);
    expect(backLink).toContain("All teams");
    // The arrow is decorative; it must stay out of the accessible name.
    expect(backLink).toContain('<span aria-hidden="true">←</span>');
  });

  it("keeps the back link alongside the switcher for a multi-team owner", async () => {
    vi.stubEnv("OWNER_EMAIL", "owner@example.com");
    getCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "owner@example.com",
      name: "Mel",
    });
    getAllTeams.mockResolvedValue([
      { id: "team-1", name: "Sluggers", season: "Fall 2026", archivedAt: null },
      { id: "team-2", name: "Rockets", season: "Fall 2025", archivedAt: null },
    ]);

    const html = await render();

    expect(getAllTeams).toHaveBeenCalled();
    expect(getMemberTeams).not.toHaveBeenCalled();
    expect(html).toContain("<select");
    expect(linksTo(html, "/")[0]).toContain("All teams");
  });

  it("renders the team name linking to the team home", async () => {
    const html = await render();

    // TeamNav's Home tab shares this href, so the header link is identified
    // by carrying the team name rather than by the href alone.
    const headerLink = linksTo(html, "/t/team-1").find((anchor) =>
      anchor.includes("Sluggers"),
    );
    expect(headerLink).toBeDefined();
    expect(html).toContain("page body");
  });
});
