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
