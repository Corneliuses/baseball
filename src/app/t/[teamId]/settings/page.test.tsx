import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const getTeamById = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: (...args: unknown[]) => getTeamById(...args),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const ACTIVE_TEAM = {
  id: "team-1",
  name: "Sharks",
  season: "2026",
  allPlay: true,
  groupMeUrl: null,
  archivedAt: null,
  createdAt: new Date("2026-07-28"),
};

async function render(searchParams: Record<string, string> = {}) {
  const { default: TeamSettingsPage } = await import("./page");
  return renderToStaticMarkup(
    await TeamSettingsPage({
      params: Promise.resolve({ teamId: "team-1" }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "OWNER", userId: "user-1" });
  getTeamById.mockResolvedValue(ACTIVE_TEAM);
});

describe("Team settings page", () => {
  it("should export a default function", async () => {
    const { default: TeamSettingsPage } = await import("./page");
    expect(typeof TeamSettingsPage).toBe("function");
  });

  it("offers a GroupMe link field, prefilled with the stored link", async () => {
    getTeamById.mockResolvedValue({
      ...ACTIVE_TEAM,
      groupMeUrl: "https://groupme.com/join_group/12345678/AbCdEfGh",
    });

    const html = await render();

    expect(html).toContain('name="groupMeUrl"');
    expect(html).toContain(
      'value="https://groupme.com/join_group/12345678/AbCdEfGh"',
    );
  });

  it("explains a rejected GroupMe link", async () => {
    const html = await render({ error: "invalid-groupme" });

    expect(html).toContain("look like a GroupMe link");
  });

  it("asks for confirmation before offering the archive button", async () => {
    const html = await render();

    expect(html).toContain("confirm=archive");
    expect(html).not.toContain("Yes, archive it");
  });

  it("warns that archiving locks the owner out too, once confirming", async () => {
    const html = await render({ confirm: "archive" });

    expect(html).toContain("Yes, archive it");
    expect(html).toContain("read-only for everyone");
  });

  it("never shows the archive confirm step on an archived team", async () => {
    getTeamById.mockResolvedValue({
      ...ACTIVE_TEAM,
      archivedAt: new Date("2026-08-01"),
    });

    const html = await render({ confirm: "archive" });

    expect(html).toContain("Unarchive team");
    expect(html).not.toContain("Yes, archive it");
  });
});
