import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Keeps every `?error=` page on the safe lookup, forever.
 *
 * Fifteen pages each declared their own `ERROR_MESSAGES` table. Three had been
 * hardened by hand against the `?error=constructor` crash and twelve had not —
 * not because anyone decided they were fine, but because the fix lived in a
 * comment on whichever file was open when it was discovered. That is the shape
 * of the problem: a convention nothing enforces is a convention half the
 * codebase is unaware of.
 *
 * So the convention is enforced here rather than trusted. `src/lib/error-messages.ts`
 * makes the safe path the short one; this makes the unsafe path fail the build.
 *
 * Deliberately narrow. It checks two things a machine can check without
 * understanding the page — that no page builds a message table from a bare
 * object literal, and that no page indexes one directly — and says nothing
 * about wording, which is the author's business. Not co-located, following
 * design-plan-drift.test.ts, because it guards every page at once and belongs
 * beside none of them.
 *
 * **When this fails**: the page is declaring `= {…}` or reading `TABLE[key]`.
 * Route it through `messageTable` / `messageFor` instead. Never widen the
 * pattern to make a new page pass.
 */

const APP_DIR = join(process.cwd(), "src", "app");

function pageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pageFiles(path);
    return entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")
      ? [path]
      : [];
  });
}

const FILES = pageFiles(APP_DIR).map((path) => ({
  path: path.slice(process.cwd().length + 1),
  source: readFileSync(path, "utf8"),
}));

describe("?error= message tables", () => {
  it("finds the pages it is meant to be guarding", () => {
    // A guard that silently matches nothing passes forever. This is the
    // canary: if the app is restructured and this test stops seeing pages, it
    // fails here rather than quietly approving everything.
    const withTables = FILES.filter((f) => f.source.includes("ERROR_MESSAGES"));

    expect(FILES.length).toBeGreaterThan(20);
    expect(withTables.length).toBeGreaterThanOrEqual(15);
  });

  it("declares no message table as a bare object literal", () => {
    const offenders = FILES.filter((f) =>
      /const \w*(?:ERROR_MESSAGES|MESSAGES)\b[^=]*=\s*\{/.test(f.source),
    ).map((f) => f.path);

    expect(offenders).toEqual([]);
  });

  it("hand-rolls no null-prototype table now that messageTable exists", () => {
    const offenders = FILES.filter((f) =>
      f.source.includes("Object.assign(Object.create(null)"),
    ).map((f) => f.path);

    expect(offenders).toEqual([]);
  });

  // The second half of the fix. A null-prototyped table read with `TABLE[key]`
  // is still one refactor away from being a plain literal read the same way;
  // going through messageFor keeps the non-string guard in the path.
  it("indexes no message table directly", () => {
    const offenders = FILES.filter((f) => /ERROR_MESSAGES\[/.test(f.source)).map(
      (f) => f.path,
    );

    expect(offenders).toEqual([]);
  });
});
