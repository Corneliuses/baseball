import { describe, expect, it } from "vitest";

import { sortDirectory } from "./directory-rules";

describe("sortDirectory", () => {
  it("orders OWNER before COACH before PARENT", () => {
    const entries = [
      { role: "PARENT" as const, name: "Ada", email: "ada@example.com" },
      { role: "OWNER" as const, name: "Zed", email: "zed@example.com" },
      { role: "COACH" as const, name: "Mel", email: "mel@example.com" },
    ];

    expect(sortDirectory(entries).map((e) => e.role)).toEqual([
      "OWNER",
      "COACH",
      "PARENT",
    ]);
  });

  it("orders alphabetically by name within a role", () => {
    const entries = [
      { role: "PARENT" as const, name: "Zed", email: "zed@example.com" },
      { role: "PARENT" as const, name: "Ada", email: "ada@example.com" },
    ];

    expect(sortDirectory(entries).map((e) => e.name)).toEqual(["Ada", "Zed"]);
  });

  it("falls back to email when name is null", () => {
    const entries = [
      { role: "PARENT" as const, name: null, email: "zed@example.com" },
      { role: "PARENT" as const, name: null, email: "ada@example.com" },
    ];

    expect(sortDirectory(entries).map((e) => e.email)).toEqual([
      "ada@example.com",
      "zed@example.com",
    ]);
  });

  it("does not mutate the input array", () => {
    const entries = [
      { role: "PARENT" as const, name: "Zed", email: "zed@example.com" },
      { role: "OWNER" as const, name: "Ada", email: "ada@example.com" },
    ];
    const original = [...entries];

    sortDirectory(entries);

    expect(entries).toEqual(original);
  });
});
