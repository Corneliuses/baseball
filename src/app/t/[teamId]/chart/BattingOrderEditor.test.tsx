import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

// The action module is a "use server" file that pulls in next/cache — stub it
// so this test exercises only the client component. Real drags can't be
// simulated in jsdom (no pointer geometry); every drag OUTCOME is a pure
// function in src/lib/chart.ts with its own exhaustive tests, and this file
// covers what's left: rendering, Save/Cancel enablement, and the payload.
vi.mock("./actions", () => ({
  saveBattingOrderAction: vi.fn(),
}));

import { BattingOrderEditor, type ChartEditorEntry } from "./BattingOrderEditor";

function entry(
  entryId: string,
  battingOrder: number | null,
  jerseyNumber: number | null = null,
): ChartEditorEntry {
  return { entryId, playerName: `Player ${entryId}`, jerseyNumber, battingOrder };
}

beforeEach(() => {
  cleanup();
});

describe("BattingOrderEditor", () => {
  it("renders every player in batting order with slot numbers", () => {
    render(
      <BattingOrderEditor
        teamId="team-1"
        allPlay={true}
        entries={[entry("a", 2), entry("b", 1), entry("c", 3)]}
      />,
    );

    const list = screen.getByRole("list", { name: "Batting order" });
    const items = Array.from(list.querySelectorAll("li"));
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Player b");
    expect(items[1]).toHaveTextContent("Player a");
    expect(items[2]).toHaveTextContent("Player c");
  });

  it("shows no unassigned pool when allPlay is true", () => {
    render(
      <BattingOrderEditor
        teamId="team-1"
        allPlay={true}
        entries={[entry("a", 1), entry("b", null)]}
      />,
    );

    // Every player is in the order; the pool section doesn't exist.
    expect(screen.queryByText("Not batting")).not.toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Batting order" });
    expect(list.querySelectorAll("li")).toHaveLength(2);
    expect(list).toHaveTextContent("Player b");
  });

  it("renders nine slots plus a pool when allPlay is false", () => {
    const entries = [
      ...Array.from({ length: 9 }, (_, i) => entry(`p${i + 1}`, i + 1)),
      entry("bench-1", null),
      entry("bench-2", null),
    ];

    render(
      <BattingOrderEditor teamId="team-1" allPlay={false} entries={entries} />,
    );

    const list = screen.getByRole("list", { name: "Batting order" });
    expect(list.querySelectorAll("li")).toHaveLength(9);

    const pool = screen.getByText("Not batting").closest("section")!;
    expect(pool).toHaveTextContent("Player bench-1");
    expect(pool).toHaveTextContent("Player bench-2");
  });

  it("renders empty slots as drop targets when the order is unset", () => {
    render(
      <BattingOrderEditor
        teamId="team-1"
        allPlay={false}
        entries={[entry("a", 1), entry("b", null), entry("c", null)]}
      />,
    );

    expect(screen.getAllByText("Empty slot")).toHaveLength(2);
  });

  it("shows jersey numbers when present", () => {
    render(
      <BattingOrderEditor
        teamId="team-1"
        allPlay={true}
        entries={[entry("a", 1, 7)]}
      />,
    );

    expect(screen.getByText("#7")).toBeInTheDocument();
  });

  it("posts the team id and the slots array, and disables Save/Cancel until dirty", () => {
    render(
      <BattingOrderEditor
        teamId="team-1"
        allPlay={true}
        entries={[entry("a", 2), entry("b", 1)]}
      />,
    );

    const saveButton = screen.getByRole("button", { name: "Save order" });
    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(saveButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();

    const form = saveButton.closest("form")!;
    const teamIdInput = form.querySelector<HTMLInputElement>('input[name="teamId"]')!;
    const orderInput = form.querySelector<HTMLInputElement>('input[name="order"]')!;
    expect(teamIdInput.value).toBe("team-1");
    // Slot position IS the batting order — the payload is ids by slot, and
    // the server derives the numbers.
    expect(JSON.parse(orderInput.value)).toEqual(["b", "a"]);
  });

  it("posts the order it loaded as the lost-update baseline", () => {
    // Without this field the action refuses every save, and the action's own
    // tests can't catch that — they set the baseline themselves.
    render(
      <BattingOrderEditor
        teamId="team-1"
        allPlay={false}
        entries={[entry("a", 2), entry("b", 1), entry("c", null)]}
      />,
    );

    const form = screen.getByRole("button", { name: "Save order" }).closest("form")!;
    const baseline = form.querySelector<HTMLInputElement>('input[name="baseline"]')!;

    // Stored order, not the draft: seated players in batting order, and the
    // benched one left out entirely.
    expect(JSON.parse(baseline.value)).toEqual(["b", "a"]);
  });

  it("keeps the baseline on the order that loaded, not the one being dragged", () => {
    // The baseline answers "what did the database say when this page opened",
    // so it must not drift as the coach edits — otherwise a concurrent save by
    // another coach would slip through whenever this coach had touched
    // anything.
    const entries = [entry("a", 1), entry("b", 2)];
    const { rerender } = render(
      <BattingOrderEditor teamId="team-1" allPlay={true} entries={entries} />,
    );

    const baselineOf = () =>
      screen
        .getByRole("button", { name: "Save order" })
        .closest("form")!
        .querySelector<HTMLInputElement>('input[name="baseline"]')!.value;
    const before = baselineOf();

    rerender(<BattingOrderEditor teamId="team-1" allPlay={true} entries={entries} />);

    expect(baselineOf()).toBe(before);
  });

  it("keeps keyboard drag handles on players but not on empty slots", () => {
    render(
      <BattingOrderEditor
        teamId="team-1"
        allPlay={false}
        entries={[entry("a", 1), entry("b", null)]}
      />,
    );

    const list = screen.getByRole("list", { name: "Batting order" });
    const items = Array.from(list.querySelectorAll("li"));
    const playerSlot = items.find((li) => li.textContent?.includes("Player a"))!;
    const emptySlot = items.find((li) => li.textContent?.includes("Empty slot"))!;

    // dnd-kit's keyboard/screen-reader affordance belongs on real players
    // only — an empty slot is a drop target, not a dead tab stop.
    expect(playerSlot).toHaveAttribute("role", "button");
    expect(playerSlot).toHaveAttribute("tabindex", "0");
    expect(emptySlot).not.toHaveAttribute("role");
    expect(emptySlot).not.toHaveAttribute("tabindex");
    expect(emptySlot).not.toHaveAttribute("aria-roledescription");
  });

  it("does not blow up on pointer events (smoke: sensors attached)", () => {
    render(
      <BattingOrderEditor
        teamId="team-1"
        allPlay={true}
        entries={[entry("a", 1), entry("b", 2)]}
      />,
    );

    const list = screen.getByRole("list", { name: "Batting order" });
    const item = list.querySelector("li")!;
    fireEvent.mouseDown(item, { clientX: 0, clientY: 0 });
    fireEvent.mouseUp(item);
    expect(screen.getByRole("button", { name: "Save order" })).toBeDisabled();
  });
});
