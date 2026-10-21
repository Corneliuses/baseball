import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

import type { CourtPosition } from "@/generated/prisma/enums";

// Real drags can't be simulated in jsdom; every drop outcome is
// `resolveDepthDrop` in src/lib/depth-chart.ts, tested there. This covers the
// render, Save/Cancel enablement and the payload.
vi.mock("./actions", () => ({
  saveDepthChartAction: vi.fn(),
}));

import { DepthChartEditor } from "./DepthChartEditor";

function entry(
  entryId: string,
  courtPosition: CourtPosition | null = null,
  benchOrder: number | null = null,
) {
  return {
    entryId,
    playerName: `Player ${entryId}`,
    jerseyNumber: null,
    courtPosition,
    benchOrder,
  };
}

function fieldOf(name: string): {
  starters: Record<string, string>;
  bench: string[];
} {
  const form = screen
    .getByRole("button", { name: "Save depth chart" })
    .closest("form")!;
  return JSON.parse(
    form.querySelector<HTMLInputElement>(`input[name="${name}"]`)!.value,
  );
}

beforeEach(() => {
  cleanup();
});

describe("DepthChartEditor", () => {
  it("draws the five starting spots on the half court and the bench in order", () => {
    render(
      <DepthChartEditor
        teamId="team-1"
        entries={[entry("a", "POINT_GUARD"), entry("b", null, 2), entry("c", null, 1)]}
      />,
    );

    const court = screen.getByRole("region", { name: "Half court" });
    for (const label of ["PG", "SG", "SF", "PF", "C"]) {
      expect(court).toHaveTextContent(label);
    }
    expect(court.querySelectorAll("[data-court-position]")).toHaveLength(5);
    expect(court.querySelector('[data-court-position="POINT_GUARD"]')).toHaveTextContent(
      "Player a",
    );
    const bench = screen.getByRole("region", { name: "Bench" });
    expect(bench.querySelector('[data-bench-slot="0"]')).toHaveTextContent("1st");
    expect(bench.querySelector('[data-bench-slot="0"]')).toHaveTextContent("Player c");
    expect(bench.querySelector('[data-bench-slot="1"]')).toHaveTextContent("Player b");
  });

  it("posts the loaded board as both the draft and the baseline, with Save off", () => {
    render(
      <DepthChartEditor
        teamId="team-1"
        entries={[entry("a", "CENTER"), entry("b", null, 1)]}
      />,
    );

    expect(fieldOf("depth")).toEqual({ starters: { CENTER: "a" }, bench: ["b"] });
    expect(fieldOf("baseline")).toEqual(fieldOf("depth"));
    expect(screen.getByRole("button", { name: "Save depth chart" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("lets the coach save a bench nobody has numbered yet", () => {
    // A team with no chart: everyone sits on the bench in roster order, which
    // is a board worth saving even though the coach has dragged nothing.
    render(<DepthChartEditor teamId="team-1" entries={[entry("a"), entry("b")]} />);

    expect(screen.getByRole("button", { name: "Save depth chart" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fieldOf("depth").bench).toEqual(["a", "b"]);
  });

  it("badges a declined player without moving them", () => {
    render(
      <DepthChartEditor
        teamId="team-1"
        entries={[entry("a", "POINT_GUARD")]}
        declinedEntryIds={["a"]}
      />,
    );

    expect(
      screen
        .getByRole("region", { name: "Half court" })
        .querySelector('[data-court-position="POINT_GUARD"]'),
    ).toHaveTextContent("Not going");
  });
});
