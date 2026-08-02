import { describe, it, expect } from "vitest";

import {
  DIAMOND_GEOMETRY,
  POSITION_COORDS,
} from "@/components/diamond-geometry";
import { ALL_POSITIONS } from "@/lib/positions";

/// Layout invariants for the diamond. These failures are otherwise silent:
/// an SVG child drawn outside the viewBox is simply clipped, and two markers
/// on top of each other still render — neither throws, and neither shows up
/// in a snapshot of the markup. The catcher's name was clipped exactly this
/// way before these tests existed.
const { width, height, markerRadius, tagOffset } = DIAMOND_GEOMETRY;

describe("diamond geometry", () => {
  it("places all nine positions", () => {
    for (const position of ALL_POSITIONS) {
      expect(POSITION_COORDS[position]).toBeDefined();
    }
    expect(Object.keys(POSITION_COORDS)).toHaveLength(9);
  });

  it("keeps every marker's lowest text inside the viewBox", () => {
    for (const position of ALL_POSITIONS) {
      const { y } = POSITION_COORDS[position];
      expect(y + tagOffset).toBeLessThanOrEqual(height);
    }
  });

  it("keeps every marker inside the viewBox on the other three sides", () => {
    for (const position of ALL_POSITIONS) {
      const { x, y } = POSITION_COORDS[position];
      expect(y - markerRadius).toBeGreaterThanOrEqual(0);
      expect(x - markerRadius).toBeGreaterThanOrEqual(0);
      expect(x + markerRadius).toBeLessThanOrEqual(width);
    }
  });

  it("never overlaps two position markers", () => {
    for (let i = 0; i < ALL_POSITIONS.length; i++) {
      for (let j = i + 1; j < ALL_POSITIONS.length; j++) {
        const a = POSITION_COORDS[ALL_POSITIONS[i]];
        const b = POSITION_COORDS[ALL_POSITIONS[j]];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);

        expect(distance).toBeGreaterThan(markerRadius * 2);
      }
    }
  });

  it("leaves a marker's text clear of the marker below it", () => {
    // Any marker whose text band would collide with a lower marker's circle
    // makes both unreadable. Compare only near-vertical neighbours.
    for (const upper of ALL_POSITIONS) {
      for (const lower of ALL_POSITIONS) {
        if (upper === lower) continue;
        const a = POSITION_COORDS[upper];
        const b = POSITION_COORDS[lower];

        const horizontallyClose = Math.abs(a.x - b.x) < markerRadius * 2;
        const isBelow = b.y > a.y;
        if (!horizontallyClose || !isBelow) continue;

        expect(a.y + tagOffset).toBeLessThan(b.y - markerRadius);
      }
    }
  });
});
