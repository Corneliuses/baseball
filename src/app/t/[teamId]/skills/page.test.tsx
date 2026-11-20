import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const getTeamById = vi.fn();
const getTeamSkills = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: (...args: unknown[]) => getTeamById(...args),
  getTeamSkills: (...args: unknown[]) => getTeamSkills(...args),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { TeamAccessError } from "@/lib/team-access";
import SkillsPage from "./page";

const team = { id: "team-1", sport: "BASKETBALL", archivedAt: null };

async function render() {
  return renderToStaticMarkup(
    await SkillsPage({ params: Promise.resolve({ teamId: "team-1" }) }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });
  getTeamById.mockResolvedValue(team);
  getTeamSkills.mockResolvedValue(["defensive-slides", "wall-backspin"]);
});

describe("SkillsPage", () => {
  it("is open to every member, and 404s for anyone else", async () => {
    requireTeamAccess.mockRejectedValue(new TeamAccessError("nope", "no-membership"));

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", { intent: "read" });
  });

  it("404s for a baseball team", async () => {
    getTeamById.mockResolvedValue({ ...team, sport: "BASEBALL" });

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getTeamSkills).not.toHaveBeenCalled();
  });

  it("shows a parent each chosen skill by name, in the coach's order, with its animation", async () => {
    const html = await render();

    expect(html.indexOf("Defensive Slides")).toBeGreaterThan(-1);
    expect(html.indexOf("Defensive Slides")).toBeLessThan(
      html.indexOf("Backspin Wall Shots"),
    );
    expect(html).toContain('data-skill-floor="defensive-slides"');
    expect(html).toContain('data-skill-floor="wall-backspin"');
    expect(html).toContain("You need:");
    expect(html).not.toContain("Closeouts");
    expect(html).not.toContain("/skills/edit");
  });

  it("tells families no hoop is needed", async () => {
    expect(await render()).toContain("no hoop needed");
  });

  it("tells a parent the coach hasn't chosen yet", async () => {
    getTeamSkills.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain("No skills yet");
    expect(html).toContain("hasn&#x27;t picked");
  });

  it("links a coach to the picker", async () => {
    requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });

    expect(await render()).toContain('href="/t/team-1/skills/edit"');
  });

  it("gives no picker link on an archived team", async () => {
    requireTeamAccess.mockResolvedValue({ role: "OWNER", userId: "user-1" });
    getTeamById.mockResolvedValue({ ...team, archivedAt: new Date() });

    expect(await render()).not.toContain("/skills/edit");
  });
});
