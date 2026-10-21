import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const getTeamById = vi.fn();
const getDepthChart = vi.fn();
const editorProps = vi.fn();
const loadDeclinedEntryIds = vi.fn();
const nextGame = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: (...args: unknown[]) => getTeamById(...args),
}));

vi.mock("@/lib/roster", () => ({
  getDepthChart: (...args: unknown[]) => getDepthChart(...args),
}));

vi.mock("@/lib/chart-declines", () => ({
  loadDeclinedEntryIds: (...args: unknown[]) => loadDeclinedEntryIds(...args),
}));

vi.mock("@/lib/schedule", () => ({
  nextGame: (...args: unknown[]) => nextGame(...args),
}));

vi.mock("./DepthChartEditor", () => ({
  DepthChartEditor: (props: Record<string, unknown>) => {
    editorProps(props);
    return <div data-testid="editor" />;
  },
}));

vi.mock("../DraftStash", () => ({
  DraftStash: () => null,
  ClearDraftStash: () => null,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { TeamAccessError } from "@/lib/team-access";
import DepthChartPage from "./page";

const team = { id: "team-1", sport: "BASKETBALL", archivedAt: null };

function row(entryId: string, playerName: string, jerseyNumber: number | null) {
  return {
    entryId,
    playerId: `player-${entryId}`,
    playerName,
    jerseyNumber,
    courtPosition: null,
    benchOrder: null,
  };
}

async function render(searchParams: Record<string, string> = {}) {
  return renderToStaticMarkup(
    await DepthChartPage({
      params: Promise.resolve({ teamId: "team-1" }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
  getTeamById.mockResolvedValue(team);
  getDepthChart.mockResolvedValue([row("a", "Ava", 7), row("b", "Ben", 4)]);
  nextGame.mockResolvedValue(null);
  loadDeclinedEntryIds.mockResolvedValue([]);
});

describe("DepthChartPage", () => {
  it("is coach-only", async () => {
    requireTeamAccess.mockRejectedValue(new TeamAccessError("nope", "no-membership"));

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", {
      intent: "read",
      minRole: "COACH",
    });
  });

  it("404s for a baseball team", async () => {
    getTeamById.mockResolvedValue({ ...team, sport: "BASEBALL" });

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getDepthChart).not.toHaveBeenCalled();
  });

  it("hands the editor the roster in jersey order", async () => {
    await render();

    expect(editorProps).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: "team-1",
        entries: [
          expect.objectContaining({ entryId: "b", jerseyNumber: 4 }),
          expect.objectContaining({ entryId: "a", jerseyNumber: 7 }),
        ],
      }),
    );
  });

  it("renders an archived team read-only, without the editor", async () => {
    getTeamById.mockResolvedValue({ ...team, archivedAt: new Date() });

    const html = await render();

    expect(html).toContain("This team is archived");
    expect(editorProps).not.toHaveBeenCalled();
  });

  it("shows a known error, and a prototype key falls back instead of crashing", async () => {
    expect(await render({ error: "chart-changed" })).toContain(
      "Another coach changed the depth chart",
    );
    expect(await render({ error: "constructor" })).toContain('role="alert"');
  });
});
