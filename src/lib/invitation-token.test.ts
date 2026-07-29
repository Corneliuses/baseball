import { describe, expect, it } from "vitest";

import {
  INVITATION_TTL_DAYS,
  generateInvitationToken,
  invitationExpiresAt,
  isLiveInvitation,
} from "./invitation-token";

describe("generateInvitationToken", () => {
  it("is URL-safe", () => {
    const token = generateInvitationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("differs across calls", () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();
    expect(a).not.toBe(b);
  });
});

describe("invitationExpiresAt", () => {
  it("is INVITATION_TTL_DAYS after now", () => {
    const now = new Date("2026-04-01T12:00:00Z");
    const expected = new Date(
      now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    expect(invitationExpiresAt(now)).toEqual(expected);
  });
});

describe("isLiveInvitation", () => {
  const now = new Date("2026-04-01T12:00:00Z");

  it("is true when unaccepted and not yet expired", () => {
    expect(
      isLiveInvitation(
        { expiresAt: new Date(now.getTime() + 1), acceptedAt: null },
        now,
      ),
    ).toBe(true);
  });

  it("is false once accepted, regardless of expiry", () => {
    expect(
      isLiveInvitation(
        { expiresAt: new Date(now.getTime() + 1), acceptedAt: now },
        now,
      ),
    ).toBe(false);
  });

  it("is false when expiresAt equals now exactly", () => {
    expect(
      isLiveInvitation({ expiresAt: now, acceptedAt: null }, now),
    ).toBe(false);
  });

  it("is true one millisecond before expiry", () => {
    expect(
      isLiveInvitation(
        { expiresAt: new Date(now.getTime() + 1), acceptedAt: null },
        now,
      ),
    ).toBe(true);
  });

  it("is false one millisecond after expiry", () => {
    expect(
      isLiveInvitation(
        { expiresAt: new Date(now.getTime() - 1), acceptedAt: null },
        now,
      ),
    ).toBe(false);
  });
});
