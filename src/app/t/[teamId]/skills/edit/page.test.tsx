import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const getTeamById = vi.fn();
const getTeamSkills = vi.fn();
const pickerProps = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: (...args: unknown[]) => getTeamById(...args),
  getTeamSkills: (...args: unknown[]) => getTeamSkills(...args),
}));

vi.mock("./SkillsPicker", () => ({
  SkillsPicker: (props: Record<string, unknown>) => {
    pickerProps(props);
    return <div data-testid="picker" />;
  },
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { TeamAccessError } from "@/lib/team-access";
import { SKILL_LIBRARY } from "@/lib/skills";
import EditSkillsPage from "./page";

const team = { id: "team-1", sport: "BASKETBALL", archivedAt: null };

async function render(searchParams: Record<string, string> = {}) {
  return renderToStaticMarkup(
    await EditSkillsPage({
      params: Promise.resolve({ teamId: "team-1" }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
  getTeamById.mockResolvedValue(team);
  getTeamSkills.mockResolvedValue(["wall-backspin"]);
});

describe("EditSkillsPage", () => {
  it("is coach-only", async () => {
    requireTeamAccess.mockRejectedValue(new TeamAccessError("nope", "insufficient-role"));

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", {
      intent: "read",
      minRole: "COACH",
    });
  });

  it("404s for a baseball team", async () => {
    getTeamById.mockResolvedValue({ ...team, sport: "BASEBALL" });

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("hands the picker the whole library, the ticks, and the stored baseline", async () => {
    getTeamSkills.mockResolvedValue(["retired-skill", "wall-backspin"]);

    await render();

    expect(pickerProps).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: "team-1",
        library: SKILL_LIBRARY,
        chosen: ["wall-backspin"],
        baseline: ["retired-skill", "wall-backspin"],
      }),
    );
  });

  it("renders an archived team read-only, without the picker", async () => {
    getTeamById.mockResolvedValue({ ...team, archivedAt: new Date() });

    const html = await render();

    expect(html).toContain("archived");
    expect(pickerProps).not.toHaveBeenCalled();
  });

  it("confirms a save and explains a refusal", async () => {
    expect(await render({ saved: "1" })).toContain("Skills saved");
    expect(await render({ error: "skills-changed" })).toContain("Another coach");
    // A hand-typed key falls back to the generic line rather than crashing.
    expect(await render({ error: "constructor" })).toContain("Something went wrong.");
  });
});
