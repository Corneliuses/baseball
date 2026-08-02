import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

import type { Position } from "@/generated/prisma/enums";

// The action module is a "use server" file that pulls in next/cache — stub it
// so this test exercises only the client component. Real drags can't be
// simulated in jsdom (no pointer geometry); every drag OUTCOME is a pure
// function in src/lib/chart.ts with its own exhaustive tests, and this file
// covers what's left: rendering per mode, Save/Cancel enablement, the payload,
// and that RSVP state is nowhere near this component.
vi.mock("./actions", () => ({
  savePositionsAction: vi.fn(),
}));

import { PositionsEditor, type PositionsEditorEntry } from "./PositionsEditor";

function entry(
  entryId: string,
  position: Position | null = null,
  jerseyNumber: number | null = null,
): PositionsEditorEntry {
  return { entryId, playerName: `Player-${entryId}`, jerseyNumber, position };
}

function payloadOf(): Record<string, string> {
  const form = screen.getByRole("button", { name: "Save positions" }).closest("form")!;
  const input = form.querySelector<HTMLInputElement>('input[name="positions"]')!;
  return JSON.parse(input.value);
}

beforeEach(() => {
  cleanup();
});

describe("PositionsEditor", () => {
  it("renders six infield targets and an Outfield zone when allPlay is true", () => {
    render(
      <PositionsEditor
        teamId="team-1"
        allPlay={true}
        entries={[entry("a", "PITCHER"), entry("b"), entry("c")]}
      />,
    );

    const field = screen.getByRole("region", { name: "Diamond" });
    // P, C, 1B, 2B, 3B, SS — the outfield is one zone, not three spots.
    for (const label of ["P", "C", "1B", "2B", "3B", "SS"]) {
      expect(field).toHaveTextContent(label);
    }
    expect(field).not.toHaveTextContent("LF");
    expect(field).not.toHaveTextContent("RF");

    const zone = screen.getByRole("region", { name: "Outfield" });
    expect(zone).toHaveTextContent("Player-b");
    expect(zone).toHaveTextContent("Player-c");
    expect(screen.queryByRole("region", { name: "Bench" })).not.toBeInTheDocument();
  });

  it("renders all nine targets and a Bench zone when allPlay is false", () => {
    render(
      <PositionsEditor
        teamId="team-1"
        allPlay={false}
        entries={[entry("a", "LEFT_FIELD"), entry("b")]}
      />,
    );

    const field = screen.getByRole("region", { name: "Diamond" });
    for (const label of ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"]) {
      expect(field).toHaveTextContent(label);
    }
    expect(field).toHaveTextContent("Player-a");

    const zone = screen.getByRole("region", { name: "Bench" });
    expect(zone).toHaveTextContent("Player-b");
  });

  it("pools an allPlay team's stale outfield player instead of seating them", () => {
    render(
      <PositionsEditor
        teamId="team-1"
        allPlay={true}
        entries={[entry("a", "CENTER_FIELD")]}
      />,
    );

    // Visible in the outfield zone before any save, so the collapse to null
    // isn't a surprise.
    expect(screen.getByRole("region", { name: "Outfield" })).toHaveTextContent(
      "Player-a",
    );
    expect(payloadOf()).toEqual({});
  });

  it("marks unfilled positions Open", () => {
    render(
      <PositionsEditor
        teamId="team-1"
        allPlay={true}
        entries={[entry("a", "PITCHER")]}
      />,
    );

    // Six infield spots, one filled.
    expect(screen.getAllByText("Open")).toHaveLength(5);
  });

  it("shows only first names on the diamond and full names in the zone", () => {
    render(
      <PositionsEditor
        teamId="team-1"
        allPlay={true}
        entries={[
          { entryId: "a", playerName: "Ava Reyes", jerseyNumber: 7, position: "PITCHER" },
          { entryId: "b", playerName: "Bo Chen", jerseyNumber: 3, position: null },
        ]}
      />,
    );

    // Markers sit close together; a full name overruns its neighbour.
    expect(screen.getByRole("region", { name: "Diamond" })).toHaveTextContent("Ava");
    expect(screen.getByRole("region", { name: "Diamond" })).not.toHaveTextContent(
      "Ava Reyes",
    );
    const zone = screen.getByRole("region", { name: "Outfield" });
    expect(zone).toHaveTextContent("Bo Chen");
    expect(zone).toHaveTextContent("#3");
  });

  it("posts the team id and the position map, and disables Save/Cancel until dirty", () => {
    render(
      <PositionsEditor
        teamId="team-1"
        allPlay={true}
        entries={[entry("a", "PITCHER"), entry("b", "CATCHER"), entry("c")]}
      />,
    );

    expect(screen.getByRole("button", { name: "Save positions" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    const form = screen
      .getByRole("button", { name: "Save positions" })
      .closest("form")!;
    expect(
      form.querySelector<HTMLInputElement>('input[name="teamId"]')!.value,
    ).toBe("team-1");
    // Only the diamond is posted; the zone is everyone else, and the server
    // nulls them in phase 1 of the write.
    expect(payloadOf()).toEqual({ PITCHER: "a", CATCHER: "b" });
  });

  it("gives every player a keyboard drag handle", () => {
    render(
      <PositionsEditor
        teamId="team-1"
        allPlay={true}
        entries={[entry("a", "PITCHER"), entry("b")]}
      />,
    );

    for (const name of ["a", "b"]) {
      const chip = screen.getByText(`Player-${name}`);
      expect(chip).toHaveAttribute("role", "button");
      expect(chip).toHaveAttribute("tabindex", "0");
    }
  });

  it("does not blow up on pointer events (smoke: sensors attached)", () => {
    render(
      <PositionsEditor
        teamId="team-1"
        allPlay={true}
        entries={[entry("a", "PITCHER")]}
      />,
    );

    const chip = screen.getByText("Player-a");
    fireEvent.mouseDown(chip, { clientX: 0, clientY: 0 });
    fireEvent.mouseUp(chip);
    expect(screen.getByRole("button", { name: "Save positions" })).toBeDisabled();
  });
});
