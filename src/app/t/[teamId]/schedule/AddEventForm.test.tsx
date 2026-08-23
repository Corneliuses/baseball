import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render as renderDom } from "@testing-library/react";

import type { AddEventState } from "./event-form-state";
import type { ScheduleContext } from "./schedule-context";

let actionState: AddEventState = { status: "idle" };
let actionPending = false;

/// The hook is the form's only source of feedback, and driving it for real
/// would mean running a server action from jsdom. What belongs here is what
/// the form renders per state; producing those states is the action's suite.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useActionState: () => [actionState, vi.fn(), actionPending],
  };
});

/// `"use server"`, and it reaches Prisma through @/lib/schedule.
vi.mock("./actions", () => ({ createEventAction: vi.fn() }));

import { AddEventForm } from "./AddEventForm";

const MONTH_CONTEXT: ScheduleContext = {
  view: "month",
  month: "2026-08",
  past: false,
};

function render(
  state: AddEventState,
  props: Partial<React.ComponentProps<typeof AddEventForm>> = {},
) {
  actionState = state;
  return renderToStaticMarkup(
    <AddEventForm teamId="team-1" context={MONTH_CONTEXT} {...props} />,
  );
}

/// One named field's rendered tag, so a value assertion lands on the right box.
function fieldFor(html: string, name: string): string {
  const match = new RegExp(
    `<(?:input|select|textarea)[^>]*name="${name}"[^>]*>`,
  ).exec(html);
  expect(match, `expected a field named ${name}`).not.toBeNull();
  return match![0];
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  actionState = { status: "idle" };
  actionPending = false;
});

describe("AddEventForm at rest", () => {
  it("offers the five fields the event model has", () => {
    const html = render({ status: "idle" });

    for (const name of ["type", "startsAt", "location", "opponent", "notes"]) {
      expect(html).toContain(`name="${name}"`);
    }
  });

  it("carries the current view so the one navigating path can return to it", () => {
    // Only the access failure still redirects. Everything else returns — but
    // that one path used to land a list-view coach on the month grid.
    const html = render({ status: "idle" });

    expect(html).toContain('name="view" value="month"');
    expect(html).toContain('name="month" value="2026-08"');
  });

  it("caps the three text fields where the action does", () => {
    // These errors were reachable purely by typing before the caps existed.
    const html = render({ status: "idle" });

    expect(fieldFor(html, "location")).toContain('maxLength="200"');
    expect(fieldFor(html, "opponent")).toContain('maxLength="200"');
    expect(fieldFor(html, "notes")).toContain('maxLength="2000"');
  });
});

describe("AddEventForm after an add", () => {
  const added: AddEventState = {
    status: "added",
    keep: {
      type: "GAME",
      startsAt: "",
      location: "Field 3",
      opponent: "Hawks",
      notes: "",
    },
    summary: "Game on Sat, Aug 15, 2026 at 6:00 PM",
  };

  it("keeps the fields that barely change between games", () => {
    // The audit's finding in one assertion: type, location and opponent are
    // the same for six home games in a row, and the old form cleared them
    // every time (C1).
    const html = render(added);

    expect(fieldFor(html, "location")).toContain('value="Field 3"');
    expect(fieldFor(html, "opponent")).toContain('value="Hawks"');
  });

  it("always clears the date", () => {
    // Two events cannot share a start time, and a stale one left in the box is
    // the single most dangerous thing this form could keep.
    const html = render(added);

    expect(fieldFor(html, "startsAt")).toContain('value=""');
  });

  it("names what it just added and says what it kept", () => {
    const html = render(added);

    expect(html).toContain("Game on Sat, Aug 15, 2026 at 6:00 PM");
    expect(html).toContain("still here");
    expect(html).toContain('role="status"');
  });
});

describe("AddEventForm after a rejection", () => {
  const rejected: AddEventState = {
    status: "invalid",
    code: "invalid-datetime",
    values: {
      type: "PRACTICE",
      startsAt: "not-a-time",
      location: "Field 3",
      opponent: "",
      notes: "Bring water",
    },
  };

  it("keeps every field, not just the one that failed", () => {
    const html = render(rejected);

    expect(fieldFor(html, "startsAt")).toContain('value="not-a-time"');
    expect(fieldFor(html, "location")).toContain('value="Field 3"');
    expect(html).toContain("Bring water");
  });

  it("says what was wrong and points the date box at the message", () => {
    const html = render(rejected);

    expect(html).toContain("Enter a valid date and time.");
    expect(html).toContain('role="alert"');
    expect(fieldFor(html, "startsAt")).toContain('aria-describedby="add-event-error"');
  });
});

describe("AddEventForm opened from Duplicate", () => {
  const duplicated = {
    initialValues: {
      type: "GAME",
      startsAt: "",
      location: "Field 3",
      opponent: "Hawks",
      notes: "Bring water",
    },
    duplicatedFrom: "Game vs Hawks",
  };

  it("arrives pre-filled from the copied event", () => {
    const html = render({ status: "idle" }, duplicated);

    expect(fieldFor(html, "location")).toContain('value="Field 3"');
    expect(fieldFor(html, "opponent")).toContain('value="Hawks"');
  });

  it("leaves the date empty for the coach to choose", () => {
    // The reason Duplicate is a prefill link and not a clone action: a copied
    // event with a copied date would be a real, wrongly-dated fixture on the
    // schedule — pushing RSVPs and the calendar feed — until someone caught it.
    const html = render({ status: "idle" }, duplicated);

    expect(fieldFor(html, "startsAt")).toContain('value=""');
  });

  it("says what it was copied from", () => {
    const html = render({ status: "idle" }, duplicated);

    expect(html).toContain("Game vs Hawks");
  });
});

/// The `seed` initializer covers the first render — which is the whole of the
/// no-JavaScript path, and all the suite above exercises. These drive the
/// *other* half: the render-phase sync that runs when a second action result
/// arrives at an already-mounted form. Deleting that block leaves every test
/// above green while the real form stops clearing the date between adds.
describe("AddEventForm across successive results", () => {
  it("re-seeds the fields when a new result lands on a mounted form", () => {
    actionState = { status: "idle" };
    const { rerender, container } = renderDom(
      <AddEventForm teamId="team-1" context={MONTH_CONTEXT} />,
    );

    const dateBefore = container.querySelector<HTMLInputElement>("#startsAt");
    expect(dateBefore?.value).toBe("");

    // The coach fills the form in and submits; the action comes back "added".
    actionState = {
      status: "added",
      keep: {
        type: "PRACTICE",
        startsAt: "",
        location: "Field 3",
        opponent: "Hawks",
        notes: "",
      },
      summary: "Practice on Sat, Aug 15, 2026 at 6:00 PM",
    };
    rerender(<AddEventForm teamId="team-1" context={MONTH_CONTEXT} />);

    expect(
      container.querySelector<HTMLInputElement>("#location")?.value,
    ).toBe("Field 3");
    expect(
      container.querySelector<HTMLInputElement>("#opponent")?.value,
    ).toBe("Hawks");
    expect(container.querySelector<HTMLSelectElement>("#type")?.value).toBe(
      "PRACTICE",
    );
  });

  it("clears the date on the second add, not just the first", () => {
    // The dangerous field. Two events cannot share a start time, and the whole
    // point of the sticky form is that a coach adds several in a row.
    actionState = {
      status: "added",
      keep: {
        type: "GAME",
        startsAt: "",
        location: "Field 3",
        opponent: "Hawks",
        notes: "",
      },
      summary: "Game one",
    };
    const { rerender, container } = renderDom(
      <AddEventForm teamId="team-1" context={MONTH_CONTEXT} />,
    );

    const date = container.querySelector<HTMLInputElement>("#startsAt")!;
    fireEvent.change(date, { target: { value: "2026-08-22T18:00" } });
    expect(date.value).toBe("2026-08-22T18:00");

    // A second, distinct result object — which is what useActionState hands
    // back per submit, and what the sync keys on.
    actionState = {
      status: "added",
      keep: {
        type: "GAME",
        startsAt: "",
        location: "Field 3",
        opponent: "Hawks",
        notes: "",
      },
      summary: "Game two",
    };
    rerender(<AddEventForm teamId="team-1" context={MONTH_CONTEXT} />);

    expect(
      container.querySelector<HTMLInputElement>("#startsAt")?.value,
    ).toBe("");
    expect(
      container.querySelector<HTMLInputElement>("#location")?.value,
    ).toBe("Field 3");
  });

  it("locks the fields while a submit is in flight", () => {
    // Otherwise a coach typing the next date during the round trip has it
    // overwritten the moment the result lands.
    actionPending = true;
    const { container } = renderDom(
      <AddEventForm teamId="team-1" context={MONTH_CONTEXT} />,
    );

    expect(
      container.querySelector<HTMLFieldSetElement>("fieldset")?.disabled,
    ).toBe(true);
  });
});
