import { describe, it, expect } from "vitest";

import { buildDiamondNames } from "./diamond-names";

const namesOf = (people: [string, string][]) =>
  buildDiamondNames(people.map(([id, playerName]) => ({ id, playerName })));

/// The collision rules themselves are exercised through `buildChartView` in
/// chart-view.test.ts. These cover what that suite cannot see: the surname
/// rule, and the fact that both diamonds now share one answer.
describe("buildDiamondNames surnames", () => {
  it("reads past a generational suffix", () => {
    // "Ben Ortiz Jr" rendering as "Ben J." is worse than no initial at all —
    // it is an initial matching no name anywhere else on the page.
    const names = namesOf([
      ["a", "Ben Ortiz Jr"],
      ["b", "Ben Whitaker"],
    ]);

    expect(names.get("a")).toBe("Ben O.");
    expect(names.get("b")).toBe("Ben W.");
  });

  it.each(["Jr", "Jr.", "JR", "sr", "Sr.", "II", "iii", "IV"])(
    "treats %s as a suffix, not a surname",
    (suffix) => {
      const names = namesOf([
        ["a", `Ben Ortiz ${suffix}`],
        ["b", "Ben Whitaker"],
      ]);

      expect(names.get("a")).toBe("Ben O.");
    },
  );

  it("leaves a first-name-plus-suffix with no initial to borrow", () => {
    // "Ben Jr" has no surname. Falling back to the bare first name is honest;
    // "Ben J." would invent one.
    const names = namesOf([
      ["a", "Ben Jr"],
      ["b", "Ben Whitaker"],
    ]);

    expect(names.get("a")).toBe("Ben");
    expect(names.get("b")).toBe("Ben W.");
  });

  it("does not mistake a real surname for a suffix", () => {
    // Conservative by design: bare "I" and "V" are excluded from the suffix
    // list precisely so a short real name is never eaten.
    const names = namesOf([
      ["a", "Ben Vu"],
      ["b", "Ben Whitaker"],
    ]);

    expect(names.get("a")).toBe("Ben V.");
  });

  it("keys on whatever id the caller uses", () => {
    // The view page keys markers on playerId and the editor keys chips on
    // entryId; neither reshapes its rows to borrow this.
    const names = namesOf([["re-7", "Ava Castellanos"]]);

    expect(names.get("re-7")).toBe("Ava");
  });
});
