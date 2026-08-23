import { describe, it, expect } from "vitest";

import { ROLE_LABELS, roleLabel } from "./roles";

describe("role labels", () => {
  it("covers every role the schema has", () => {
    // A missing entry would print `undefined` on a page, which is worse than
    // printing the raw constant — hence both the exhaustive map and the
    // fallback below.
    expect(Object.keys(ROLE_LABELS).sort()).toEqual(["COACH", "OWNER", "PARENT"]);
  });

  it("writes them the way a person would", () => {
    expect(roleLabel("OWNER")).toBe("Owner");
    expect(roleLabel("COACH")).toBe("Coach");
    expect(roleLabel("PARENT")).toBe("Parent");
  });

  it("falls back to the raw value rather than to nothing", () => {
    // Roles cross boundaries the type system does not follow — a value read
    // back from a form, say. Printing an unexpected constant is ugly;
    // printing `undefined` is a bug report from a parent.
    expect(roleLabel("MANAGER")).toBe("MANAGER");
  });
});

describe("role labels and the prototype hazard", () => {
  // The same shape as the bug `messageTable` exists to prevent: on a plain
  // object literal, `ROLE_LABELS["constructor"]` resolves an Object.prototype
  // member — truthy, so `??` never fires — and React throws "Functions are not
  // valid as a React child" on the way out, crashing the page.
  //
  // Reachable because `roleLabel` accepts a plain string on purpose, for
  // values arriving from where the type system does not follow.
  it.each(["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"])(
    "returns the raw string for the inherited member %s",
    (key) => {
      expect(roleLabel(key)).toBe(key);
    },
  );

  it("never hands back something that is not a string", () => {
    for (const key of ["constructor", "toString", "OWNER", "MANAGER"]) {
      expect(typeof roleLabel(key)).toBe("string");
    }
  });

  it("cannot be mutated by a caller", () => {
    // Frozen as well as null-prototyped: a table this widely read should not
    // be rewritable from anywhere that imports it.
    expect(() => {
      (ROLE_LABELS as Record<string, string>).OWNER = "Boss";
    }).toThrow();
    expect(ROLE_LABELS.OWNER).toBe("Owner");
  });
});
