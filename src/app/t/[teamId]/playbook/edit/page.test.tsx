import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const getTeamById = vi.fn();
const getTeamPlaybook = vi.fn();
const pickerProps = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: (...args: unknown[]) => getTeamById(...args),
  getTeamPlaybook: (...args: unknown[]) => getTeamPlaybook(...args),
}));

vi.mock("./PlaybookPicker", () => ({
  PlaybookPicker: (props: Record<string, unknown>) => {
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
import { PLAY_LIBRARY } from "@/lib/plays";
import EditPlaybookPage from "./page";

const team = { id: "team-1", sport: "BASKETBALL", archivedAt: null };

async function render(searchParams: Record<string, string> = {}) {
  return renderToStaticMarkup(
    await EditPlaybookPage({
      params: Promise.resolve({ teamId: "team-1" }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
  getTeamById.mockResolvedValue(team);
  getTeamPlaybook.mockResolvedValue(["give-and-go"]);
});

describe("EditPlaybookPage", () => {
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
    getTeamPlaybook.mockResolvedValue(["retired-play", "give-and-go"]);

    await render();

    expect(pickerProps).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: "team-1",
        library: PLAY_LIBRARY,
        chosen: ["give-and-go"],
        baseline: ["retired-play", "give-and-go"],
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
    expect(await render({ saved: "1" })).toContain("Playbook saved");
    expect(await render({ error: "playbook-changed" })).toContain("Another coach");
    // A hand-typed key falls back to the generic line rather than crashing.
    expect(await render({ error: "constructor" })).toContain("Something went wrong.");
  });
});
