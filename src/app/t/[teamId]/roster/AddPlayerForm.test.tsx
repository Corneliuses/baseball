import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { AddPlayerState } from "./add-player-state";

let actionState: AddPlayerState = { status: "idle" };

/// Same approach as InviteForm's suite: the hook is the component's only
/// source of feedback, and driving it for real would mean running a server
/// action from jsdom. What belongs to this file is what the form *renders* per
/// state; producing those states is the action suite's job.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: () => [actionState, vi.fn(), false] };
});

/// `"use server"`, and it reaches Prisma through @/lib/roster.
vi.mock("./actions", () => ({ addPlayerAction: vi.fn() }));

import { AddPlayerForm } from "./AddPlayerForm";

function render(state: AddPlayerState) {
  actionState = state;
  return renderToStaticMarkup(<AddPlayerForm teamId="team-1" />);
}

/// The attributes on one named input, so an assertion about marking lands on
/// the right box rather than anywhere in the form.
function inputFor(html: string, name: string): string {
  const match = new RegExp(`<input[^>]*name="${name}"[^>]*>`).exec(html);
  expect(match, `expected an input named ${name}`).not.toBeNull();
  return match![0];
}

beforeEach(() => {
  vi.clearAllMocks();
  actionState = { status: "idle" };
});

describe("AddPlayerForm at rest", () => {
  it("asks for a name, a date of birth, and a jersey number", () => {
    const html = render({ status: "idle" });

    expect(html).toContain('name="name"');
    expect(html).toContain('name="dateOfBirth"');
    expect(html).toContain('name="jerseyNumber"');
    expect(html).toContain('name="teamId" value="team-1"');
  });

  it("shows no error banner", () => {
    const html = render({ status: "idle" });

    expect(html).not.toContain('role="alert"');
  });
});

describe("AddPlayerForm after a rejection", () => {
  const rejected: AddPlayerState = {
    status: "invalid",
    code: "invalid-dob",
    field: "dateOfBirth",
    values: { name: "Ada Lovelace", dateOfBirth: "not-a-date", jerseyNumber: "7" },
  };

  it("keeps everything the coach typed", () => {
    const html = render(rejected);

    expect(html).toContain('value="Ada Lovelace"');
    expect(html).toContain('value="not-a-date"');
    expect(html).toContain('value="7"');
  });

  it("says what was wrong, in the roster's own words", () => {
    // The sentence comes from ROSTER_ERROR_MESSAGES, the same table the page
    // reads for its ?error= codes, so the two cannot drift apart.
    const html = render(rejected);

    expect(html).toContain("Enter a valid date, or leave it blank.");
    expect(html).toContain('role="alert"');
  });

  it("marks the offending box and points it at the message", () => {
    const html = render(rejected);

    expect(inputFor(html, "dateOfBirth")).toContain('aria-invalid="true"');
    expect(inputFor(html, "dateOfBirth")).toContain(
      'aria-describedby="add-player-error"',
    );
    expect(html).toContain('id="add-player-error"');
  });

  it("leaves the boxes that were fine alone", () => {
    const html = render(rejected);

    expect(inputFor(html, "name")).not.toContain("aria-invalid");
    expect(inputFor(html, "jerseyNumber")).not.toContain("aria-invalid");
  });

  it("marks nothing when the failure blames no single field", () => {
    // `already-rostered` is about the player, not about any box on screen —
    // outlining one would point the coach at the wrong thing to fix.
    const html = render({
      status: "invalid",
      code: "already-rostered",
      field: null,
      values: { name: "Ada", dateOfBirth: "", jerseyNumber: "" },
    });

    expect(html).toContain("already on this team&#x27;s roster");
    expect(html).not.toContain("aria-invalid");
  });

  it("marks the jersey box when the number is taken", () => {
    const html = render({
      status: "invalid",
      code: "jersey-taken",
      field: "jerseyNumber",
      values: { name: "Ada", dateOfBirth: "", jerseyNumber: "7" },
    });

    expect(inputFor(html, "jerseyNumber")).toContain('aria-invalid="true"');
    expect(html).toContain("already in use on this team");
  });
});
