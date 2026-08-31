import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { CheckEmailState } from "../check-email-state";

// The real action reaches Auth.js and the Prisma client. `useActionState`
// only needs something action-shaped, so the mock returns the state a real
// rejection would.
const submitSignInCode = vi.fn();

vi.mock("../actions", () => ({
  submitSignInCode: (state: CheckEmailState, formData: FormData) =>
    submitSignInCode(state, formData),
}));

import { CodeEntryForm } from "./CodeEntryForm";

beforeEach(() => {
  vi.clearAllMocks();
  submitSignInCode.mockImplementation(
    async (_state: CheckEmailState, formData: FormData): Promise<CheckEmailState> => ({
      status: "invalid",
      code: "invalid-code",
      value: String(formData.get("code") ?? ""),
    }),
  );
});

describe("CodeEntryForm", () => {
  it("offers the one-time-code keyboard hint", async () => {
    render(<CodeEntryForm />);

    // On a phone the code arrives as a notification; this is what lets the
    // keyboard offer it without a trip to the mail app.
    expect(screen.getByLabelText("Sign-in code")).toHaveAttribute(
      "autocomplete",
      "one-time-code",
    );
  });

  it("shows no error until something fails", () => {
    render(<CodeEntryForm />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // The regression this exists for: a redirect emptied the box, so one wrong
  // character cost all eight — mid-code, on a phone, which is where people
  // give up and ask for another email instead.
  it("keeps the typed code on screen after a rejection", async () => {
    const user = userEvent.setup();
    render(<CodeEntryForm />);

    const input = screen.getByLabelText("Sign-in code");
    await user.type(input, "K3M7QP2");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /doesn't look like a code/i,
    );
    expect(input).toHaveValue("K3M7QP2");
  });

  it("marks the box as invalid and points the description at the message", async () => {
    const user = userEvent.setup();
    render(<CodeEntryForm />);

    await user.type(screen.getByLabelText("Sign-in code"), "nope");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await screen.findByRole("alert");
    const input = screen.getByLabelText("Sign-in code");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "code-error");
  });

  // The other route into this screen: Auth.js rejected the redeem and the
  // page passed the sentence down, rather than this leaf reading the query.
  it("renders a message handed down from the page", () => {
    render(<CodeEntryForm serverMessage="That code didn't match." />);

    expect(screen.getByRole("alert")).toHaveTextContent(/didn't match/i);
  });

  it("lets the person type over a server-side rejection", async () => {
    const user = userEvent.setup();
    render(<CodeEntryForm serverMessage="That code didn't match." />);

    await user.type(screen.getByLabelText("Sign-in code"), "K3M7QP2X");

    expect(screen.getByLabelText("Sign-in code")).toHaveValue("K3M7QP2X");
  });
});
