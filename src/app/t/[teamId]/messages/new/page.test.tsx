import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const listTeamMembers = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/memberships", () => ({
  listTeamMembers: (...args: unknown[]) => listTeamMembers(...args),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { TeamAccessError } from "@/lib/team-access";

const MEMBERS = [
  {
    userId: "u-coach",
    role: "COACH",
    name: "Casey Coach",
    email: "coach@example.com",
    phone: null,
  },
  {
    userId: "u-parent-a",
    role: "PARENT",
    name: "Alex Parent",
    email: "alex@example.com",
    phone: null,
  },
  {
    userId: "u-parent-b",
    role: "PARENT",
    name: null,
    email: "blake@example.com",
    phone: null,
  },
];

async function renderPage(searchParams: Record<string, string> = {}) {
  const { default: NewMessagePage } = await import("./page");
  const result = await NewMessagePage({
    params: Promise.resolve({ teamId: "team-1" }),
    searchParams: Promise.resolve(searchParams),
  });
  return renderToStaticMarkup(result);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "u-coach" });
  listTeamMembers.mockResolvedValue(MEMBERS);
});

describe("New message page", () => {
  it("declares the maxDuration that governs the paced send loop", async () => {
    const page = await import("./page");

    expect(page.maxDuration).toBe(60);
  });

  it("404s a caller with no membership", async () => {
    requireTeamAccess.mockRejectedValue(
      new TeamAccessError("denied", "no-membership"),
    );

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("gives a coach the audience choice with only parents in the select", async () => {
    const html = await renderPage();

    expect(html).toContain('value="ALL_PARENTS"');
    expect(html).toContain('value="INDIVIDUAL_PARENT"');
    expect(html).toContain("Alex Parent");
    // A parent with no name on file is listed by email.
    expect(html).toContain("blake@example.com");
    // The coaching staff are not selectable targets.
    expect(html).not.toContain('value="u-coach"');
  });

  it("fixes a parent's audience to the coaching staff, with no picker", async () => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "u-parent-a" });

    const html = await renderPage();

    expect(html).toContain('value="ALL_COACHES"');
    expect(html).not.toContain('value="ALL_PARENTS"');
    expect(html).not.toContain('value="INDIVIDUAL_PARENT"');
    // The parent select never renders, so no other family's name or address
    // reaches a parent through this page.
    expect(html).not.toContain("Alex Parent");
    expect(listTeamMembers).not.toHaveBeenCalled();
  });

  it("renders the error banner for a known error code", async () => {
    const html = await renderPage({ error: "no-recipients" });

    expect(html).toContain("nobody in that group");
  });

  it("renders the sent/failed status banner", async () => {
    const html = await renderPage({ sent: "24", failed: "1" });

    expect(html).toContain("Sent to 24 people");
    expect(html).toContain("1 email could not be sent");
  });
});
