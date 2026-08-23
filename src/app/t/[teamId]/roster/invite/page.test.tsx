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
import BulkInvitePage from "./page";

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
    expect(markup).toContain("No players to invite parents for");
    expect(markup).not.toContain("Every player already has a parent linked");
  });

  it("no longer summarizes the batch through query params", async () => {
    // The outcome moved into the form's own returned state, where it can name
    // the players instead of counting them (#51). The page keeping a parallel
    // counter summary would mean two sources of truth for one submission —
    // and the counters were the ones that could not say *which* rows failed.
    const markup = await renderPage({ sent: "3", linked: "1", failed: "2" });

    expect(markup).not.toContain("3 invitations sent");
    expect(markup).not.toContain("could not be invited");
  });

  it("renders a friendly banner for lost access", async () => {
    // The only code that still reaches this page: validation is answered
    // inside the form now, but someone who is no longer a coach here is
    // redirected out to read it as a page.
    const markup = await renderPage({ error: "access" });
    expect(markup).toContain("no longer have access");
    expect(markup).toContain('role="alert"');
  });

  it("falls back safely for a code that is no longer handled here", async () => {
    // messageFor refuses to return a non-string and defaults unknown keys, so
    // a stale bookmark to ?error=invalid-email degrades to the generic line
    // rather than rendering nothing or crashing.
    const markup = await renderPage({ error: "invalid-email" });
    expect(markup).toContain("Something went wrong.");
  });
});
