import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const listTeamMembers = vi.fn();
const listTeamInvitations = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/memberships", () => ({
  listTeamMembers: (...args: unknown[]) => listTeamMembers(...args),
}));

vi.mock("@/lib/invitations", () => ({
  listTeamInvitations: (...args: unknown[]) => listTeamInvitations(...args),
}));

const NOW = new Date("2026-04-01T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  requireTeamAccess.mockResolvedValue({ role: "OWNER", userId: "user-1" });
  listTeamMembers.mockResolvedValue([]);
  listTeamInvitations.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Members page", () => {
  it("should export a default function", async () => {
    const { default: MembersPage } = await import("./page");
    expect(typeof MembersPage).toBe("function");
  });

  it("shows only live invitations as pending", async () => {
    listTeamInvitations.mockResolvedValue([
      {
        id: "inv-1",
        email: "live@example.com",
        role: "PARENT",
        expiresAt: new Date(NOW.getTime() + 1000),
        acceptedAt: null,
        createdAt: NOW,
      },
      {
        id: "inv-2",
        email: "expired@example.com",
        role: "PARENT",
        expiresAt: new Date(NOW.getTime() - 1000),
        acceptedAt: null,
        createdAt: NOW,
      },
      {
        id: "inv-3",
        email: "accepted@example.com",
        role: "PARENT",
        expiresAt: new Date(NOW.getTime() + 1000),
        acceptedAt: NOW,
        createdAt: NOW,
      },
    ]);

    const { default: MembersPage } = await import("./page");
    const result = await MembersPage({
      params: Promise.resolve({ teamId: "team-1" }),
      searchParams: Promise.resolve({}),
    });

    const markup = renderToStaticMarkup(result);
    expect(markup).toContain("live@example.com");
    expect(markup).not.toContain("expired@example.com");
    expect(markup).not.toContain("accepted@example.com");
  });

  it("disables the role control for the team's only owner", async () => {
    listTeamMembers.mockResolvedValue([
      { userId: "user-1", role: "OWNER", name: "Sam", email: "sam@example.com", phone: null },
      { userId: "user-2", role: "COACH", name: "Alex", email: "alex@example.com", phone: null },
    ]);

    const { default: MembersPage } = await import("./page");
    const result = await MembersPage({
      params: Promise.resolve({ teamId: "team-1" }),
      searchParams: Promise.resolve({}),
    });

    const markup = renderToStaticMarkup(result);
    const ownerRowIndex = markup.indexOf("Sam");
    const ownerFormEnd = markup.indexOf("</form>", ownerRowIndex);
    const ownerForm = markup.slice(ownerRowIndex, ownerFormEnd);
    expect(ownerForm).toContain("disabled");
  });
});
