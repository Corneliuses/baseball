import { describe, expect, it } from "vitest";

import { planGuardianCascade, sortReturningCandidates } from "./returning-players";
import type { GuardianLink } from "./returning-players";

const dad: GuardianLink = { userId: "user-1", email: "dad@example.com", name: "Dad" };
const mom: GuardianLink = { userId: "user-2", email: "mom@example.com", name: "Mom" };

describe("planGuardianCascade", () => {
  it("puts every guardian in toCreate when none already have a membership", () => {
    const plan = planGuardianCascade([dad, mom], []);

    expect(plan.toCreate).toEqual([dad, mom]);
    expect(plan.alreadyMembers).toEqual([]);
  });

  it("puts every guardian in alreadyMembers when all already have a membership", () => {
    const plan = planGuardianCascade([dad, mom], ["user-1", "user-2"]);

    expect(plan.toCreate).toEqual([]);
    expect(plan.alreadyMembers).toEqual([dad, mom]);
  });

  it("splits a mixed set correctly", () => {
    const plan = planGuardianCascade([dad, mom], ["user-1"]);

    expect(plan.toCreate).toEqual([mom]);
    expect(plan.alreadyMembers).toEqual([dad]);
  });

  it("deduplicates a guardian listed twice, keeping the first occurrence", () => {
    const dadAgain: GuardianLink = { ...dad, name: "Dad (dup)" };
    const plan = planGuardianCascade([dad, dadAgain], []);

    expect(plan.toCreate).toEqual([dad]);
  });

  it("returns empty sets for a player with no guardians", () => {
    const plan = planGuardianCascade([], ["user-1"]);

    expect(plan.toCreate).toEqual([]);
    expect(plan.alreadyMembers).toEqual([]);
  });

  it("never lets a guardian appear in both toCreate and alreadyMembers", () => {
    const plan = planGuardianCascade([dad, mom], ["user-1"]);

    const toCreateIds = new Set(plan.toCreate.map((g) => g.userId));
    const overlap = plan.alreadyMembers.filter((g) => toCreateIds.has(g.userId));

    expect(overlap).toEqual([]);
  });
});

describe("sortReturningCandidates", () => {
  it("orders candidates alphabetically by name", () => {
    const candidates = [{ name: "Zed" }, { name: "Ada" }];

    expect(sortReturningCandidates(candidates).map((c) => c.name)).toEqual([
      "Ada",
      "Zed",
    ]);
  });

  it("does not mutate the input array", () => {
    const candidates = [{ name: "Zed" }, { name: "Ada" }];
    const original = [...candidates];

    sortReturningCandidates(candidates);

    expect(candidates).toEqual(original);
  });
});
