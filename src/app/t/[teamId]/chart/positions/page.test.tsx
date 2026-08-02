import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { Position } from "@/generated/prisma/enums";

const requireTeamAccess = vi.fn();
const getTeamById = vi.fn();
const getChart = vi.fn();
const editorProps = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: (...args: unknown[]) => getTeamById(...args),
}));

vi.mock("@/lib/roster", () => ({
  getChart: (...args: unknown[]) => getChart(...args),
}));

// The editor is a client component with its own tests; here it only needs to
// prove which props the page hands it.
vi.mock("./PositionsEditor", () => ({
  PositionsEditor: (props: Record<string, unknown>) => {
    editorProps(props);
    return <div data-testid="editor" />;
  },
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { TeamAccessError } from "@/lib/team-access";

const team = {
  id: "team-1",
  name: "Cubs",
  season: "Fall 2026",
  allPlay: true,
  archivedAt: null,
  createdAt: new Date("2026-07-01"),
};

function chartEntry(
  entryId: string,
  name: string,
  jerseyNumber: number | null,
  position: Position | null,
) {
  return {
    entryId,
    playerId: `player-${entryId}`,
    playerName: name,
    jerseyNumber,
    battingOrder: null,
    position,
  };
}

async function render(searchParams: Record<string, string> = {}) {
  const { default: PositionsPage } = await import("./page");
  return renderToStaticMarkup(
    await PositionsPage({
      params: Promise.resolve({ teamId: "team-1" }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "coach-1" });
  getTeamById.mockResolvedValue(team);
  getChart.mockResolvedValue([
    chartEntry("a", "Ava", 7, "SHORTSTOP"),
    chartEntry("b", "Ben", 4, null),
  ]);
});

describe("PositionsPage access", () => {
  it("requires COACH to read the editor", async () => {
    await render();

    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", {
      intent: "read",
      minRole: "COACH",
    });
  });

  it("calls notFound() for a parent", async () => {
    requireTeamAccess.mockRejectedValue(
      new TeamAccessError("nope", "insufficient-role"),
    );

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("re-throws non-access errors instead of masking them as 404", async () => {
    requireTeamAccess.mockRejectedValue(new Error("db down"));

    await expect(render()).rejects.toThrow("db down");
  });
});

describe("PositionsPage rendering", () => {
  it("hands the editor the team's entries and allPlay flag", async () => {
    await render();

    expect(editorProps).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: "team-1",
        allPlay: true,
        entries: [
          // sortRoster order: numbered ascending — 4 before 7. Placing them on
          // the diamond is the editor's job, not the page's.
          { entryId: "b", playerName: "Ben", jerseyNumber: 4, position: null },
          {
            entryId: "a",
            playerName: "Ava",
            jerseyNumber: 7,
            position: "SHORTSTOP",
          },
        ],
      }),
    );
  });

  it("never loads RSVPs — a player who declined is still placeable", async () => {
    await render();

    const props = editorProps.mock.calls[0][0] as {
      entries: Record<string, unknown>[];
    };
    for (const entry of props.entries) {
      expect(entry).not.toHaveProperty("rsvpState");
    }
  });

  it("renders an archived team read-only, without the editor", async () => {
    getTeamById.mockResolvedValue({
      ...team,
      archivedAt: new Date("2026-07-15"),
    });

    const html = await render();

    expect(html).toContain("This team is archived");
    expect(editorProps).not.toHaveBeenCalled();
  });

  it("shows an empty state linking to the roster when there are no players", async () => {
    getChart.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain("No players yet");
    expect(html).toContain("/t/team-1/roster");
    expect(editorProps).not.toHaveBeenCalled();
  });

  it("links to the batting order editor and the view page", async () => {
    const html = await render();

    expect(html).toContain("/t/team-1/chart");
    expect(html).toContain("/t/team-1/view");
  });

  it("explains the outfield under allPlay and the bench without it", async () => {
    expect(await render()).toContain("plays the outfield");

    getTeamById.mockResolvedValue({ ...team, allPlay: false });
    expect(await render()).toContain("sits on the bench");
  });

  it("renders the error banner for a known error code", async () => {
    const html = await render({ error: "roster-changed" });

    expect(html).toContain("The roster changed while you were editing");
  });

  it("tells a coach whose save was refused that the board shown is the other one's", async () => {
    // The action redirected here and this loader re-ran, so "reload" would be
    // advice to do something that already happened.
    const html = await render({ error: "chart-changed" });

    expect(html).toContain("Another coach changed the positions");
    expect(html).toContain("The diamond below is theirs");
    expect(html).not.toContain("Reload to see");
  });

  it("falls back to a generic message for unknown error codes", async () => {
    const html = await render({ error: "??" });

    expect(html).toContain("Something went wrong.");
  });

  it("renders the saved confirmation", async () => {
    const html = await render({ saved: "1" });

    expect(html).toContain("Positions saved.");
  });
});
