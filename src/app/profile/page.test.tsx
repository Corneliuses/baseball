import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const getCurrentUser = vi.fn();
const getProfile = vi.fn();

vi.mock("@/lib/session", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUser(...args),
}));

vi.mock("@/lib/profile", () => ({
  getProfile: (...args: unknown[]) => getProfile(...args),
}));

vi.mock("./actions", () => ({
  updateProfileAction: vi.fn(),
  signOutAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

async function render(searchParams: { error?: string; saved?: string } = {}) {
  const { default: ProfilePage } = await import("./page");
  return renderToStaticMarkup(
    await ProfilePage({ searchParams: Promise.resolve(searchParams) }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  getCurrentUser.mockResolvedValue({
    id: "user-1",
    email: "sam@example.com",
    name: "Sam",
  });
  getProfile.mockResolvedValue({
    name: "Sam",
    email: "sam@example.com",
    phone: "555-1234",
  });
});

describe("ProfilePage", () => {
  it("shows the person the phone number the team has on file", async () => {
    const html = await render();

    expect(getProfile).toHaveBeenCalledWith("user-1");
    expect(html).toContain('value="555-1234"');
    expect(html).toContain('value="Sam"');
    expect(html).toContain("sam@example.com");
  });

  it("renders an empty phone field when there is no number on file", async () => {
    getProfile.mockResolvedValue({
      name: null,
      email: "sam@example.com",
      phone: null,
    });

    const html = await render();

    expect(html).toContain('id="phone"');
    expect(html).not.toContain('value="555-1234"');
  });

  // Proxy only checks that a session cookie exists, so the page cannot assume
  // a signed-in caller — see the comment on proxy.ts.
  it("redirects a signed-out visitor to sign-in", async () => {
    getCurrentUser.mockResolvedValue(null);

    await expect(render()).rejects.toThrow("NEXT_REDIRECT:/signin?callbackUrl=%2Fprofile");
    expect(getProfile).not.toHaveBeenCalled();
  });

  it("redirects when the session points at a user row that is gone", async () => {
    getProfile.mockResolvedValue(null);

    await expect(render()).rejects.toThrow("NEXT_REDIRECT:/signin?callbackUrl=%2Fprofile");
  });

  // ?error= is user-controlled; a prototype-chain key must fall through to
  // the generic message rather than resolving an Object.prototype member
  // into the tree, which is not a renderable child and crashes the page.
  it("treats prototype-chain error keys as unknown errors", async () => {
    const html = await render({ error: "__proto__" });

    expect(html).toContain("Something went wrong.");
  });

  it("surfaces a rejected phone number", async () => {
    const html = await render({ error: "invalid-phone" });

    expect(html).toContain("Phone number must be 32 characters or fewer.");
  });

  it("confirms a save", async () => {
    const html = await render({ saved: "1" });

    expect(html).toContain("Saved.");
  });

  it("does not confirm a save that failed", async () => {
    const html = await render({ saved: "1", error: "save-failed" });

    expect(html).not.toContain("Saved.");
    expect(html).toContain("Your changes couldn&#x27;t be saved. Try again.");
  });

  // The one sign-out affordance in the app — /profile is reachable from the
  // signed-in landing page's "Your profile" button and every team nav's
  // Profile tab, so it must actually be here. renderToStaticMarkup emits no
  // `action` attribute for a function action, so the closest observable claim
  // is structural: a submit button labelled "Sign out" as the first child of
  // its own form — a bare string match would still pass with the form gone
  // and the button decorative.
  it("offers a sign-out button wired as a form submit", async () => {
    const html = await render();

    expect(html).toMatch(
      /<form[^>]*><button[^>]*type="submit"[^>]*>Sign out<\/button>/,
    );
  });

  // A database error on the read must not render as "no number on file" —
  // getProfile deliberately does not swallow it, so the page must not either.
  it("lets a read failure reach the error boundary", async () => {
    getProfile.mockRejectedValue(new Error("connection lost"));

    await expect(render()).rejects.toThrow("connection lost");
  });

  // Push opt-in (#47) lives here because a subscription belongs to a person and
  // a browser, not a team. The card itself renders nothing until its effect has
  // run — it cannot know what the browser supports during SSR — so what is
  // observable at this layer is that neither configuration breaks the page, and
  // that the rest of the profile still renders. The card's own states are
  // covered in PushOptInCard.test.tsx.
  describe("push opt-in card", () => {
    it("renders the page with push configured", async () => {
      vi.stubEnv("VAPID_PUBLIC_KEY", "test-public-key");

      const html = await render();

      expect(html).toContain("Contact details");
      expect(html).toContain("Sign out");
    });

    it("renders the page unchanged on a deployment with no VAPID keys", async () => {
      vi.stubEnv("VAPID_PUBLIC_KEY", "");

      const html = await render();

      expect(html).toContain("Contact details");
      expect(html).not.toContain("Game day notifications");
    });

    it("never puts the key in the server-rendered markup", async () => {
      vi.stubEnv("VAPID_PUBLIC_KEY", "test-public-key");

      expect(await render()).not.toContain("test-public-key");
    });
  });
});
