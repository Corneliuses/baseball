import { describe, expect, it } from "vitest";

import { parseJerseyNumber, rosterWriteFailure, sortRoster } from "./roster-rules";

describe("parseJerseyNumber", () => {
  it("returns null for a blank string", () => {
    expect(parseJerseyNumber("")).toBeNull();
    expect(parseJerseyNumber("   ")).toBeNull();
  });

  it("returns null for non-string input", () => {
    expect(parseJerseyNumber(undefined)).toBeNull();
    expect(parseJerseyNumber(null)).toBeNull();
  });

  it("parses a valid whole number", () => {
    expect(parseJerseyNumber("7")).toBe(7);
    expect(parseJerseyNumber(" 42 ")).toBe(42);
  });

  it("accepts the boundary values 0 and 99", () => {
    expect(parseJerseyNumber("0")).toBe(0);
    expect(parseJerseyNumber("99")).toBe(99);
  });

  it("rejects a number above 99", () => {
    expect(() => parseJerseyNumber("100")).toThrow(RangeError);
  });

  it("rejects a negative number", () => {
    expect(() => parseJerseyNumber("-1")).toThrow(RangeError);
  });

  it("rejects a non-integer", () => {
    expect(() => parseJerseyNumber("7.5")).toThrow(RangeError);
  });

  it("rejects non-numeric text", () => {
    expect(() => parseJerseyNumber("abc")).toThrow(RangeError);
  });
});

describe("sortRoster", () => {
  it("orders numbered players ascending by jersey number", () => {
    const entries = [
      { jerseyNumber: 12, player: { name: "Bea" } },
      { jerseyNumber: 3, player: { name: "Ada" } },
    ];

    expect(sortRoster(entries).map((e) => e.jerseyNumber)).toEqual([3, 12]);
  });

  it("places unnumbered players after numbered players", () => {
    const entries = [
      { jerseyNumber: null, player: { name: "Zed" } },
      { jerseyNumber: 5, player: { name: "Ada" } },
    ];

    expect(sortRoster(entries).map((e) => e.jerseyNumber)).toEqual([5, null]);
  });

  it("orders unnumbered players by name", () => {
    const entries = [
      { jerseyNumber: null, player: { name: "Zed" } },
      { jerseyNumber: null, player: { name: "Ada" } },
    ];

    expect(sortRoster(entries).map((e) => e.player.name)).toEqual([
      "Ada",
      "Zed",
    ]);
  });

  it("does not mutate the input array", () => {
    const entries = [
      { jerseyNumber: 9, player: { name: "Bea" } },
      { jerseyNumber: 1, player: { name: "Ada" } },
    ];
    const original = [...entries];

    sortRoster(entries);

    expect(entries).toEqual(original);
  });
});

describe("rosterWriteFailure", () => {
  it("returns null for a non-Prisma error", () => {
    expect(rosterWriteFailure(new Error("boom"))).toBeNull();
  });

  it("returns null for a Prisma error that isn't P2002", () => {
    expect(rosterWriteFailure({ code: "P2003" })).toBeNull();
  });

  it("maps a jerseyNumber collision via a column-array target", () => {
    expect(
      rosterWriteFailure({
        code: "P2002",
        meta: { target: ["teamId", "jerseyNumber"] },
      }),
    ).toBe("jersey-taken");
  });

  it("maps a jerseyNumber collision via a constraint-name-string target", () => {
    expect(
      rosterWriteFailure({
        code: "P2002",
        meta: { target: "RosterEntry_teamId_jerseyNumber_key" },
      }),
    ).toBe("jersey-taken");
  });

  it("maps a playerId+teamId collision via a column-array target", () => {
    expect(
      rosterWriteFailure({
        code: "P2002",
        meta: { target: ["playerId", "teamId"] },
      }),
    ).toBe("already-rostered");
  });

  it("maps a playerId+teamId collision via a constraint-name-string target", () => {
    expect(
      rosterWriteFailure({
        code: "P2002",
        meta: { target: "RosterEntry_playerId_teamId_key" },
      }),
    ).toBe("already-rostered");
  });

  it("returns null for a P2002 on an unrelated constraint", () => {
    expect(
      rosterWriteFailure({
        code: "P2002",
        meta: { target: ["email"] },
      }),
    ).toBeNull();
  });

  it("returns null when meta is missing", () => {
    expect(rosterWriteFailure({ code: "P2002" })).toBeNull();
  });
});
