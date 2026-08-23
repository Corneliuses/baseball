import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { BulkInviteState } from "./bulk-invite-state";

let actionState: BulkInviteState = { status: "idle" };

/// `useActionState` is the component's only source of feedback, and driving it
/// for real would mean running a server action from jsdom. Mocking the hook
/// tests the half that belongs to this file: what the form *renders* for each
/// state the action can return. The action's own suite covers producing them.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useActionState: () => [actionState, vi.fn(), false],
  };
});

/// The real module is `"use server"` and reaches Prisma through @/lib/roster.
/// The component only needs the function's identity to hand to <form action>.
/// The initial state and the types are not here — a `"use server"` module may
/// only export async functions, so they live in ./bulk-invite-state.
vi.mock("./actions", () => ({
  bulkInviteGuardiansAction: vi.fn(),
}));

import { InviteForm } from "./InviteForm";

const ROWS = [
  { entryId: "entry-1", playerName: "Maya Rivera", jerseyNumber: 7 },
  { entryId: "entry-2", playerName: "Jake Miller", jerseyNumber: null },
];

function render(state: BulkInviteState) {
  actionState = state;
  return renderToStaticMarkup(<InviteForm teamId="team-1" rows={ROWS} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  actionState = { status: "idle" };
});

describe("InviteForm at rest", () => {
  it("gives every player without a parent their own row", () => {
    const html = render({ status: "idle" });

    expect(html).toContain("Maya Rivera");
    expect(html).toContain("Jake Miller");
    expect(html).toContain('name="email-entry-1"');
    expect(html).toContain('name="email-entry-2"');
  });

  it("shows the jersey number when there is one", () => {
    const html = render({ status: "idle" });

    expect(html).toContain("(#7)");
  });

  it("carries the team id the action scopes every write to", () => {
    const html = render({ status: "idle" });

    expect(html).toContain('name="teamId" value="team-1"');
  });
});

describe("InviteForm when a row is rejected", () => {
  const rejected: BulkInviteState = {
    status: "invalid",
    message: "One address needs a look. Nothing was sent yet.",
    rowErrors: { "entry-2": "That doesn't look like an email address." },
    values: {
      emails: { "entry-1": "mum@example.com", "entry-2": "nope" },
      message: "See you at the field",
    },
  };

  it("keeps every address the coach typed, including the good ones", () => {
    // The old flow redirected on a validation failure, which blanked all
    // fifteen rows to report one typo. That is the behaviour this asserts is
    // gone — the values come back through the returned state, which is also
    // what repopulates the form when JavaScript never ran.
    const html = render(rejected);

    expect(html).toContain('value="mum@example.com"');
    expect(html).toContain('value="nope"');
    expect(html).toContain("See you at the field");
  });

  it("marks the offending row and names its problem", () => {
    const html = render(rejected);

    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("That doesn&#x27;t look like an email address.");
  });

  it("points the bad input at its own message for a screen reader", () => {
    const html = render(rejected);

    expect(html).toContain('aria-describedby="email-entry-2-error"');
    expect(html).toContain('id="email-entry-2-error"');
  });

  it("leaves the valid row unmarked", () => {
    const html = render(rejected);

    const goodInput = /<input[^>]*name="email-entry-1"[^>]*>/.exec(html)?.[0] ?? "";
    expect(goodInput).not.toContain("aria-invalid");
  });

  it("says out loud that nothing was sent", () => {
    const html = render(rejected);

    expect(html).toContain("Nothing was sent yet.");
    expect(html).toContain('role="alert"');
  });
});

describe("InviteForm results", () => {
  it("names who was emailed rather than counting them", () => {
    const html = render({
      status: "done",
      outcomes: [
        {
          entryId: "entry-1",
          playerName: "Maya Rivera",
          email: "mum@example.com",
          outcome: "sent",
        },
      ],
    });

    expect(html).toContain("Maya Rivera");
    expect(html).toContain("mum@example.com");
    expect(html).toContain("Invitation sent.");
    expect(html).toContain('role="status"');
  });

  it("names who failed and why, and points at the roster", () => {
    const html = render({
      status: "done",
      outcomes: [
        {
          entryId: "entry-2",
          playerName: "Jake Miller",
          email: "dad@example.com",
          outcome: "failed",
          reason: "The invitation was created but the email didn't go out.",
        },
      ],
    });

    expect(html).toContain("Jake Miller");
    expect(html).toContain("didn&#x27;t go out");
    expect(html).toContain('role="alert"');
    expect(html).toContain('href="/t/team-1/roster"');
  });

  it("explains why an already-member parent got no email", () => {
    // Otherwise the absence of an email reads as a bug the coach should chase.
    const html = render({
      status: "done",
      outcomes: [
        {
          entryId: "entry-1",
          playerName: "Maya Rivera",
          email: "mum@example.com",
          outcome: "linked",
        },
      ],
    });

    expect(html).toContain("already");
    expect(html).toContain("no invitation was needed");
  });

  it("falls back to the address when the player is gone", () => {
    const html = render({
      status: "done",
      outcomes: [
        {
          entryId: "entry-9",
          playerName: null,
          email: "orphan@example.com",
          outcome: "failed",
          reason: "That player is no longer on the roster.",
        },
      ],
    });

    expect(html).toContain("orphan@example.com");
  });
});
