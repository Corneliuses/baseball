import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import SignInPage from "./page";
import { SIGNIN_MESSAGES } from "./signin-messages";

async function renderPage(
  searchParams: { error?: string; callbackUrl?: string } = {},
) {
  return render(await SignInPage({ searchParams: Promise.resolve(searchParams) }));
}

function hrefOf(name: RegExp): URL {
  const href = screen.getByRole("link", { name }).getAttribute("href");
  return new URL(href ?? "", "https://x.example");
}

describe("SignInPage", () => {
  it("offers one way in: a link that starts an auth service login", async () => {
    const { container } = await renderPage();

    const url = hrefOf(/sign in with kernel id/i);
    expect(url.pathname).toBe("/api/auth/login");
    expect(url.searchParams.get("callbackUrl")).toBe("/");
    expect(url.searchParams.has("prompt")).toBe(false);

    // No form, no email field, no button: the service asks for the address.
    expect(container.querySelector("form")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  // A plain anchor, never next/link: a prefetch would start a login on hover.
  it("is a plain anchor carrying the banana", async () => {
    await renderPage();

    const link = screen.getByRole("link", { name: /sign in with kernel id/i });
    expect(link.tagName).toBe("A");
    expect(link.className).toMatch(/\bbg-banana\b/);
  });

  it("carries callbackUrl so sign-in lands where the visitor was headed", async () => {
    await renderPage({ callbackUrl: "/t/team-a/roster" });

    expect(
      hrefOf(/sign in with kernel id/i).searchParams.get("callbackUrl"),
    ).toBe("/t/team-a/roster");
  });

  it("reduces a foreign callbackUrl to the landing page", async () => {
    await renderPage({ callbackUrl: "//evil.example" });

    expect(
      hrefOf(/sign in with kernel id/i).searchParams.get("callbackUrl"),
    ).toBe("/");
  });

  it("says the app is invite-only", async () => {
    await renderPage();

    expect(screen.getByText(/invite-only/i)).toBeInTheDocument();
  });

  it("shows no error by default", async () => {
    await renderPage();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // The ?error= key is whatever the URL says. On a bare object literal these
  // resolve to inherited functions — truthy, so the fallback never fires — and
  // React throws "Functions are not valid as a React child". This page is also
  // the only one wording its own fallback, so it proves messageFor's third
  // argument survives the trip.
  it("falls back to its own wording for an inherited key", async () => {
    for (const key of ["constructor", "__proto__", "toString"]) {
      const { unmount } = await renderPage({ error: key });

      expect(screen.getByRole("alert")).toHaveTextContent(
        /something went wrong signing you in/i,
      );
      unmount();
    }
  });

  // Auth.js's keys can still arrive from an old bookmark or a half-finished
  // code sign-in that straddled the cutover. They read as the generic failure.
  it("falls back to a generic message for an unrecognized key", async () => {
    for (const key of ["Verification", "AccessDenied", "SomethingNew"]) {
      const { unmount } = await renderPage({ error: key });

      expect(screen.getByRole("alert")).toHaveTextContent(
        /something went wrong signing you in/i,
      );
      unmount();
    }
  });

  // The auth service callback redirects here with these keys; each must read
  // as its own sentence, not the fallback.
  it("renders every auth service callback error", async () => {
    for (const [key, sentence] of Object.entries(SIGNIN_MESSAGES)) {
      const { unmount } = await renderPage({ error: key });

      expect(screen.getByRole("alert")).toHaveTextContent(sentence as string);
      unmount();
    }
    expect(Object.keys(SIGNIN_MESSAGES).sort()).toEqual([
      "access-denied",
      "account-mismatch",
      "login-required",
      "login-state",
      "not-invited",
      "signin-failed",
    ]);
  });

  it("offers a different account after a wrong-person login, forcing the service form", async () => {
    for (const error of ["account-mismatch", "not-invited"]) {
      const { unmount } = await renderPage({ error, callbackUrl: "/t/team-a" });

      const href = hrefOf(/use a different account/i);
      expect(href.pathname).toBe("/api/auth/login");
      expect(href.searchParams.get("prompt")).toBe("login");
      expect(href.searchParams.get("callbackUrl")).toBe("/t/team-a");
      unmount();
    }
  });

  it("sanitizes the different-account callbackUrl and hides the link otherwise", async () => {
    const { unmount } = await renderPage({
      error: "not-invited",
      callbackUrl: "//evil.example",
    });
    expect(
      hrefOf(/use a different account/i).searchParams.get("callbackUrl"),
    ).toBe("/");
    unmount();

    await renderPage({ error: "login-state" });
    expect(
      screen.queryByRole("link", { name: /use a different account/i }),
    ).toBeNull();
  });
});
