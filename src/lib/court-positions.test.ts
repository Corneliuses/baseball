import { describe, expect, it } from "vitest";

import {
  COURT_POSITIONS,
  COURT_POSITION_LABELS,
  ordinal,
  isCourtPosition,
} from "./court-positions";

describe("court positions", () => {
  it("lists the 1 through the 5", () => {
    expect(COURT_POSITIONS.map((p) => COURT_POSITION_LABELS[p])).toEqual([
      "PG",
      "SG",
      "SF",
      "PF",
      "C",
    ]);
  });

  it("recognises only court positions", () => {
    expect(isCourtPosition("CENTER")).toBe(true);
    expect(isCourtPosition("CATCHER")).toBe(false);
    expect(isCourtPosition("constructor")).toBe(false);
  });

  it("names each bench slot", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd",
    ]);
  });
});
