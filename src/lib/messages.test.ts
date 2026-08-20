import { describe, expect, it } from "vitest";

import type { TeamMember } from "./memberships";
import {
  MESSAGE_AUDIENCES,
  messageBodySchema,
  messageSubjectSchema,
  resolveRecipients,
} from "./messages";

const owner: TeamMember = {
  userId: "u-owner",
  role: "OWNER",
  name: "Pat Owner",
  email: "owner@example.com",
  phone: null,
};
const coach: TeamMember = {
  userId: "u-coach",
  role: "COACH",
  name: "Casey Coach",
  email: "coach@example.com",
  phone: null,
};
const parentA: TeamMember = {
  userId: "u-parent-a",
  role: "PARENT",
  name: "Alex Parent",
  email: "alex@example.com",
  phone: null,
};
const parentB: TeamMember = {
  userId: "u-parent-b",
  role: "PARENT",
  name: null,
  email: "blake@example.com",
  phone: null,
};

const MEMBERS = [owner, coach, parentA, parentB];

describe("resolveRecipients", () => {
  it("resolves ALL_PARENTS for a coach to exactly the PARENT memberships", () => {
    const result = resolveRecipients({
      audience: "ALL_PARENTS",
      senderRole: "COACH",
      senderUserId: coach.userId,
      members: MEMBERS,
    });

    expect(result).toEqual({
      ok: true,
      recipients: [
        { userId: parentA.userId, name: parentA.name, email: parentA.email },
        { userId: parentB.userId, name: parentB.name, email: parentB.email },
      ],
    });
  });

  it("resolves ALL_COACHES for a parent to OWNER and COACH memberships", () => {
    const result = resolveRecipients({
      audience: "ALL_COACHES",
      senderRole: "PARENT",
      senderUserId: parentA.userId,
      members: MEMBERS,
    });

    expect(result).toEqual({
      ok: true,
      recipients: [
        { userId: owner.userId, name: owner.name, email: owner.email },
        { userId: coach.userId, name: coach.name, email: coach.email },
      ],
    });
  });

  it("resolves INDIVIDUAL_PARENT for a coach to the one targeted parent", () => {
    const result = resolveRecipients({
      audience: "INDIVIDUAL_PARENT",
      senderRole: "OWNER",
      senderUserId: owner.userId,
      targetUserId: parentB.userId,
      members: MEMBERS,
    });

    expect(result).toEqual({
      ok: true,
      recipients: [
        { userId: parentB.userId, name: parentB.name, email: parentB.email },
      ],
    });
  });

  // The product's one hard messaging rule (product-brief.md Won't-Do list):
  // no parent-to-parent path, anywhere. A parent sender must never be able
  // to produce a parent recipient, whatever a forged POST claims.
  it("never lets a PARENT sender reach a parent, under any audience", () => {
    for (const audience of MESSAGE_AUDIENCES) {
      const result = resolveRecipients({
        audience,
        senderRole: "PARENT",
        senderUserId: parentA.userId,
        targetUserId: parentB.userId,
        members: MEMBERS,
      });

      if (result.ok) {
        expect(audience).toBe("ALL_COACHES");
        for (const recipient of result.recipients) {
          const member = MEMBERS.find((m) => m.userId === recipient.userId);
          expect(member?.role).not.toBe("PARENT");
        }
      } else {
        expect(result.reason).toBe("forbidden-audience");
      }
    }
  });

  it("forbids ALL_COACHES for coaching-staff senders (out of scope for #13)", () => {
    for (const senderRole of ["OWNER", "COACH"] as const) {
      expect(
        resolveRecipients({
          audience: "ALL_COACHES",
          senderRole,
          senderUserId: "u-whoever",
          members: MEMBERS,
        }),
      ).toEqual({ ok: false, reason: "forbidden-audience" });
    }
  });

  it("rejects an INDIVIDUAL_PARENT target who is not a member of this team", () => {
    expect(
      resolveRecipients({
        audience: "INDIVIDUAL_PARENT",
        senderRole: "COACH",
        senderUserId: coach.userId,
        targetUserId: "u-stranger",
        members: MEMBERS,
      }),
    ).toEqual({ ok: false, reason: "invalid-target" });
  });

  it("rejects an INDIVIDUAL_PARENT target who is a coach, not a parent", () => {
    expect(
      resolveRecipients({
        audience: "INDIVIDUAL_PARENT",
        senderRole: "COACH",
        senderUserId: coach.userId,
        targetUserId: owner.userId,
        members: MEMBERS,
      }),
    ).toEqual({ ok: false, reason: "invalid-target" });
  });

  it("rejects INDIVIDUAL_PARENT with no target at all", () => {
    expect(
      resolveRecipients({
        audience: "INDIVIDUAL_PARENT",
        senderRole: "COACH",
        senderUserId: coach.userId,
        members: MEMBERS,
      }),
    ).toEqual({ ok: false, reason: "invalid-target" });
  });

  it("excludes the sender from a group audience", () => {
    // Degenerate data (one role per user+team makes this unreachable through
    // the UI), but the guarantee is cheap: nobody gets mailed their own
    // message.
    const result = resolveRecipients({
      audience: "ALL_COACHES",
      senderRole: "PARENT",
      senderUserId: coach.userId,
      members: MEMBERS,
    });

    expect(result).toEqual({
      ok: true,
      recipients: [
        { userId: owner.userId, name: owner.name, email: owner.email },
      ],
    });
  });

  it("reports no-recipients when the audience resolves empty", () => {
    expect(
      resolveRecipients({
        audience: "ALL_PARENTS",
        senderRole: "COACH",
        senderUserId: coach.userId,
        members: [owner, coach],
      }),
    ).toEqual({ ok: false, reason: "no-recipients" });
  });
});

describe("message schemas", () => {
  it("trims and accepts a normal subject and body", () => {
    expect(messageSubjectSchema.parse("  Game moved to 5pm  ")).toBe(
      "Game moved to 5pm",
    );
    expect(messageBodySchema.parse(" Bring water. ")).toBe("Bring water.");
  });

  it("rejects empty and whitespace-only values", () => {
    expect(messageSubjectSchema.safeParse("   ").success).toBe(false);
    expect(messageBodySchema.safeParse("").success).toBe(false);
  });

  it("rejects over-length values", () => {
    expect(messageSubjectSchema.safeParse("x".repeat(201)).success).toBe(false);
    expect(messageBodySchema.safeParse("x".repeat(5001)).success).toBe(false);
  });
});
