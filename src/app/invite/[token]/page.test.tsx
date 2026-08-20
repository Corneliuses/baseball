import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const getInvitationByToken = vi.fn();

vi.mock("@/lib/invitations", () => ({
  getInvitationByToken: (...args: unknown[]) => getInvitationByToken(...args),
}));

// The real action pulls in the Prisma client and next/headers; the page only
// needs something form-shaped to point at. Matches src/app/signin/page.test.tsx.
vi.mock("./actions", () => ({
  acceptInvitationAction: vi.fn(),
}));

const NOW = new Date("2026-04-01T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

async function render(token: string, error?: string) {
  const { default: InvitePage } = await import("./page");
  const result = await InvitePage({
    params: Promise.resolve({ token }),
    searchParams: Promise.resolve({ error }),
  });
  return renderToStaticMarkup(result);
}

describe("Invite page", () => {
  it("should export a default function", async () => {
    getInvitationByToken.mockResolvedValue(null);
    const { default: InvitePage } = await import("./page");
    expect(typeof InvitePage).toBe("function");
  });

  it("shows an unknown-token state when the token doesn't resolve", async () => {
    getInvitationByToken.mockResolvedValue(null);

    const markup = await render("bad-token");

    expect(markup).toContain("Invitation not found");
  });

  // Neither failure state may dead-end: a revoked or expired invitation often
  // belongs to someone whose Membership already exists, so sign-in works.
  it("offers a way out of the unknown-token state", async () => {
    getInvitationByToken.mockResolvedValue(null);

    const markup = await render("bad-token");

    expect(markup).toContain("/signin");
    expect(markup).toContain("Go to sign in");
  });

  it("shows an already-accepted state and a link to sign in", async () => {
    getInvitationByToken.mockResolvedValue({
      teamId: "team-1",
      teamName: "Cubs",
      email: "sam@example.com",
      role: "PARENT",
      expiresAt: new Date(NOW.getTime() + 1000),
      acceptedAt: NOW,
    });

    const markup = await render("tok-1");

    expect(markup).toContain("Already accepted");
    expect(markup).toContain("/signin");
  });

  it("shows an expired state for a token past its expiry", async () => {
    getInvitationByToken.mockResolvedValue({
      teamId: "team-1",
      teamName: "Cubs",
      email: "sam@example.com",
      role: "PARENT",
      expiresAt: new Date(NOW.getTime() - 1000),
      acceptedAt: null,
    });

    const markup = await render("tok-1");

    expect(markup).toContain("Invitation expired");
    expect(markup).toContain("Go to sign in");
  });

  it("asks for an optional name on the live invitation form", async () => {
    getInvitationByToken.mockResolvedValue({
      teamId: "team-1",
      teamName: "Cubs",
      email: "sam@example.com",
      role: "PARENT",
      expiresAt: new Date(NOW.getTime() + 1000),
      acceptedAt: null,
    });

    const markup = await render("tok-1");

    expect(markup).toContain("Your name (optional)");
    expect(markup).toContain('name="name"');
  });

  it("shows the accept form for a live invitation, with the email masked", async () => {
    getInvitationByToken.mockResolvedValue({
      teamId: "team-1",
      teamName: "Cubs",
      email: "sam@example.com",
      role: "PARENT",
      expiresAt: new Date(NOW.getTime() + 1000),
      acceptedAt: null,
    });

    const markup = await render("tok-1");

    expect(markup).toContain("Cubs");
    expect(markup).toContain("Accept invitation");
    expect(markup).toContain("tok-1");
    expect(markup).not.toContain("sam@example.com");
  });

  // The whole point of the change: accepting must not send them back to an
  // inbox for a second link.
  it("does not offer to email a sign-in link", async () => {
    getInvitationByToken.mockResolvedValue({
      teamId: "team-1",
      teamName: "Cubs",
      email: "sam@example.com",
      role: "PARENT",
      expiresAt: new Date(NOW.getTime() + 1000),
      acceptedAt: null,
    });

    const markup = await render("tok-1");

    expect(markup).not.toContain("Send me a sign-in link");
    expect(markup).not.toContain("Check your email");
  });

  it("keeps the accept form on screen alongside a failure message", async () => {
    getInvitationByToken.mockResolvedValue({
      teamId: "team-1",
      teamName: "Cubs",
      email: "sam@example.com",
      role: "PARENT",
      expiresAt: new Date(NOW.getTime() + 1000),
      acceptedAt: null,
    });

    const markup = await render("tok-1", "1");

    expect(markup).toContain("Something went wrong accepting your invitation");
    expect(markup).toContain("Accept invitation");
  });
});
