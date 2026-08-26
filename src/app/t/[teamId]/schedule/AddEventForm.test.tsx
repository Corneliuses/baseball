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
import { EMPTY_EVENT_VALUES } from "./event-form-state";

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

/// #45 — what the form says about the parent announcement. The count and the
/// promise of a summary are the coach's only feedback until the receipt lands,
/// because the fan-out runs after this response is finished.
describe("AddEventForm announcement feedback", () => {
  function added(
    announcement: Extract<AddEventState, { status: "added" }>["announcement"],
  ): AddEventState {
    return {
      status: "added",
      keep: EMPTY_EVENT_VALUES,
      summary: "Game on Sat, Aug 15, 2026 at 6:00 PM",
      announcement,
    };
  }

  // Present tense on purpose: at this moment not one message has been sent, so
  // a past-tense claim would be something the form cannot know to be true.
  it("promises the send rather than claiming it already happened", () => {
    const html = render(added({ status: "sending", recipients: 12 }));

    expect(html).toContain("Emailing 12 parents now");
    expect(html).toContain("summary");
    expect(html).not.toContain("12 parents emailed");
  });

  it("says parent, singular, for a one-household team", () => {
    expect(render(added({ status: "sending", recipients: 1 }))).toContain(
      "Emailing 1 parent now",
    );
  });

  it("says nothing about email when there was nobody to tell", () => {
    const html = render(added({ status: "none" }));

    expect(html).toContain("Added Game on");
    expect(html).not.toContain("Emailing");
  });

  // The event is still added — that line stays — but a failure needs the tone
  // that says act on this, so it gets its own banner rather than a clause.
  it("keeps the success line and adds a failure banner when the roster failed", () => {
    const html = render(added({ status: "failed" }));

    expect(html).toContain("Added Game on");
    expect(html).toContain("no announcement was sent");
    expect(html).not.toContain("Emailing");
  });
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
      repeat: "",
    },
    summary: "Game on Sat, Aug 15, 2026 at 6:00 PM",
    announcement: { status: "none" },
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
    field: "startsAt",
    values: {
      type: "PRACTICE",
      startsAt: "not-a-time",
      location: "Field 3",
      opponent: "",
      notes: "Bring water",
      repeat: "",
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
    expect(fieldFor(html, "startsAt")).toContain('aria-invalid="true"');
  });

  it("does not blame the date box for a different field's mistake", () => {
    // Every rejection used to mark startsAt as invalid regardless of which
    // field actually failed — a screen reader user told to fix the date and
    // time when the real problem was an over-long location.
    const html = render({
      status: "invalid",
      code: "invalid-location",
      field: "location",
      values: {
        type: "GAME",
        startsAt: "2026-08-15T18:00",
        location: "x".repeat(201),
        opponent: "",
        notes: "",
        repeat: "",
      },
    });

    expect(fieldFor(html, "location")).toContain('aria-invalid="true"');
    expect(fieldFor(html, "location")).toContain(
      'aria-describedby="add-event-error"',
    );
    expect(fieldFor(html, "startsAt")).not.toContain("aria-invalid");
    expect(fieldFor(html, "startsAt")).not.toContain("aria-describedby");
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
      repeat: "",
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
        repeat: "",
      },
      summary: "Practice on Sat, Aug 15, 2026 at 6:00 PM",
    announcement: { status: "none" },
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
        repeat: "",
      },
      summary: "Game one",
    announcement: { status: "none" },
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
        repeat: "",
      },
      summary: "Game two",
    announcement: { status: "none" },
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

/// #70 — the repeat-weekly field and the promise it makes before the coach
/// commits. The date arithmetic behind the preview is pinned in
/// `repeat-preview.test.ts`; what belongs here is that the field exists, that
/// the promise appears when there is one to make, and that the count never
/// survives an add.
describe("AddEventForm repeat-weekly", () => {
  it("offers an optional weekly count, capped where the action caps it", () => {
    const field = fieldFor(render({ status: "idle" }), "repeat");

    expect(field).toContain('type="number"');
    expect(field).toContain('min="1"');
    expect(field).toContain('max="30"');
    // Blank, not "1" — a coach adding one game should see an empty box rather
    // than a number to reason about.
    expect(field).toContain('value=""');
  });

  it("explains the blank state rather than leaving the box unexplained", () => {
    expect(render({ status: "idle" })).toContain("Leave blank for a single event.");
  });

  it("sits inside the fieldset that locks during a submit", () => {
    actionPending = true;
    const { container } = renderDom(
      <AddEventForm teamId="team-1" context={MONTH_CONTEXT} />,
    );

    // Placement is the assertion, not `input.disabled`: a disabled fieldset
    // disables its descendants for real, but the IDL property reflects only
    // the element's own attribute, so the input reads false either way. What
    // could actually regress is the field being moved out of the fieldset.
    expect(container.querySelector("fieldset[disabled] #repeat")).not.toBeNull();
  });

  // The cheap check against a coach who typed 30 meaning 3: the last date is
  // different, and it is on screen before the submit rather than after thirty
  // rows exist.
  it("says what the submit is about to do once there is a run to describe", () => {
    const { container } = renderDom(
      <AddEventForm teamId="team-1" context={MONTH_CONTEXT} />,
    );

    fireEvent.change(container.querySelector<HTMLInputElement>("#startsAt")!, {
      target: { value: "2026-04-04T18:00" },
    });
    fireEvent.change(container.querySelector<HTMLInputElement>("#repeat")!, {
      target: { value: "8" },
    });

    expect(container.textContent).toContain(
      "Creates 8 events, weekly through Sat, May 23.",
    );
    expect(container.textContent).not.toContain("Leave blank for a single event.");
  });

  it("promises nothing for a single event", () => {
    const { container } = renderDom(
      <AddEventForm teamId="team-1" context={MONTH_CONTEXT} />,
    );

    fireEvent.change(container.querySelector<HTMLInputElement>("#startsAt")!, {
      target: { value: "2026-04-04T18:00" },
    });
    fireEvent.change(container.querySelector<HTMLInputElement>("#repeat")!, {
      target: { value: "1" },
    });

    expect(container.textContent).not.toContain("Creates");
    expect(container.textContent).toContain("Leave blank for a single event.");
  });

  // Sticky values keep type/location/opponent; the count is the one field
  // where keeping it turns a correct next submit into a wrong one.
  it("clears the count after an add, so the next one is not another season", () => {
    actionState = { status: "idle" };
    const { rerender, container } = renderDom(
      <AddEventForm teamId="team-1" context={MONTH_CONTEXT} />,
    );

    fireEvent.change(container.querySelector<HTMLInputElement>("#repeat")!, {
      target: { value: "8" },
    });

    actionState = {
      status: "added",
      keep: {
        type: "GAME",
        startsAt: "",
        location: "Field 3",
        opponent: "Hawks",
        notes: "",
        repeat: "",
      },
      summary: "8 games, weekly from Sat, Apr 4 to Sat, May 23",
      announcement: { status: "none" },
    };
    rerender(<AddEventForm teamId="team-1" context={MONTH_CONTEXT} />);

    expect(container.querySelector<HTMLInputElement>("#repeat")?.value).toBe("");
    // The fields that were already sticky stay sticky.
    expect(container.querySelector<HTMLInputElement>("#location")?.value).toBe(
      "Field 3",
    );
  });

  it("marks the count, not the date, when the count is what was rejected", () => {
    const html = render({
      status: "invalid",
      code: "invalid-repeat",
      field: "repeat",
      values: { ...EMPTY_EVENT_VALUES, startsAt: "2026-04-04T18:00", repeat: "99" },
    });

    expect(fieldFor(html, "repeat")).toContain('aria-invalid="true"');
    expect(fieldFor(html, "startsAt")).not.toContain("aria-invalid");
    // And it hands the bad count back rather than blanking it.
    expect(fieldFor(html, "repeat")).toContain('value="99"');
    expect(html).toContain("between 1 and 30");
  });
});
