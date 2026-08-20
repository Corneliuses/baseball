import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireTeamAccess = vi.fn();
const listMessages = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/messages", () => ({
  listMessages: (...args: unknown[]) => listMessages(...args),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

import { TeamAccessError } from "@/lib/team-access";
import MessagesPage from "./page";

async function renderPage() {
  const result = await MessagesPage({
    params: Promise.resolve({ teamId: "team-1" }),
  });
  return renderToStaticMarkup(result);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "u-coach" });
  listMessages.mockResolvedValue([]);
});

describe("Messages page", () => {
  it("404s a caller with no membership", async () => {
    requireTeamAccess.mockRejectedValue(
      new TeamAccessError("denied", "no-membership"),
    );

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listMessages).not.toHaveBeenCalled();
  });

  // The list is coach-and-above (owner decision, 2026-08-20), but a parent's
  // side of messaging is the compose form — so they get sent there, never a
  // dead end.
  it("redirects a parent to the compose form without reading the list", async () => {
    requireTeamAccess.mockResolvedValue({ role: "PARENT", userId: "u-parent" });

    await expect(renderPage()).rejects.toThrow(
      "NEXT_REDIRECT:/t/team-1/messages/new",
    );
    expect(listMessages).not.toHaveBeenCalled();
  });

  it("renders broadcast history for a coach, newest first as given", async () => {
    listMessages.mockResolvedValue([
      {
        id: "msg-2",
        subject: "Practice canceled",
        body: "Rain. Stay dry.",
        sentAt: new Date("2026-08-19T22:30:00Z"),
        senderName: "Casey Coach",
        senderEmail: "coach@example.com",
      },
      {
        id: "msg-1",
        subject: "Welcome",
        body: "First game Saturday.",
        sentAt: new Date("2026-08-10T15:00:00Z"),
        senderName: null,
        senderEmail: "owner@example.com",
      },
    ]);

    const html = await renderPage();

    expect(html).toContain("Practice canceled");
    expect(html).toContain("Rain. Stay dry.");
    expect(html).toContain("Casey Coach");
    // A sender with no name on file falls back to their email.
    expect(html).toContain("owner@example.com");
    expect(html).toContain(`href="/t/team-1/messages/new"`);
  });

  it("renders an empty state that explains what gets recorded", async () => {
    const html = await renderPage();

    expect(html).toContain("No broadcasts yet.");
  });
});
