import { describe, expect, it } from "vitest";

import { buildInvitationEmail } from "./invitation-email";

describe("buildInvitationEmail", () => {
  it("names the team in the subject line", () => {
    const { subject } = buildInvitationEmail({
      teamName: "Cubs",
      token: "tok-1",
      env: { AUTH_URL: "https://app.example.com" },
    });

    expect(subject).toBe("You're invited to join Cubs");
  });

  it("builds the accept URL from the token and env", () => {
    const { acceptUrl } = buildInvitationEmail({
      teamName: "Cubs",
      token: "tok-1",
      env: { AUTH_URL: "https://app.example.com" },
    });

    expect(acceptUrl).toBe("https://app.example.com/invite/tok-1");
  });
});
