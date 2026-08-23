import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/// `"use server"`, and it reaches Prisma through @/lib/messages. The form only
/// needs a function to hand to `useActionState`; these tests never submit.
vi.mock("./actions", () => ({ sendTeamMessageAction: vi.fn() }));

import { ComposeForm } from "./ComposeForm";

const PARENTS = [
  { userId: "u-parent-a", name: "Alex Parent", email: "alex@example.com" },
  { userId: "u-parent-b", name: null, email: "blake@example.com" },
];

function renderCoach() {
  return render(
    <ComposeForm teamId="team-1" isCoach parents={PARENTS} />,
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/// These moved here with the markup when `AudienceFields` was folded into this
/// component (#51). The gap they guard is unchanged and still real, so the
/// tests came along rather than being rewritten from scratch.
describe("ComposeForm audience picker", () => {
  it("starts on All parents", () => {
    renderCoach();

    expect(screen.getByLabelText("All parents")).toBeChecked();
  });

  // The bug this guards: label activation is skipped for interactive
  // descendants, so a bare label wrapping both the radio and the select let
  // a coach open the dropdown and pick a parent while "All parents" stayed
  // the radio that actually submitted — silently broadcasting a message
  // meant for one family.
  it("switches to One parent when the select is opened, without clicking the radio", async () => {
    const user = userEvent.setup();
    renderCoach();

    await user.click(screen.getByLabelText("Which parent"));

    expect(screen.getByLabelText("All parents")).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /one parent/i })).toBeChecked();
  });

  it("switches to One parent when a parent is actually chosen", async () => {
    const user = userEvent.setup();
    renderCoach();

    await user.selectOptions(screen.getByLabelText("Which parent"), "u-parent-b");

    expect(screen.getByRole("radio", { name: /one parent/i })).toBeChecked();
    expect(screen.getByLabelText("Which parent")).toHaveValue("u-parent-b");
  });

  it("returns to All parents when that radio is clicked directly", async () => {
    const user = userEvent.setup();
    renderCoach();

    await user.click(screen.getByLabelText("Which parent"));
    await user.click(screen.getByLabelText("All parents"));

    expect(screen.getByLabelText("All parents")).toBeChecked();
    expect(screen.getByRole("radio", { name: /one parent/i })).not.toBeChecked();
  });

  it("lists each parent by name, falling back to email when unnamed", () => {
    renderCoach();

    expect(screen.getByText("Alex Parent")).toBeInTheDocument();
    expect(screen.getByText("blake@example.com")).toBeInTheDocument();
  });
});

describe("ComposeForm for a parent", () => {
  it("fixes the audience to the coaching staff with no picker", () => {
    // A parent has exactly one destination. The action re-derives the caller's
    // role and the pure resolver enforces the matrix, so this is presentation
    // — but presenting a choice that does not exist would be a lie.
    const { container } = render(
      <ComposeForm teamId="team-1" isCoach={false} parents={[]} />,
    );

    expect(screen.queryByLabelText("Which parent")).toBeNull();
    expect(
      container.querySelector('input[name="audience"][value="ALL_COACHES"]'),
    ).not.toBeNull();
  });
});

describe("ComposeForm writing", () => {
  it("keeps what was typed as the person types it", async () => {
    const user = userEvent.setup();
    renderCoach();

    await user.type(screen.getByLabelText("Subject"), "Practice moved");
    await user.type(screen.getByLabelText("Message"), "Field 3 instead.");

    expect(screen.getByLabelText("Subject")).toHaveValue("Practice moved");
    expect(screen.getByLabelText("Message")).toHaveValue("Field 3 instead.");
  });

  it("caps subject and body at the limits the action enforces", () => {
    // Matching maxLength to the server's schema is what keeps the two
    // length errors unreachable by ordinary typing.
    renderCoach();

    expect(screen.getByLabelText("Subject")).toHaveAttribute("maxlength", "200");
    expect(screen.getByLabelText("Message")).toHaveAttribute("maxlength", "5000");
  });
});
