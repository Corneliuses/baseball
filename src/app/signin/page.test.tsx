import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The real action pulls in Auth.js and the Prisma client; the page only needs
// something form-shaped to point at.
vi.mock("./actions", () => ({
  requestSignInLink: vi.fn(),
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
      screen.getByRole("button", { name: /email me a sign-in link/i }),
    ).toBeInTheDocument();
  });

  it("says the app is invite-only", async () => {
    await renderPage();

    expect(screen.getByText(/invite-only/i)).toBeInTheDocument();
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

  it("carries callbackUrl through the form so the link lands where the visitor was headed", async () => {
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
