import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const getCurrentUser = vi.fn();

vi.mock("@/lib/session", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUser(...args),
}));

/// `"use server"`, and it reaches Prisma through @/lib/teams.
vi.mock("./actions", () => ({ createTeamAction: vi.fn() }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import NewTeamPage from "./page";

async function renderPage(error?: string) {
  const page = await NewTeamPage({ searchParams: Promise.resolve({ error }) });
  return render(page);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OWNER_EMAIL", "owner@example.com");
  getCurrentUser.mockResolvedValue({
    id: "user-1",
    email: "owner@example.com",
    name: "Owner",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("New team page", () => {
  it("is a 404 for anyone but the owner", async () => {
    getCurrentUser.mockResolvedValue({ id: "u", email: "coach@example.com" });

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("offers both sports with neither preselected", async () => {
    await renderPage();

    const baseball = screen.getByRole("radio", { name: "Baseball" });
    const basketball = screen.getByRole("radio", { name: "Basketball" });
    expect(baseball).not.toBeChecked();
    expect(basketball).not.toBeChecked();
    expect(baseball).toBeRequired();
  });

  it("shows the all-play checkbox only once Baseball is picked", async () => {
    await renderPage();

    expect(screen.queryByRole("checkbox")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Baseball" }));
    expect(
      screen.getByRole("checkbox", { name: /every kid bats and fields/i }),
    ).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: "Basketball" }));
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("shows a redirected error from ?error=", async () => {
    await renderPage("access");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "You don't have access to create a team.",
    );
  });
});
