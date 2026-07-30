import { describe, expect, it } from "vitest";

import { buildAddedToTeamEmail } from "./added-to-team-email";

describe("buildAddedToTeamEmail", () => {
  it("names the team in the subject line", () => {
    const { subject } = buildAddedToTeamEmail({
      teamName: "Cubs",
      teamId: "team-1",
      env: { AUTH_URL: "https://app.example.com" },
    });

    expect(subject).toBe("You've been added to Cubs");
  });

  it("builds an absolute URL to the team page", () => {
    const { teamUrl } = buildAddedToTeamEmail({
      teamName: "Cubs",
      teamId: "team-1",
      env: { AUTH_URL: "https://app.example.com" },
    });

    expect(teamUrl).toBe("https://app.example.com/t/team-1");
  });

  it("carries no token in the URL", () => {
    const { teamUrl } = buildAddedToTeamEmail({
      teamName: "Cubs",
      teamId: "team-1",
      env: { AUTH_URL: "https://app.example.com" },
    });

    expect(teamUrl).not.toMatch(/token|invite/i);
  });
});
