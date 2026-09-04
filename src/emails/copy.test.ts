import { describe, expect, it } from "vitest";

import { rosterFootnote, whenWhere } from "./copy";

describe("rosterFootnote", () => {
  it("names the team", () => {
    expect(rosterFootnote("Hawks")).toBe(
      "You're getting this because your player is on Hawks's roster.",
    );
  });
});

describe("whenWhere", () => {
  it("joins the time and the place with an em dash", () => {
    expect(whenWhere("Today at 5:45 PM", "Field 5")).toBe(
      "Today at 5:45 PM — Field 5",
    );
  });

  it("is just the time when there is no place", () => {
    expect(whenWhere("Today at 5:45 PM", null)).toBe("Today at 5:45 PM");
  });
});
