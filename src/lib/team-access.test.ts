import { describe, expect, it } from "vitest";
import { checkTeamAccess, TeamAccessError } from "@/lib/team-access";

const ACTIVE = null;
const ARCHIVED = new Date("2024-09-01");

describe("checkTeamAccess", () => {
  it("rejects a caller with no membership", () => {
    expect(() =>
      checkTeamAccess({ role: null, archivedAt: ACTIVE, intent: "read" }),
    ).toThrow(TeamAccessError);
  });

  it("rejects a parent attempting a coach-level action", () => {
    expect(() =>
      checkTeamAccess({
        role: "PARENT",
        archivedAt: ACTIVE,
        intent: "write",
        minRole: "COACH",
      }),
    ).toThrow(/Requires COACH/);
  });

  it("allows a coach to write on an active team", () => {
    expect(
      checkTeamAccess({
        role: "COACH",
        archivedAt: ACTIVE,
        intent: "write",
        minRole: "COACH",
      }),
    ).toBe("COACH");
  });

  it("allows reading an archived team", () => {
    expect(
      checkTeamAccess({ role: "PARENT", archivedAt: ARCHIVED, intent: "read" }),
    ).toBe("PARENT");
  });

  it("rejects writes to an archived team even for the owner", () => {
    expect(() =>
      checkTeamAccess({
        role: "OWNER",
        archivedAt: ARCHIVED,
        intent: "write",
        minRole: "OWNER",
      }),
    ).toThrow(/archived/);
  });

  it("checks role before archived status, so the error names the real problem", () => {
    try {
      checkTeamAccess({
        role: "PARENT",
        archivedAt: ARCHIVED,
        intent: "write",
        minRole: "COACH",
      });
      expect.unreachable();
    } catch (error) {
      expect((error as TeamAccessError).reason).toBe("insufficient-role");
    }
  });
});
