import { describe, it, expect } from "vitest";

import { decideSignIn, type SignInGateInput } from "./signin-gate";

const NOW = new Date("2026-04-01T12:00:00Z");
const LATER = new Date("2026-04-08T12:00:00Z");
const EARLIER = new Date("2026-03-25T12:00:00Z");

const OWNER = "coach@example.com";

function input(overrides: Partial<SignInGateInput> = {}): SignInGateInput {
  return {
    email: "parent@example.com",
    ownerEmail: OWNER,
    invitations: [],
    hasMembership: false,
    now: NOW,
    ...overrides,
  };
}

describe("decideSignIn", () => {
  describe("the owner exception", () => {
    it("lets the owner in with no invitation and no membership", () => {
      expect(decideSignIn(input({ email: OWNER }))).toEqual({
        allowed: true,
        reason: "owner",
      });
    });

    it("lets the owner in regardless of case", () => {
      expect(decideSignIn(input({ email: "COACH@example.com" }))).toEqual({
        allowed: true,
        reason: "owner",
      });
    });

    it("lets the owner in even when their only invitation is expired", () => {
      const decision = decideSignIn(
        input({
          email: OWNER,
          invitations: [{ expiresAt: EARLIER, acceptedAt: null }],
        }),
      );

      expect(decision).toEqual({ allowed: true, reason: "owner" });
    });

    it("grants nothing when OWNER_EMAIL is unset", () => {
      const decision = decideSignIn(
        input({ email: OWNER, ownerEmail: undefined }),
      );

      expect(decision).toEqual({ allowed: false, reason: "no-invitation" });
    });
  });

  describe("invitations", () => {
    it("allows an unexpired, unaccepted invitation", () => {
      const decision = decideSignIn(
        input({ invitations: [{ expiresAt: LATER, acceptedAt: null }] }),
      );

      expect(decision).toEqual({ allowed: true, reason: "invitation" });
    });

    it("denies an expired invitation", () => {
      const decision = decideSignIn(
        input({ invitations: [{ expiresAt: EARLIER, acceptedAt: null }] }),
      );

      expect(decision).toEqual({ allowed: false, reason: "no-invitation" });
    });

    it("denies an already-accepted invitation that has not expired", () => {
      const decision = decideSignIn(
        input({ invitations: [{ expiresAt: LATER, acceptedAt: EARLIER }] }),
      );

      expect(decision).toEqual({ allowed: false, reason: "no-invitation" });
    });

    it("denies an invitation that is both expired and accepted", () => {
      const decision = decideSignIn(
        input({ invitations: [{ expiresAt: EARLIER, acceptedAt: EARLIER }] }),
      );

      expect(decision).toEqual({ allowed: false, reason: "no-invitation" });
    });

    it("treats an invitation expiring exactly now as expired", () => {
      const decision = decideSignIn(
        input({ invitations: [{ expiresAt: NOW, acceptedAt: null }] }),
      );

      expect(decision).toEqual({ allowed: false, reason: "no-invitation" });
    });

    it("allows when one of several invitations is still live", () => {
      const decision = decideSignIn(
        input({
          invitations: [
            { expiresAt: EARLIER, acceptedAt: null },
            { expiresAt: LATER, acceptedAt: EARLIER },
            { expiresAt: LATER, acceptedAt: null },
          ],
        }),
      );

      expect(decision).toEqual({ allowed: true, reason: "invitation" });
    });
  });

  describe("existing members", () => {
    it("allows a member whose invitations are all long since accepted", () => {
      const decision = decideSignIn(
        input({
          invitations: [{ expiresAt: EARLIER, acceptedAt: EARLIER }],
          hasMembership: true,
        }),
      );

      expect(decision).toEqual({ allowed: true, reason: "membership" });
    });

    it("allows a member with no invitation rows at all", () => {
      const decision = decideSignIn(input({ hasMembership: true }));

      expect(decision).toEqual({ allowed: true, reason: "membership" });
    });

    it("reports the invitation as the reason when both apply", () => {
      const decision = decideSignIn(
        input({
          invitations: [{ expiresAt: LATER, acceptedAt: null }],
          hasMembership: true,
        }),
      );

      expect(decision).toEqual({ allowed: true, reason: "invitation" });
    });
  });

  describe("everyone else", () => {
    it("denies an address with nothing on file", () => {
      expect(decideSignIn(input())).toEqual({
        allowed: false,
        reason: "no-invitation",
      });
    });

    it("denies a missing address", () => {
      expect(decideSignIn(input({ email: undefined }))).toEqual({
        allowed: false,
        reason: "no-invitation",
      });
    });

    it("denies a blank address even when OWNER_EMAIL is blank too", () => {
      const decision = decideSignIn(input({ email: "  ", ownerEmail: "  " }));

      expect(decision).toEqual({ allowed: false, reason: "no-invitation" });
    });
  });
});
