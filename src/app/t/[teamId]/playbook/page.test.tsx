import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const getTeamById = vi.fn();
const getTeamPlaybook = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: (...args: unknown[]) => getTeamById(...args),
  getTeamPlaybook: (...args: unknown[]) => getTeamPlaybook(...args),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { TeamAccessError } from "@/lib/team-access";
import PlaybookPage from "./page";

const team = { id: "team-1", sport: "BASKETBALL", archivedAt: null };

async function render() {
  return renderToStaticMarkup(
    await PlaybookPage({ params: Promise.resolve({ teamId: "team-1" }) }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "user-1" });
  getTeamById.mockResolvedValue(team);
  getTeamPlaybook.mockResolvedValue(["pick-and-roll", "give-and-go"]);
});

describe("PlaybookPage", () => {
  it("is open to every member, and 404s for anyone else", async () => {
    requireTeamAccess.mockRejectedValue(new TeamAccessError("nope", "no-membership"));

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", { intent: "read" });
  });

  it("404s for a baseball team", async () => {
    getTeamById.mockResolvedValue({ ...team, sport: "BASEBALL" });

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getTeamPlaybook).not.toHaveBeenCalled();
  });

  it("shows a parent each chosen play by name, in the coach's order, with its animation", async () => {
    const html = await render();

    expect(html.indexOf("Pick and Roll")).toBeGreaterThan(-1);
    expect(html.indexOf("Pick and Roll")).toBeLessThan(html.indexOf("Give and Go"));
    expect(html).toContain('data-play-court="pick-and-roll"');
    expect(html).toContain('data-play-court="give-and-go"');
    expect(html).not.toContain("Backdoor Cut");
    expect(html).not.toContain("/playbook/edit");
  });

  it("tells a parent the coach hasn't chosen yet", async () => {
    getTeamPlaybook.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain("No plays yet");
    expect(html).toContain("hasn&#x27;t picked");
  });

  it("links a coach to the picker", async () => {
    requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });

    expect(await render()).toContain('href="/t/team-1/playbook/edit"');
  });

  it("gives no picker link on an archived team", async () => {
    requireTeamAccess.mockResolvedValue({ role: "OWNER", userId: "user-1" });
    getTeamById.mockResolvedValue({ ...team, archivedAt: new Date() });

    expect(await render()).not.toContain("/playbook/edit");
  });
});
