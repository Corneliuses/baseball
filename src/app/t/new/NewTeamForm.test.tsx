import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { NewTeamState } from "./new-team-state";

let actionState: NewTeamState = { status: "idle" };

/// Same approach as TeamDetailsForm's suite: what belongs to this file is what
/// the form *renders* per state; producing those states is the action suite's
/// job.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: () => [actionState, vi.fn(), false] };
});

vi.mock("./actions", () => ({ createTeamAction: vi.fn() }));

import { NewTeamForm } from "./NewTeamForm";

function render(state: NewTeamState) {
  actionState = state;
  return renderToStaticMarkup(<NewTeamForm />);
}

function inputFor(html: string, pattern: string): string {
  const match = new RegExp(`<input[^>]*${pattern}[^>]*>`).exec(html);
  expect(match, `expected an input matching ${pattern}`).not.toBeNull();
  return match![0];
}

beforeEach(() => {
  actionState = { status: "idle" };
});

describe("NewTeamForm after a rejection", () => {
  it("keeps the name, season, sport and all-play choice", () => {
    const html = render({
      status: "invalid",
      code: "invalid-name",
      field: "name",
      values: { name: "", season: "2027", sport: "BASEBALL", allPlay: false },
    });

    expect(inputFor(html, 'name="season"')).toContain('value="2027"');
    expect(inputFor(html, 'value="BASEBALL"')).toContain("checked");
    expect(inputFor(html, 'name="allPlay"')).not.toContain("checked");
    expect(inputFor(html, 'name="name"')).toContain('aria-invalid="true"');
    expect(html).toContain("Team name is required.");
  });

  it("asks for a sport and keeps the typed name", () => {
    const html = render({
      status: "invalid",
      code: "invalid-sport",
      field: "sport",
      values: { name: "Sharks", season: "", sport: "", allPlay: true },
    });

    expect(inputFor(html, 'name="name"')).toContain('value="Sharks"');
    expect(inputFor(html, 'name="name"')).not.toContain("aria-invalid");
    expect(html).toContain("Choose a sport.");
    expect(html).toMatch(/<fieldset[^>]*aria-invalid="true"/);
    expect(html).not.toContain('name="allPlay"');
  });

  it("keeps a basketball choice without the all-play box", () => {
    const html = render({
      status: "invalid",
      code: "invalid-name",
      field: "name",
      values: { name: "", season: "", sport: "BASKETBALL", allPlay: true },
    });

    expect(inputFor(html, 'value="BASKETBALL"')).toContain("checked");
    expect(html).not.toContain('name="allPlay"');
  });
});
