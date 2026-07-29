import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const getInvitationByToken = vi.fn();

vi.mock("@/lib/invitations", () => ({
  getInvitationByToken: (...args: unknown[]) => getInvitationByToken(...args),
}));

// The real action pulls in Auth.js and the Prisma client; the page only
// needs something form-shaped to point at. Matches src/app/signin/page.test.tsx.
vi.mock("./actions", () => ({
  requestInvitationLinkAction: vi.fn(),
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

async function render(token: string, sent?: string) {
  const { default: InvitePage } = await import("./page");
  const result = await InvitePage({
    params: Promise.resolve({ token }),
    searchParams: Promise.resolve({ sent }),
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
  });

  it("shows the send-link form for a live invitation, with the email masked", async () => {
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
    expect(markup).toContain("Send me a sign-in link");
    expect(markup).not.toContain("sam@example.com");
  });

  it("shows the sent confirmation instead of the form once sent=1", async () => {
    getInvitationByToken.mockResolvedValue({
      teamId: "team-1",
      teamName: "Cubs",
      email: "sam@example.com",
      role: "PARENT",
      expiresAt: new Date(NOW.getTime() + 1000),
      acceptedAt: null,
    });

    const markup = await render("tok-1", "1");

    expect(markup).toContain("Check your email");
    expect(markup).not.toContain("Send me a sign-in link");
  });
});
