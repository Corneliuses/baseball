import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { useSport } from "@/components/SportProvider";

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

function SportProbe() {
  return <p>sport is {useSport()}</p>;
}

async function render(teamId = "team-1", children = <p>page body</p>) {
  const { default: TeamLayout } = await import("./layout");
  return renderToStaticMarkup(
    await TeamLayout({
      children,
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
    sport: "BASEBALL",
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

  // The nav's lineup tabs follow the team's sport, which only the layout knows.
  it("hands TeamNav the team's sport, so a basketball coach edits the depth chart", async () => {
    requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
    expect(await render()).toContain('href="/t/team-1/chart"');

    getTeamById.mockResolvedValue({
      id: "team-1",
      name: "Hoopers",
      season: "Winter 2026",
      allPlay: true,
      sport: "BASKETBALL",
      archivedAt: null,
    });

    const html = await render();
    expect(html).not.toContain('href="/t/team-1/chart"');
    expect(html).toContain('href="/t/team-1/chart/depth"');
  });

  // The basketball palette is a scoped attribute, set once here for the whole
  // page (header band included); baseball is the default theme and gets none.
  it("puts a basketball team's pages under the basketball palette", async () => {
    const baseball = await render();
    expect(baseball).not.toContain("data-sport");

    getTeamById.mockResolvedValue({
      id: "team-1",
      name: "Hoopers",
      season: "Winter 2026",
      allPlay: true,
      sport: "BASKETBALL",
      archivedAt: null,
    });

    const html = await render();
    expect(html).toContain('data-sport="basketball"');
    // The ball beside the name, decorative, so the heading's name is the text.
    const heading = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(html)?.[1] ?? "";
    expect(heading).toContain('aria-hidden="true"');
    expect(heading).toContain("Hoopers");
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

  it("hands the team's sport to the page and its loading fallback", async () => {
    // loading.tsx renders inside this layout with no data of its own, so the
    // provider here is the only way its spinner learns which ball to draw.
    getTeamById.mockResolvedValue({
      id: "team-1",
      name: "Hoopers",
      season: "Winter 2026",
      allPlay: false,
      sport: "BASKETBALL",
      archivedAt: null,
    });

    const html = await render("team-1", <SportProbe />);

    expect(html).toContain("sport is BASKETBALL");
  });
});
