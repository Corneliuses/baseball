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

  // A database error on the read must not render as "no number on file" —
  // getProfile deliberately does not swallow it, so the page must not either.
  it("lets a read failure reach the error boundary", async () => {
    getProfile.mockRejectedValue(new Error("connection lost"));

    await expect(render()).rejects.toThrow("connection lost");
  });
});
