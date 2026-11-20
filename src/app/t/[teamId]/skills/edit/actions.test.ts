import { describe, it, expect, vi, beforeEach } from "vitest";

const requireTeamAccess = vi.fn();
const getTeamById = vi.fn();
const getTeamSkills = vi.fn();
const saveTeamSkills = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: (...args: unknown[]) => getTeamById(...args),
  getTeamSkills: (...args: unknown[]) => getTeamSkills(...args),
  saveTeamSkills: (...args: unknown[]) => saveTeamSkills(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

const REDIRECT_PREFIX = "NEXT_REDIRECT:";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT:")) {
      throw error;
    }
  },
}));

import { TeamAccessError } from "@/lib/team-access";
import { saveSkillsAction } from "./actions";

function form(skills: string[], baseline: string[] = []): FormData {
  const data = new FormData();
  data.set("teamId", "team-1");
  data.set("baseline", JSON.stringify(baseline));
  for (const skill of skills) {
    data.append("skill", skill);
  }
  return data;
}

async function redirectUrlOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(REDIRECT_PREFIX)) {
      return error.message.slice(REDIRECT_PREFIX.length);
    }
    throw error;
  }
  throw new Error("expected a redirect");
}

const PAGE = "/t/team-1/skills/edit";

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
  getTeamById.mockResolvedValue({ id: "team-1", sport: "BASKETBALL" });
  getTeamSkills.mockResolvedValue([]);
  saveTeamSkills.mockResolvedValue(undefined);
});

describe("saveSkillsAction", () => {
  it("checks coach write access before anything else", async () => {
    requireTeamAccess.mockRejectedValue(new TeamAccessError("archived", "archived"));

    expect(await redirectUrlOf(saveSkillsAction(form(["wall-backspin"])))).toBe(
      `${PAGE}?error=access`,
    );
    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", {
      intent: "write",
      minRole: "COACH",
    });
    expect(saveTeamSkills).not.toHaveBeenCalled();
  });

  it("saves the ticked skills in library order", async () => {
    const url = await redirectUrlOf(
      saveSkillsAction(form(["closeouts", "wall-backspin"])),
    );

    expect(url).toBe(`${PAGE}?saved=1`);
    expect(saveTeamSkills).toHaveBeenCalledWith("team-1", [
      "wall-backspin",
      "closeouts",
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/t/[teamId]/skills", "page");
  });

  it("saves an empty list when nothing is ticked", async () => {
    getTeamSkills.mockResolvedValue(["retired-skill"]);

    await redirectUrlOf(saveSkillsAction(form([], ["retired-skill"])));

    expect(saveTeamSkills).toHaveBeenCalledWith("team-1", []);
  });

  it("refuses a sixth skill, whatever the form allowed", async () => {
    const six = ["a", "b", "c", "d", "e", "f"];

    expect(await redirectUrlOf(saveSkillsAction(form(six)))).toBe(
      `${PAGE}?error=too-many-skills`,
    );
    expect(saveTeamSkills).not.toHaveBeenCalled();
  });

  it("refuses a skill the library doesn't have", async () => {
    expect(await redirectUrlOf(saveSkillsAction(form(["nope"])))).toBe(
      `${PAGE}?error=unknown-skill`,
    );
  });

  it("never writes skills onto a baseball team", async () => {
    getTeamById.mockResolvedValue({ id: "team-1", sport: "BASEBALL" });

    expect(await redirectUrlOf(saveSkillsAction(form(["wall-backspin"])))).toBe(
      `${PAGE}?error=access`,
    );
    expect(saveTeamSkills).not.toHaveBeenCalled();
  });

  it("refuses to overwrite another coach's save", async () => {
    getTeamSkills.mockResolvedValue(["defensive-slides"]);

    expect(await redirectUrlOf(saveSkillsAction(form(["wall-backspin"], [])))).toBe(
      `${PAGE}?error=skills-changed`,
    );
    expect(saveTeamSkills).not.toHaveBeenCalled();
  });

  it("refuses an unreadable baseline", async () => {
    const data = form(["wall-backspin"]);
    data.set("baseline", "{not json");

    expect(await redirectUrlOf(saveSkillsAction(data))).toBe(
      `${PAGE}?error=invalid-skills`,
    );
  });
});
