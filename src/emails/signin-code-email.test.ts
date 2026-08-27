import { describe, expect, it } from "vitest";

import { buildSignInCodeEmail } from "./signin-code-email";

describe("buildSignInCodeEmail", () => {
  it("leads the subject with the display form of the code", () => {
    // The code is in the subject so it shows in the notification shade — a
    // parent reads it there and types it without leaving the app.
    const { subject } = buildSignInCodeEmail({ code: "K3M7QP2X" });

    expect(subject).toBe("K3M7-QP2X is your sign-in code");
  });

  it("formats the code split in half with a dash", () => {
    expect(buildSignInCodeEmail({ code: "K3M7QP2X" }).formattedCode).toBe(
      "K3M7-QP2X",
    );
  });

  it("states the expiry in minutes, matching the token maxAge", () => {
    expect(buildSignInCodeEmail({ code: "K3M7QP2X" }).expiresMinutes).toBe(10);
  });
});
