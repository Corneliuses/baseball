import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { TeamSettingsState } from "./team-settings-state";

let actionState: TeamSettingsState = { status: "idle" };

/// Same approach as AddPlayerForm's suite: the hook is the component's only
/// source of feedback, and driving it for real would mean running a server
/// action from jsdom. What belongs to this file is what the form *renders*
/// per state; producing those states is the action suite's job.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: () => [actionState, vi.fn(), false] };
});

/// `"use server"`, and it reaches Prisma through @/lib/teams.
vi.mock("./actions", () => ({ updateTeamAction: vi.fn() }));

import { TeamDetailsForm } from "./TeamDetailsForm";

const STORED = {
  teamId: "team-1",
  name: "Sharks",
  season: "2026",
  allPlay: true,
  groupMeUrl: "https://groupme.com/join_group/1/stored",
};

function render(
  state: TeamSettingsState,
  props: Partial<React.ComponentProps<typeof TeamDetailsForm>> = {},
) {
  actionState = state;
  return renderToStaticMarkup(<TeamDetailsForm {...STORED} {...props} />);
}

/// The attributes on one named input, so an assertion about marking lands on
/// the right box rather than anywhere in the form.
function inputFor(html: string, name: string): string {
  const match = new RegExp(`<input[^>]*name="${name}"[^>]*>`).exec(html);
  expect(match, `expected an input named ${name}`).not.toBeNull();
  return match![0];
}

const REJECTED_LINK: TeamSettingsState = {
  status: "invalid",
  code: "invalid-groupme",
  field: "groupMeUrl",
  values: {
    name: "Renamed Sharks",
    season: "2027",
    allPlay: false,
    groupMeUrl: "https://example.com/chat",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  actionState = { status: "idle" };
});

describe("TeamDetailsForm at rest", () => {
  it("prefills every field from the stored team", () => {
    const html = render({ status: "idle" });

    expect(inputFor(html, "name")).toContain('value="Sharks"');
    expect(inputFor(html, "season")).toContain('value="2026"');
    expect(inputFor(html, "groupMeUrl")).toContain(
      'value="https://groupme.com/join_group/1/stored"',
    );
    expect(inputFor(html, "allPlay")).toContain("checked");
    expect(html).toContain('name="teamId" value="team-1"');
  });

  it("shows no banner", () => {
    const html = render({ status: "idle" });

    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('role="status"');
  });

  it("confirms a save when the page says one just happened", () => {
    const html = render({ status: "idle" }, { saved: true });

    expect(html).toContain("Saved.");
    expect(html).toContain('role="status"');
  });
});

describe("TeamDetailsForm after a rejection", () => {
  // The whole point of useActionState here: a mistyped link used to take the
  // unsaved name and season down with it.
  it("keeps everything the owner typed, not what is stored", () => {
    const html = render(REJECTED_LINK);

    expect(inputFor(html, "name")).toContain('value="Renamed Sharks"');
    expect(inputFor(html, "season")).toContain('value="2027"');
    expect(inputFor(html, "groupMeUrl")).toContain(
      'value="https://example.com/chat"',
    );
    expect(inputFor(html, "allPlay")).not.toContain("checked");
  });

  it("explains what a GroupMe invite link looks like", () => {
    const html = render(REJECTED_LINK);

    expect(html).toContain("GroupMe invite link");
    expect(html).toContain('role="alert"');
  });

  // The bug this replaces: one #settings-error node wired to the team-name
  // input, so a rejected link was announced on the wrong field.
  it("marks and describes the GroupMe box, not the name box", () => {
    const html = render(REJECTED_LINK);

    const groupMe = inputFor(html, "groupMeUrl");
    expect(groupMe).toContain('aria-invalid="true"');
    expect(groupMe).toContain('aria-describedby="settings-error groupme-hint"');

    const name = inputFor(html, "name");
    expect(name).not.toContain("aria-invalid");
    expect(name).not.toContain("settings-error");
  });

  it("marks the name box when the name is what failed", () => {
    const html = render({
      status: "invalid",
      code: "invalid-name",
      field: "name",
      values: { name: "", season: "2027", allPlay: true, groupMeUrl: "" },
    });

    const name = inputFor(html, "name");
    expect(name).toContain('aria-invalid="true"');
    expect(name).toContain('aria-describedby="settings-error"');

    const groupMe = inputFor(html, "groupMeUrl");
    expect(groupMe).not.toContain("aria-invalid");
    // The hint still describes the box; only the error is absent.
    expect(groupMe).toContain('aria-describedby="groupme-hint"');
  });

  it("does not also claim the save succeeded", () => {
    const html = render(REJECTED_LINK, { saved: true });

    expect(html).not.toContain("Saved.");
  });
});

describe("TeamDetailsForm on a lost-access redirect", () => {
  it("shows the message without marking any field", () => {
    const html = render({ status: "idle" }, { redirectErrorCode: "access" });

    expect(html).toContain("no longer have access");
    expect(inputFor(html, "name")).not.toContain("aria-invalid");
    expect(inputFor(html, "groupMeUrl")).not.toContain("aria-invalid");
  });

  // A hand-typed `?error=` key is attacker-chosen; messageFor null-prototypes
  // the table and refuses a non-string, so this renders the fallback rather
  // than crashing. See src/lib/error-messages.ts.
  it("survives a nonsense error code", () => {
    const html = render(
      { status: "idle" },
      { redirectErrorCode: "constructor" },
    );

    expect(html).toContain("Something went wrong.");
  });
});
