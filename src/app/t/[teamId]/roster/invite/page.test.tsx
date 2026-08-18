import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const getRosterWithGuardians = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/roster", () => ({
  getRosterWithGuardians: (...args: unknown[]) => getRosterWithGuardians(...args),
}));

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
}));

import { TeamAccessError } from "@/lib/team-access";

function entry(
  id: string,
  name: string,
  guardianEmails: string[],
  jerseyNumber: number | null = null,
) {
  return {
    id,
    jerseyNumber,
    player: { id: `player-${id}`, name, dateOfBirth: null },
    guardianEmails,
  };
}

async function renderPage(searchParams: Record<string, string> = {}) {
  const { default: BulkInvitePage } = await import("./page");
  const result = await BulkInvitePage({
    params: Promise.resolve({ teamId: "team-1" }),
    searchParams: Promise.resolve(searchParams),
  });
  return renderToStaticMarkup(result);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "coach-1" });
  getRosterWithGuardians.mockResolvedValue([]);
});

describe("Bulk invite page", () => {
  it("requires coach access and 404s a pasted parent URL", async () => {
    requireTeamAccess.mockRejectedValue(new TeamAccessError("denied", "insufficient-role"));

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", {
      intent: "read",
      minRole: "COACH",
    });
  });

  it("renders an email input only for players without guardians", async () => {
    getRosterWithGuardians.mockResolvedValue([
      entry("entry-1", "Ada", []),
      entry("entry-2", "Zed", ["parent@example.com"]),
    ]);

    const markup = await renderPage();

    expect(markup).toContain('name="email-entry-1"');
    expect(markup).not.toContain('name="email-entry-2"');
    expect(markup).toContain("parent@example.com");
  });

  it("orders rows by jersey number like the roster page", async () => {
    getRosterWithGuardians.mockResolvedValue([
      entry("entry-1", "Zed", [], 9),
      entry("entry-2", "Ada", [], 3),
    ]);

    const markup = await renderPage();
    expect(markup.indexOf("Ada")).toBeLessThan(markup.indexOf("Zed"));
  });

  it("offers the message box with the form", async () => {
    getRosterWithGuardians.mockResolvedValue([entry("entry-1", "Ada", [])]);

    const markup = await renderPage();
    expect(markup).toContain('name="message"');
  });

  it("shows the empty state when every player is covered", async () => {
    getRosterWithGuardians.mockResolvedValue([
      entry("entry-1", "Ada", ["a@example.com"]),
    ]);

    const markup = await renderPage();
    expect(markup).toContain("Every player already has a parent linked");
    expect(markup).not.toContain('name="message"');
  });

  it("doesn't claim every player is covered when the roster reads empty", async () => {
    getRosterWithGuardians.mockResolvedValue([]);

    const markup = await renderPage();
    expect(markup).toContain("No players on the roster yet");
    expect(markup).not.toContain("Every player already has a parent linked");
  });

  it("summarizes the batch outcome from query params", async () => {
    const markup = await renderPage({ sent: "3", linked: "1", failed: "2" });

    expect(markup).toContain("3 invitations sent");
    expect(markup).toContain("1 already-member parent linked");
    expect(markup).toContain("2 could not be sent");
  });

  it("renders a friendly error banner", async () => {
    const markup = await renderPage({ error: "invalid-email" });
    expect(markup).toContain("isn&#x27;t valid");
  });
});
