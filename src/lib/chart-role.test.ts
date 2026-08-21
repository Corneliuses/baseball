import { describe, expect, it } from "vitest";

import { chartRole, ordinal } from "@/lib/chart-role";

const entry = (
  battingOrder: number | null,
  position: Parameters<typeof chartRole>[0]["position"] = null,
) => ({ battingOrder, position });

describe("ordinal", () => {
  it("suffixes 1, 2 and 3", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
  });

  it("suffixes the teens with th, not st/nd/rd", () => {
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(13)).toBe("13th");
  });

  it("suffixes 21 through 23 by their last digit again", () => {
    expect(ordinal(21)).toBe("21st");
    expect(ordinal(22)).toBe("22nd");
    expect(ordinal(23)).toBe("23rd");
  });

  it("suffixes everything else with th", () => {
    expect(ordinal(4)).toBe("4th");
    expect(ordinal(10)).toBe("10th");
  });
});

describe("chartRole on a selective team", () => {
  const allPlay = false;

  it("prints the batting slot and the position", () => {
    expect(chartRole(entry(3, "SHORTSTOP"), allPlay)).toBe("Bats 3rd · SS");
  });

  it("prints the outfield positions, which this team does field", () => {
    expect(chartRole(entry(9, "CENTER_FIELD"), allPlay)).toBe("Bats 9th · CF");
  });

  it("prints nothing for an unplaced player by default — the readiness page's shape", () => {
    expect(chartRole(entry(null), allPlay)).toBe("");
    expect(chartRole(entry(4), allPlay)).toBe("Bats 4th");
  });

  it("prints the bench label when one is asked for — team home's shape", () => {
    expect(chartRole(entry(null), allPlay, { benchLabel: "Bench" })).toBe("Bench");
    expect(chartRole(entry(4), allPlay, { benchLabel: "Bench" })).toBe(
      "Bats 4th · Bench",
    );
  });
});

describe("chartRole on an allPlay team", () => {
  const allPlay = true;

  it("prints the infield positions it does field", () => {
    expect(chartRole(entry(1, "PITCHER"), allPlay)).toBe("Bats 1st · P");
  });

  // The rule fieldedPositions exists for: an allPlay team fields no catcher and
  // no named outfield, so a row left at one is in the outfield zone — which is
  // where both diamonds already draw that player.
  it("reads a null position as OF, never as bench", () => {
    expect(chartRole(entry(2), allPlay)).toBe("Bats 2nd · OF");
    expect(chartRole(entry(2), allPlay, { benchLabel: "Bench" })).toBe("Bats 2nd · OF");
  });

  it("reads a stale CENTER_FIELD or CATCHER row as OF", () => {
    expect(chartRole(entry(5, "CENTER_FIELD"), allPlay)).toBe("Bats 5th · OF");
    expect(chartRole(entry(5, "CATCHER"), allPlay)).toBe("Bats 5th · OF");
  });

  it("prints OF alone for a player with no batting slot", () => {
    expect(chartRole(entry(null), allPlay)).toBe("OF");
  });
});
