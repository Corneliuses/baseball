import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { TeamSwitcher } from "./TeamSwitcher";
import type { Team } from "@/lib/teams";

function team(overrides: Partial<Team> & { id: string; name: string }): Team {
  return {
    season: null,
    allPlay: true,
    archivedAt: null,
    calendarToken: `token-${overrides.id}`,
    ...overrides,
  } as Team;
}

function render(teams: Team[], currentTeamId = teams[0]?.id ?? "team-1") {
  return renderToStaticMarkup(
    <TeamSwitcher teams={teams} currentTeamId={currentTeamId} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TeamSwitcher", () => {
  it("stays out of the way when there is nowhere to switch to", () => {
    expect(render([team({ id: "team-1", name: "Sharks" })])).toBe("");
  });

  it("tells two same-named teams apart by season", () => {
    // This app is built around coaching the same club across seasons, so
    // "Sharks" and "Sharks" in a dropdown is a coin flip — on the one control
    // whose entire job is picking the right one (C7). `TEAM_SELECT` has always
    // carried `season`; the switcher simply never printed it.
    const html = render([
      team({ id: "team-1", name: "Sharks", season: "2026" }),
      team({ id: "team-2", name: "Sharks", season: "2025" }),
    ]);

    expect(html).toContain("Sharks · 2026");
    expect(html).toContain("Sharks · 2025");
  });

  it("says nothing about a season a team does not have", () => {
    const html = render([
      team({ id: "team-1", name: "Sharks" }),
      team({ id: "team-2", name: "Bears" }),
    ]);

    expect(html).toContain(">Sharks</option>");
    expect(html).not.toContain("·");
  });

  it("still marks an archived team, alongside its season", () => {
    const html = render([
      team({ id: "team-1", name: "Sharks", season: "2026" }),
      team({
        id: "team-2",
        name: "Sharks",
        season: "2025",
        archivedAt: new Date("2026-01-01"),
      }),
    ]);

    expect(html).toContain("Sharks · 2025 (Archived)");
  });
});
