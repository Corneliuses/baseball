import { describe, expect, it } from "vitest";
import { Sport } from "@/generated/prisma/enums";
import {
  SPORTS,
  SPORT_LABELS,
  hasAnyChart,
  hasDepthChart,
  hasLineupChart,
} from "./sport";

describe("SPORTS and SPORT_LABELS", () => {
  it("list every enum value", () => {
    expect([...SPORTS].sort()).toEqual(Object.values(Sport).sort());
  });

  it("label every enum value", () => {
    for (const sport of Object.values(Sport)) {
      expect(SPORT_LABELS[sport]).toBeTruthy();
    }
    expect(SPORT_LABELS).toEqual({ BASEBALL: "Baseball", BASKETBALL: "Basketball" });
  });
});

describe("hasLineupChart", () => {
  it("is true for baseball", () => {
    expect(hasLineupChart("BASEBALL")).toBe(true);
  });

  it("is false for basketball", () => {
    expect(hasLineupChart("BASKETBALL")).toBe(false);
  });
});

describe("hasDepthChart and hasAnyChart", () => {
  it("gives basketball the depth chart and baseball the lineup chart, never both", () => {
    for (const sport of Object.values(Sport)) {
      expect(hasDepthChart(sport) && hasLineupChart(sport)).toBe(false);
      expect(hasAnyChart(sport)).toBe(true);
    }
    expect(hasDepthChart("BASKETBALL")).toBe(true);
    expect(hasDepthChart("BASEBALL")).toBe(false);
  });
});
