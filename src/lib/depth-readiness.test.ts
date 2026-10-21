import { describe, expect, it } from "vitest";

import type { CourtPosition } from "@/generated/prisma/enums";
import { computeDepthReadiness, type DepthReadinessEntry } from "./depth-readiness";
import type { RsvpState } from "./rsvp";

function entry(
  id: string,
  courtPosition: CourtPosition | null = null,
  benchOrder: number | null = null,
): DepthReadinessEntry {
  return {
    entryId: `entry-${id}`,
    playerId: id,
    playerName: id.toUpperCase(),
    jerseyNumber: null,
    courtPosition,
    benchOrder,
  };
}

// A full starting five and a three-deep bench.
const roster = [
  entry("pg", "POINT_GUARD"),
  entry("sg", "SHOOTING_GUARD"),
  entry("sf", "SMALL_FORWARD"),
  entry("pf", "POWER_FORWARD"),
  entry("c", "CENTER"),
  entry("b1", null, 1),
  entry("b2", null, 2),
  entry("b3", null, 3),
];

function states(pairs: Record<string, RsvpState>): Map<string, RsvpState> {
  return new Map(Object.entries(pairs));
}

describe("computeDepthReadiness", () => {
  it("is ready before anyone answers, and lists everyone as awaiting in rotation order", () => {
    const result = computeDepthReadiness(roster, new Map());

    expect(result.ready).toBe(true);
    expect(result.declined).toEqual([]);
    expect(result.uncoveredPositions).toEqual([]);
    expect(result.awaiting.map((spot) => spot.entry.playerId)).toEqual([
      "pg", "sg", "sf", "pf", "c", "b1", "b2", "b3",
    ]);
    expect(result.available).toBe(8);
    expect(result.shortHanded).toBe(false);
  });

  it("reports a declined starter's position as uncovered", () => {
    const result = computeDepthReadiness(roster, states({ sf: "declined", pg: "attending" }));

    expect(result.ready).toBe(false);
    expect(result.uncoveredPositions).toEqual(["SMALL_FORWARD"]);
    expect(result.declined).toEqual([
      { entry: roster[2], kind: "starter", position: "SMALL_FORWARD" },
    ]);
    expect(result.awaiting.map((spot) => spot.entry.playerId)).not.toContain("pg");
  });

  it("lifts a declined bench player out of the bench and closes the order up", () => {
    const result = computeDepthReadiness(roster, states({ b1: "declined" }));

    expect(result.ready).toBe(false);
    expect(result.uncoveredPositions).toEqual([]);
    expect(result.declined).toEqual([{ entry: roster[5], kind: "bench", benchSlot: 1 }]);
    expect(result.effectiveBench.map((e) => e.playerId)).toEqual(["b2", "b3"]);
  });

  it("keeps a no-response bench player in the effective bench", () => {
    const result = computeDepthReadiness(roster, states({ b2: "no-response" }));

    expect(result.effectiveBench.map((e) => e.playerId)).toEqual(["b1", "b2", "b3"]);
  });

  it("lists declines starters-first in court order, then by bench slot", () => {
    const result = computeDepthReadiness(
      roster,
      states({ b2: "declined", c: "declined", pg: "declined" }),
    );

    expect(result.declined.map((spot) => spot.entry.playerId)).toEqual(["pg", "c", "b2"]);
    expect(result.uncoveredPositions).toEqual(["POINT_GUARD", "CENTER"]);
  });

  it("does not report an open spot the coach never filled", () => {
    const result = computeDepthReadiness(
      [entry("pg", "POINT_GUARD"), ...roster.slice(5), entry("x"), entry("y")],
      new Map(),
    );

    expect(result.uncoveredPositions).toEqual([]);
    expect(result.ready).toBe(true);
  });

  it("is short-handed when fewer than five are left", () => {
    const result = computeDepthReadiness(
      roster,
      states({ b1: "declined", b2: "declined", b3: "declined", c: "declined" }),
    );

    expect(result.available).toBe(4);
    expect(result.shortHanded).toBe(true);
    expect(result.effectiveBench).toEqual([]);
  });

  it("counts silence as available — five with three unanswered is not short", () => {
    const result = computeDepthReadiness(roster, states({ b1: "declined", b2: "declined", b3: "declined" }));

    expect(result.available).toBe(5);
    expect(result.shortHanded).toBe(false);
  });

  it("is not ready on a roster under five even with no declines", () => {
    const result = computeDepthReadiness(roster.slice(0, 4), new Map());

    expect(result.declined).toEqual([]);
    expect(result.shortHanded).toBe(true);
    expect(result.ready).toBe(false);
  });

  it("puts unplaced kids at the bottom of the bench, where the draft does", () => {
    const result = computeDepthReadiness(
      [...roster, entry("new")],
      states({ new: "declined" }),
    );

    expect(result.declined).toEqual([
      { entry: expect.objectContaining({ playerId: "new" }), kind: "bench", benchSlot: 4 },
    ]);
  });

  it("treats a player missing from the RSVP map as no-response", () => {
    const result = computeDepthReadiness(roster, states({}));

    expect(result.awaiting).toHaveLength(8);
    expect(result.declined).toHaveLength(0);
  });

  it("calls an empty roster neither short-handed nor in need", () => {
    const result = computeDepthReadiness([], new Map());

    expect(result.shortHanded).toBe(false);
    expect(result.ready).toBe(true);
  });
});
