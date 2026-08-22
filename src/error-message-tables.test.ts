import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Keeps every `?error=` page on the safe lookup, forever.
 *
 * Fifteen pages each declared their own message table. Three had been hardened
 * by hand against the `?error=constructor` crash and twelve had not — not
 * because anyone judged them safe, but because the fix lived in a comment on
 * whichever file was open when it was found. A convention nothing enforces is
 * a convention half the codebase has never heard of.
 *
 * So `src/lib/error-messages.ts` makes the safe path the short one, and this
 * makes the unsafe path fail the build.
 *
 * **Both rules key on shape, never on an identifier.** An earlier version
 * matched the name `ERROR_MESSAGES`, which meant `const ERRORS = {…}` read as
 * `ERRORS[error]` sailed through green while AGENTS.md claimed the rule was
 * enforced — a guard that is worse than none, because it is believed. The two
 * rules also cover each other: an untyped literal escapes the declaration rule
 * and is caught by the lookup rule, which is the one that matters, since
 * indexing is where the crash happens.
 *
 * Scope is all of `src/`, not just `src/app/`: the same mistake in a component
 * or a plain module crashes the same page.
 *
 * **When this fails**: route the table through `messageTable` / `messageFor`.
 * Never widen a pattern to make a new file pass.
 */

const SRC = join(process.cwd(), "src");

/// The module that implements the safe path is exempt from rules about
/// hand-rolling it.
const IMPLEMENTATION = join("src", "lib", "error-messages.ts");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

const FILES = sourceFiles(SRC)
  .map((path) => ({
    path: relative(process.cwd(), path),
    source: readFileSync(path, "utf8"),
  }))
  .filter((file) => file.path !== IMPLEMENTATION);

/// A file whose searchParams carry `?error=`. That query string is
/// attacker-chosen, which is the whole reason these rules exist; a table keyed
/// on anything else (a Prisma enum, say) is not in scope and is left alone.
const READS_ERROR_PARAM = /\berror\?:\s*string/;
const ERROR_READERS = FILES.filter((file) => READS_ERROR_PARAM.test(file.source));

/// A bare object literal typed as a string map — the shape that carries
/// Object.prototype with it. Name-agnostic by design.
const BARE_STRING_MAP = /:\s*Record<string,\s*string>\s*=\s*\{/;

/// Indexing any table by the query param, whatever that table is called.
/// `messageFor(TABLE, error)` does not match; `TABLE[error]` does.
const INDEXED_BY_ERROR = /\w\[error\]/;

describe("?error= message tables", () => {
  // A guard that silently matches nothing passes forever. The floors sit well
  // below today's counts on purpose: this fails when the scan breaks, not when
  // somebody legitimately deletes a page.
  it("can still see the files it is guarding", () => {
    expect(FILES.length).toBeGreaterThan(20);
    expect(ERROR_READERS.length).toBeGreaterThanOrEqual(8);
  });

  it("has no ?error= file declaring a bare string-map literal", () => {
    const offenders = ERROR_READERS.filter((file) =>
      BARE_STRING_MAP.test(file.source),
    ).map((file) => file.path);

    expect(offenders).toEqual([]);
  });

  // The rule that actually stops the crash: it does not care how the table was
  // built, only that the attacker-chosen key never indexes it directly.
  it("has no ?error= file indexing a table by the query param", () => {
    const offenders = ERROR_READERS.filter((file) =>
      INDEXED_BY_ERROR.test(file.source),
    ).map((file) => file.path);

    expect(offenders).toEqual([]);
  });

  it("has nobody hand-rolling a null-prototype table now that messageTable exists", () => {
    const offenders = FILES.filter((file) =>
      file.source.includes("Object.assign(Object.create(null)"),
    ).map((file) => file.path);

    expect(offenders).toEqual([]);
  });
});
