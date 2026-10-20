import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { APP_NAME, APP_SHORT_NAME } from "@/lib/app-name";

/// The app was "Youth Baseball Team Manager" in 26 places before #90 routed
/// them all through `APP_NAME`. This keeps it that way: a hand-typed name is
/// the one a future rename misses.
const OLD_NAME = "Youth Baseball Team Manager";

const SRC = join(process.cwd(), "src");

/// This file has to spell the old name to look for it. `src/generated/` is
/// Prisma output and is skipped below.
const EXEMPT = new Set(["lib/app-name.test.ts"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "generated" ? [] : sourceFiles(path);
    }
    return /\.(ts|tsx|css)$/.test(entry.name) ? [path] : [];
  });
}

describe("APP_NAME", () => {
  it("is the decided name", () => {
    expect(APP_NAME).toBe("Cornelius Team Manager");
    expect(APP_SHORT_NAME).toBe("Team Manager");
  });

  it("is the only spelling of the app's name in src/", () => {
    const offenders = sourceFiles(SRC)
      .filter((path) => !EXEMPT.has(relative(SRC, path)))
      .filter((path) => readFileSync(path, "utf8").includes(OLD_NAME))
      .map((path) => relative(process.cwd(), path));

    expect(offenders).toEqual([]);
  });

  // public/sw.js is a static file served as-is, so it cannot import the
  // constant and carries a copy for a push that arrives without a title.
  it("matches the service worker's fallback notification title", () => {
    const sw = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");

    expect(sw).toContain(`payload.title || "${APP_NAME}"`);
    expect(sw).not.toContain(OLD_NAME);
  });
});
