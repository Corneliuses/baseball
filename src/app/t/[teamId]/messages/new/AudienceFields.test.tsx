import { describe, it, expect, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AudienceFields } from "./AudienceFields";

const PARENTS = [
  { userId: "u-parent-a", name: "Alex Parent", email: "alex@example.com" },
  { userId: "u-parent-b", name: null, email: "blake@example.com" },
];

beforeEach(() => {
  cleanup();
});

describe("AudienceFields", () => {
  it("starts on All parents", () => {
    render(<AudienceFields parents={PARENTS} />);

    expect(screen.getByLabelText("All parents")).toBeChecked();
  });

  // The bug this guards: label activation is skipped for interactive
  // descendants, so a bare label wrapping both the radio and the select let
  // a coach open the dropdown and pick a parent while "All parents" stayed
  // the radio that actually submitted — silently broadcasting a message
  // meant for one family.
  it("switches to One parent when the select is opened, without clicking the radio", async () => {
    const user = userEvent.setup();
    render(<AudienceFields parents={PARENTS} />);

    await user.click(screen.getByLabelText("Which parent"));

    expect(screen.getByLabelText("All parents")).not.toBeChecked();
    expect(
      screen.getByRole("radio", { name: /one parent/i }),
    ).toBeChecked();
  });

  it("switches to One parent when a parent is actually chosen", async () => {
    const user = userEvent.setup();
    render(<AudienceFields parents={PARENTS} />);

    await user.selectOptions(
      screen.getByLabelText("Which parent"),
      "u-parent-b",
    );

    expect(
      screen.getByRole("radio", { name: /one parent/i }),
    ).toBeChecked();
    expect(screen.getByLabelText("Which parent")).toHaveValue("u-parent-b");
  });

  it("returns to All parents when that radio is clicked directly", async () => {
    const user = userEvent.setup();
    render(<AudienceFields parents={PARENTS} />);

    await user.click(screen.getByLabelText("Which parent"));
    await user.click(screen.getByLabelText("All parents"));

    expect(screen.getByLabelText("All parents")).toBeChecked();
    expect(
      screen.getByRole("radio", { name: /one parent/i }),
    ).not.toBeChecked();
  });

  it("lists each parent by name, falling back to email when unnamed", () => {
    render(<AudienceFields parents={PARENTS} />);

    expect(screen.getByText("Alex Parent")).toBeInTheDocument();
    expect(screen.getByText("blake@example.com")).toBeInTheDocument();
  });
});
