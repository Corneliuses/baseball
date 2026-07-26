import { describe, expect, it } from "vitest";
import { computeReadiness, type ChartEntry } from "@/lib/readiness";

const chart: ChartEntry[] = [
  { playerId: "ava", playerName: "Ava", battingOrder: 1, position: "SHORTSTOP" },
  { playerId: "ben", playerName: "Ben", battingOrder: 2, position: "PITCHER" },
  { playerId: "cy", playerName: "Cy", battingOrder: 3, position: "FIRST_BASE" },
  { playerId: "dee", playerName: "Dee", battingOrder: 4, position: "LEFT_FIELD" },
  // Benched: allPlay = false leaves these null.
  { playerId: "eli", playerName: "Eli", battingOrder: null, position: null },
];

const everyone = new Set(chart.map((e) => e.playerId));

describe("computeReadiness", () => {
  it("is ready when the whole chart is attending", () => {
    const result = computeReadiness(chart, everyone);

    expect(result.ready).toBe(true);
    expect(result.absentFromOrder).toEqual([]);
    expect(result.uncoveredPositions).toEqual([]);
  });

  it("reports the absent player and the position they leave empty", () => {
    const attending = new Set(everyone);
    attending.delete("ben");

    const result = computeReadiness(chart, attending);

    expect(result.ready).toBe(false);
    expect(result.absentFromOrder.map((e) => e.playerId)).toEqual(["ben"]);
    expect(result.uncoveredPositions).toEqual(["PITCHER"]);
  });

  it("closes ranks in the effective order without renumbering the chart", () => {
    const attending = new Set(everyone);
    attending.delete("ben");

    const result = computeReadiness(chart, attending);

    expect(result.effectiveOrder.map((e) => e.playerId)).toEqual([
      "ava",
      "cy",
      "dee",
    ]);
    // The standing chart is untouched — Cy still bats 3rd in it, not 2nd.
    expect(chart.find((e) => e.playerId === "cy")?.battingOrder).toBe(3);
  });

  it("ignores benched players entirely", () => {
    const attending = new Set(everyone);
    attending.delete("eli");

    const result = computeReadiness(chart, attending);

    expect(result.ready).toBe(true);
    expect(result.effectiveOrder).toHaveLength(4);
  });

  it("returns uncovered positions in scorebook order, not chart order", () => {
    const attending = new Set(["ava"]);

    const result = computeReadiness(chart, attending);

    expect(result.uncoveredPositions).toEqual([
      "PITCHER",
      "FIRST_BASE",
      "LEFT_FIELD",
    ]);
  });

  it("reports an empty chart as ready rather than throwing", () => {
    expect(computeReadiness([], new Set()).ready).toBe(true);
  });
});
