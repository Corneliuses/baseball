import { describe, expect, it } from "vitest";

import { chartRole, isBenched, ordinal } from "@/lib/chart-role";

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
    expect(chartRole(entry(null), allPlay, { benchLabel: "Substitute" })).toBe(
      "Substitute",
    );
  });

  // The view page's substitutes list filters on `battingOrder === null` for
  // this reason, and says so: a kid batting third with no fielding spot is in
  // the order. "Bats 4th · Substitute" would misdescribe a kid who is playing,
  // and disagree with the page a parent reads next.
  it("never calls a player in the batting order benched", () => {
    expect(chartRole(entry(4), allPlay, { benchLabel: "Substitute" })).toBe(
      "Bats 4th",
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
    expect(chartRole(entry(2), allPlay, { benchLabel: "Substitute" })).toBe(
      "Bats 2nd · OF",
    );
  });

  it("reads a named outfield row as its own spot — CF, not OF", () => {
    // LF/CF/RF are placeable allPlay spots since the named-outfield revision,
    // so a pinned kid's line says which one.
    expect(chartRole(entry(5, "CENTER_FIELD"), allPlay)).toBe("Bats 5th · CF");
    expect(chartRole(entry(null, "LEFT_FIELD"), allPlay)).toBe("LF");
  });

  it("reads a stale CATCHER row as OF — the coach pitches", () => {
    expect(chartRole(entry(5, "CATCHER"), allPlay)).toBe("Bats 5th · OF");
  });

  it("prints OF alone for a player with no batting slot", () => {
    expect(chartRole(entry(null), allPlay)).toBe("OF");
  });
});

describe("isBenched", () => {
  it("is true only for a player in neither column on a selective team", () => {
    expect(isBenched(entry(null), false)).toBe(true);
    expect(isBenched(entry(3, "SHORTSTOP"), false)).toBe(false);
    expect(isBenched(entry(3), false)).toBe(false);
    expect(isBenched(entry(null, "SHORTSTOP"), false)).toBe(false);
  });

  it("is never true on an allPlay team — the leftover kids are the outfield", () => {
    expect(isBenched(entry(null), true)).toBe(false);
    expect(isBenched(entry(null, "CENTER_FIELD"), true)).toBe(false);
  });

  // The pin the export promises: isBenched true exactly when chartRole would
  // print the bench label. Team home styles on the former and prints the
  // latter, so a disagreement here is a banana marquee shouting "Substitute" —
  // or a playing kid rendered on quiet stock.
  it("agrees with chartRole about when the bench label prints", () => {
    const shapes = [
      entry(null),
      entry(3),
      entry(null, "SHORTSTOP"),
      entry(3, "SHORTSTOP"),
      entry(null, "CATCHER"),
      entry(null, "CENTER_FIELD"),
    ];
    for (const allPlay of [false, true]) {
      for (const shape of shapes) {
        expect(isBenched(shape, allPlay)).toBe(
          chartRole(shape, allPlay, { benchLabel: "Substitute" }) === "Substitute",
        );
      }
    }
  });
});
