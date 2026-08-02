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

function fieldOf(name: string): Record<string, string> {
  const form = screen.getByRole("button", { name: "Save positions" }).closest("form")!;
  return JSON.parse(
    form.querySelector<HTMLInputElement>(`input[name="${name}"]`)!.value,
  );
}

function payloadOf(): Record<string, string> {
  return fieldOf("positions");
}

beforeEach(() => {
  cleanup();
});

describe("PositionsEditor", () => {
  it("renders five infield targets and an Outfield zone when allPlay is true", () => {
    render(
      <PositionsEditor
        teamId="team-1"
        allPlay={true}
        entries={[entry("a", "PITCHER"), entry("b"), entry("c")]}
      />,
    );

    const field = screen.getByRole("region", { name: "Diamond" });
    // P, 1B, 2B, 3B, SS — the outfield is one zone, not three spots, and an
    // allPlay team has no catcher because the coach pitches.
    for (const label of ["P", "1B", "2B", "3B", "SS"]) {
      expect(field).toHaveTextContent(label);
    }
    expect(field).not.toHaveTextContent("LF");
    expect(field).not.toHaveTextContent("RF");
    expect(
      field.querySelector('[data-position="CATCHER"]'),
    ).not.toBeInTheDocument();

    const zone = screen.getByRole("region", { name: "Outfield" });
    expect(zone).toHaveTextContent("Player-b");
    expect(zone).toHaveTextContent("Player-c");
    expect(screen.queryByRole("region", { name: "Bench" })).not.toBeInTheDocument();
  });

  it("puts the zone above the diamond", () => {
    // The zone is where every player starts and where the coach's thumb comes
    // back between drags; below a 400x520 board it is off the bottom of a
    // phone. DOCUMENT_POSITION_FOLLOWING = the diamond comes after the zone.
    render(
      <PositionsEditor
        teamId="team-1"
        allPlay={true}
        entries={[entry("a", "PITCHER"), entry("b")]}
      />,
    );

    const zone = screen.getByRole("region", { name: "Outfield" });
    const field = screen.getByRole("region", { name: "Diamond" });

    expect(zone.compareDocumentPosition(field)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
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

  it("offers Save for a stale outfield row the coach hasn't touched", () => {
    // The row still says CENTER_FIELD and the payload above says {}, so saving
    // WOULD change the database. Gating Save on "has the coach moved anyone"
    // strands the row: the board already looks right, so there is nothing the
    // coach can do to make the editor dirty short of an unrelated change.
    render(
      <PositionsEditor
        teamId="team-1"
        allPlay={true}
        entries={[entry("a", "CENTER_FIELD")]}
      />,
    );

    expect(screen.getByRole("button", { name: "Save positions" })).toBeEnabled();
    // Nothing to undo, though — Cancel tracks the coach's edits, not the write.
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("posts the board it loaded as the lost-update baseline", () => {
    // Without this field the action refuses every save, and the action's own
    // tests can't catch that — they set the baseline themselves.
    render(
      <PositionsEditor
        teamId="team-1"
        allPlay={false}
        entries={[entry("a", "PITCHER"), entry("b")]}
      />,
    );

    expect(fieldOf("baseline")).toEqual({ PITCHER: "a" });
  });

  it("puts a stale outfield row in the baseline even though the board can't show it", () => {
    // The whole reason the baseline is storedPositions and not the draft: the
    // action compares it against a fresh read, so a baseline that had already
    // dropped this row would look stale on every single save.
    render(
      <PositionsEditor
        teamId="team-1"
        allPlay={true}
        entries={[entry("a", "CENTER_FIELD")]}
      />,
    );

    expect(payloadOf()).toEqual({});
    expect(fieldOf("baseline")).toEqual({ CENTER_FIELD: "a" });
  });

  it("leaves Save disabled when the board already matches what is stored", () => {
    // The mirror of the case above: no stale row, so a save would be a no-op.
    render(
      <PositionsEditor
        teamId="team-1"
        allPlay={true}
        entries={[entry("a", "PITCHER"), entry("b")]}
      />,
    );

    expect(screen.getByRole("button", { name: "Save positions" })).toBeDisabled();
  });

  it("marks unfilled positions Open", () => {
    render(
      <PositionsEditor
        teamId="team-1"
        allPlay={true}
        entries={[entry("a", "PITCHER")]}
      />,
    );

    // Five infield spots, one filled.
    expect(screen.getAllByText("Open")).toHaveLength(4);
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
        entries={[entry("a", "PITCHER"), entry("b", "SHORTSTOP"), entry("c")]}
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
    expect(payloadOf()).toEqual({ PITCHER: "a", SHORTSTOP: "b" });
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
