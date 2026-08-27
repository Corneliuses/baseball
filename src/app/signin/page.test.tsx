import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The real action pulls in Auth.js and the Prisma client; the page only needs
// something form-shaped to point at.
vi.mock("./actions", () => ({
  requestSignInCode: vi.fn(),
}));

import SignInPage from "./page";

async function renderPage(
  searchParams: { error?: string; callbackUrl?: string } = {},
) {
  render(await SignInPage({ searchParams: Promise.resolve(searchParams) }));
}

describe("SignInPage", () => {
  it("renders an email field and a submit button", async () => {
    await renderPage();

    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(
      screen.getByRole("button", { name: /email me a sign-in code/i }),
    ).toBeInTheDocument();
  });

  it("says the app is invite-only", async () => {
    await renderPage();

    expect(screen.getByText(/invite-only/i)).toBeInTheDocument();
  });

  // The ?error= key is whatever the URL says. On a bare object literal these
  // resolve to inherited functions — truthy, so the fallback never fires — and
  // React throws "Functions are not valid as a React child". This page is also
  // the only one wording its own fallback, so it proves messageFor's third
  // argument survives the trip.
  it("falls back to its own wording for an inherited key", async () => {
    for (const key of ["constructor", "__proto__", "toString"]) {
      const { unmount } = render(
        await SignInPage({ searchParams: Promise.resolve({ error: key }) }),
      );

      expect(screen.getByRole("alert")).toHaveTextContent(
        /something went wrong signing you in/i,
      );
      unmount();
    }
  });

  it("shows no error by default", async () => {
    await renderPage();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a field error for a malformed address", async () => {
    await renderPage({ error: "invalid-email" });

    expect(screen.getByRole("alert")).toHaveTextContent(
      /doesn't look like an email address/i,
    );
  });

  // pages.error points here, so Auth.js's own error screen never renders and
  // its copy has to be reproduced. A silent form is the bug these cover.
  describe("Auth.js error codes", () => {
    it("explains a wrong or expired code", async () => {
      await renderPage({ error: "Verification" });

      expect(screen.getByRole("alert")).toHaveTextContent(
        /didn't match or has expired/i,
      );
    });

    it("explains a vanished pending cookie as an expired code", async () => {
      // submitSignInCode's own key: the pending cookie and the code expire
      // together, so no cookie means nothing left to redeem.
      await renderPage({ error: "code-expired" });

      expect(screen.getByRole("alert")).toHaveTextContent(/code has expired/i);
    });

    it("explains a denied code without naming the reason", async () => {
      await renderPage({ error: "AccessDenied" });

      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(/no longer valid/i);
      // Must not reveal whether an invitation exists for the address.
      expect(alert).not.toHaveTextContent(/invit(ed|ation)\b.*(not|no)\b/i);
    });

    it("reports a server misconfiguration", async () => {
      await renderPage({ error: "Configuration" });

      expect(screen.getByRole("alert")).toHaveTextContent(
        /wrong on our end/i,
      );
    });

    it("falls back to a generic message for an unrecognized code", async () => {
      await renderPage({ error: "SomethingNew" });

      expect(screen.getByRole("alert")).toHaveTextContent(
        /something went wrong signing you in/i,
      );
    });

    it("describes the email field with whichever error is showing", async () => {
      const { container } = render(
        await SignInPage({ searchParams: Promise.resolve({ error: "Verification" }) }),
      );

      expect(container.querySelector("#email")).toHaveAttribute(
        "aria-describedby",
        "email-error",
      );
    });
  });

  it("carries callbackUrl through the form so sign-in lands where the visitor was headed", async () => {
    const { container } = render(
      await SignInPage({
        searchParams: Promise.resolve({ callbackUrl: "/t/team-a/roster" }),
      }),
    );

    const hidden = container.querySelector('input[name="callbackUrl"]');
    expect(hidden).toHaveValue("/t/team-a/roster");
  });

  it("defaults callbackUrl to the landing page", async () => {
    const { container } = render(
      await SignInPage({ searchParams: Promise.resolve({}) }),
    );

    expect(container.querySelector('input[name="callbackUrl"]')).toHaveValue(
      "/",
    );
  });
});
