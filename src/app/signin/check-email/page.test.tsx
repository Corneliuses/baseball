import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// The real action pulls in Auth.js and the Prisma client; the page only needs
// something form-shaped to point at.
vi.mock("../actions", () => ({
  submitSignInCode: vi.fn(),
}));

const cookieGet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (...args: unknown[]) => cookieGet(...args) }),
}));

import CheckEmailPage from "./page";

function pendingCookie(email = "parent@example.com") {
  cookieGet.mockImplementation((name: string) =>
    name === "pending-signin"
      ? { value: JSON.stringify({ email, callbackUrl: "/" }) }
      : undefined,
  );
}

async function renderPage(searchParams: { error?: string } = {}) {
  render(await CheckEmailPage({ searchParams: Promise.resolve(searchParams) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieGet.mockReturnValue(undefined);
});

describe("CheckEmailPage", () => {
  describe("with a pending sign-in", () => {
    beforeEach(() => pendingCookie());

    it("renders the code entry form", async () => {
      await renderPage();

      const input = screen.getByLabelText("Sign-in code");
      // On a phone the code arrives as a notification; this is what lets the
      // keyboard offer it without a trip to the mail app.
      expect(input).toHaveAttribute("autocomplete", "one-time-code");
      expect(
        screen.getByRole("button", { name: /sign in/i }),
      ).toBeInTheDocument();
    });

    it("names the address the code went to", async () => {
      await renderPage();

      expect(
        screen.getByText(/parent@example\.com/),
      ).toBeInTheDocument();
    });

    // The wording must not promise a send: for an uninvited address none
    // happened, and saying otherwise tests who is on a team.
    it("stops short of promising an email was sent", async () => {
      await renderPage();

      expect(screen.getByText(/^If /)).toHaveTextContent(/is on a team/i);
    });

    it("shows no error by default", async () => {
      await renderPage();

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    // Auth.js rejected a redeem and /signin bounced it back here rather than
    // making the parent ask for a second email, so the message has to say the
    // mailed code is still good.
    it("explains a wrong code without sending the parent back for another", async () => {
      await renderPage({ error: "wrong-code" });

      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(/didn't match/i);
      expect(alert).toHaveTextContent(/still works/i);
    });

    it("keeps the entry form on screen alongside that message", async () => {
      await renderPage({ error: "wrong-code" });

      expect(screen.getByLabelText("Sign-in code")).toBeInTheDocument();
    });

    // Same hardening as every other ?error= page: inherited keys must hit
    // messageFor's string check, not render a function.
    it("renders nothing for an inherited key", async () => {
      await renderPage({ error: "constructor" });

      expect(screen.getByRole("alert")).toHaveTextContent(
        /something went wrong/i,
      );
    });

    it("offers a way back to a different address", async () => {
      await renderPage();

      expect(
        screen.getByRole("link", { name: /use a different address/i }),
      ).toHaveAttribute("href", "/signin");
    });

    // withSingleLiveCode makes this true rather than merely tidy: a second
    // request deletes the first code, and someone holding both emails needs
    // to know which one still works.
    it("says a new code replaces the one already sent", async () => {
      await renderPage();

      expect(screen.getByText(/replaces the one we already sent/i)).toBeInTheDocument();
    });
  });

  describe("without a pending sign-in", () => {
    it("offers to start over instead of a doomed form", async () => {
      // The cookie and the code expire together — a direct visit or a stale
      // tab has nothing left to redeem.
      await renderPage();

      expect(screen.queryByLabelText("Sign-in code")).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /enter your email/i }),
      ).toHaveAttribute("href", "/signin");
    });
  });

  it("reads the __Secure- spelling too", async () => {
    cookieGet.mockImplementation((name: string) =>
      name === "__Secure-pending-signin"
        ? { value: JSON.stringify({ email: "a@b.com", callbackUrl: "/" }) }
        : undefined,
    );

    await renderPage();

    expect(screen.getByLabelText("Sign-in code")).toBeInTheDocument();
  });
});
