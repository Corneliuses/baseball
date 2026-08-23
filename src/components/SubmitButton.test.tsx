import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const useFormStatus = vi.fn();

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return { ...actual, useFormStatus: () => useFormStatus() };
});

import { SubmitButton } from "./SubmitButton";

/// `useFormStatus` reports the enclosing form's state, and there is no form
/// here — so the hook is mocked rather than driven. What is being tested is
/// what the button *does* with a pending flag, which is the whole of its job.
function render(pending: boolean, ui: React.ReactElement) {
  useFormStatus.mockReturnValue({ pending });
  return renderToStaticMarkup(ui);
}

/// Whether the rendered button carries the `disabled` **attribute**.
///
/// Not a substring search: `ui/button.tsx`'s base class list contains
/// `disabled:pointer-events-none disabled:opacity-50`, so `html.includes(
/// "disabled")` is true of every button this component has ever rendered. The
/// first draft of this file asserted exactly that and passed both ways.
function isDisabled(html: string): boolean {
  const tag = /<button[^>]*>/.exec(html);
  expect(tag, "expected a <button> in the markup").not.toBeNull();
  return / disabled(=|\s|>)/.test(tag![0]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SubmitButton at rest", () => {
  it("is an enabled submit carrying its own label", () => {
    const html = render(false, <SubmitButton>Send invitations</SubmitButton>);

    expect(html).toContain('type="submit"');
    expect(html).toContain("Send invitations");
    expect(isDisabled(html)).toBe(false);
  });

  it("shows no spinner", () => {
    const html = render(false, <SubmitButton>Save</SubmitButton>);

    expect(html).not.toContain("animate-spin-ball");
  });
});

describe("SubmitButton while the action is in flight", () => {
  it("disables itself, which is the whole point", () => {
    // The bulk invite paces ~9s of real emails behind one tap. Silence for
    // that long reads as "nothing happened", and the honest response to
    // nothing happening is to tap again — a second batch of invitations to
    // other people's parents. This attribute is what closes that.
    const html = render(true, <SubmitButton>Send invitations</SubmitButton>);

    expect(isDisabled(html)).toBe(true);
  });

  it("swaps in the pending label and the spinning ball", () => {
    const html = render(
      true,
      <SubmitButton pendingLabel="Sending…">Send invitations</SubmitButton>,
    );

    expect(html).toContain("Sending…");
    expect(html).not.toContain("Send invitations");
    expect(html).toContain("animate-spin-ball");
  });

  it("says something even when no pending label is given", () => {
    // The label is the entire signal for a reader whose OS asks for reduced
    // motion — the ball holds still for them (globals.css gates the spin), so
    // a button that kept its resting text would look untouched.
    const html = render(true, <SubmitButton>Save</SubmitButton>);

    expect(html).toContain("Working…");
  });
});

describe("SubmitButton composing with a caller's own disabled state", () => {
  it("stays disabled at rest when the caller says so", () => {
    // The chart editors disable Save on an unedited draft. Pending is an
    // additional reason to be disabled, never a replacement for that one.
    const html = render(false, <SubmitButton disabled>Post the lineup</SubmitButton>);

    expect(isDisabled(html)).toBe(true);
  });

  it("keeps the caller's variant and className", () => {
    const html = render(
      false,
      <SubmitButton variant="destructive" className="w-full">
        Delete
      </SubmitButton>,
    );

    expect(html).toContain("w-full");
    expect(html).toContain("bg-destructive");
  });
});
