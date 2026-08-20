import { describe, expect, it } from "vitest";

import { buildTeamMessageEmail } from "./team-message-email";

describe("buildTeamMessageEmail", () => {
  it("prefixes the subject with the team name", () => {
    const { subject } = buildTeamMessageEmail({
      teamName: "Cubs",
      teamId: "team-1",
      subject: "Game moved to 5pm",
      env: { AUTH_URL: "https://app.example.com" },
    });

    expect(subject).toBe("[Cubs] Game moved to 5pm");
  });

  it("builds an absolute URL to the team page", () => {
    const { teamUrl } = buildTeamMessageEmail({
      teamName: "Cubs",
      teamId: "team-1",
      subject: "Game moved to 5pm",
      env: { AUTH_URL: "https://app.example.com" },
    });

    expect(teamUrl).toBe("https://app.example.com/t/team-1");
  });

  it("carries no token in the URL — every recipient is already a member", () => {
    const { teamUrl } = buildTeamMessageEmail({
      teamName: "Cubs",
      teamId: "team-1",
      subject: "Practice canceled",
      env: { AUTH_URL: "https://app.example.com" },
    });

    expect(teamUrl).not.toMatch(/token|invite/i);
  });
});
