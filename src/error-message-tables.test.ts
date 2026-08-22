import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Keeps every `?error=` page on the safe lookup, forever.
 *
 * Fifteen pages each declared their own message table. Three had been hardened
 * by hand against the `?error=constructor` crash and twelve had not — not
 * because anyone judged them safe, but because the fix lived in a comment on
 * whichever file was open when it was found. A convention nothing enforces is
 * a convention half the codebase has never heard of. So `src/lib/error-messages.ts`
 * makes the safe path the short one, and this makes the unsafe path fail the build.
 *
 * **This parses; it does not pattern-match.** Two earlier versions matched text
 * and both leaked. The first keyed on the identifier `ERROR_MESSAGES`, so a
 * table named anything else sailed through. The second matched the substring
 * `WORD[error]`, so `TABLE?.[error]`, `TABLE[error as keyof typeof TABLE]`,
 * `TABLE[error ?? "x"]`, `TABLE[ error ]` and `TABLE[String(error)]` all
 * escaped — five unsafe forms, found one review round at a time. That is what
 * regexes do to a grammar: every round closes one hole and implies the next.
 * A syntax tree ends the argument, because "an element access whose index
 * expression mentions `error`" is a property of the parse, not of the spelling.
 *
 * **What this does and does not promise.** It catches indexing an object by the
 * attacker-chosen key directly, in any spelling. It cannot see through a helper
 * that takes the table and the key as parameters and indexes them under other
 * names. That residue is deliberate and is why `messageFor` carries its own
 * `typeof === "string"` check: the runtime guard is what holds, and this test
 * exists to keep people on the path that has it — not to be the last line.
 *
 * **When this fails**: route the table through `messageTable` / `messageFor`.
 * Never widen a rule to make a new file pass.
 */

const SRC = join(process.cwd(), "src");

/// The module implementing the safe path is exempt from rules about it.
const IMPLEMENTATION = join("src", "lib", "error-messages.ts");

/// The attacker-chosen key. Everything below is about what may be done with a
/// value of this name.
const ERROR_PARAM = "error";

type SourceFile = {
  path: string;
  ast: ts.SourceFile;
};

function sourcePaths(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourcePaths(path);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

const FILES: SourceFile[] = sourcePaths(SRC)
  .map((absolute) => ({ absolute, path: relative(process.cwd(), absolute) }))
  .filter((file) => file.path !== IMPLEMENTATION)
  .map(({ absolute, path }) => ({
    path,
    ast: ts.createSourceFile(
      path,
      readFileSync(absolute, "utf8"),
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    ),
  }));

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

function mentionsErrorParam(node: ts.Node): boolean {
  let found = false;
  walk(node, (child) => {
    if (ts.isIdentifier(child) && child.text === ERROR_PARAM) found = true;
  });
  return found;
}

/// `path:line`, so a failure names the offending line rather than only the file.
function location(file: SourceFile, node: ts.Node): string {
  const { line } = file.ast.getLineAndCharacterOfPosition(node.getStart(file.ast));
  return `${file.path}:${line + 1}`;
}

function findAll(predicate: (node: ts.Node, file: SourceFile) => boolean): string[] {
  return FILES.flatMap((file) => {
    const hits: string[] = [];
    walk(file.ast, (node) => {
      if (predicate(node, file)) hits.push(location(file, node));
    });
    return hits;
  });
}

/// `X[…]` — including `X?.[…]`, which parses to the same node kind.
function indexesByErrorParam(node: ts.Node): boolean {
  return ts.isElementAccessExpression(node) && mentionsErrorParam(node.argumentExpression);
}

/// A bare object literal typed as a string map: the shape that carries
/// `Object.prototype` with it. `messageTable({…})` is a call, not a literal
/// initializer, so it does not match.
function declaresBareStringMap(node: ts.Node): boolean {
  if (!ts.isVariableDeclaration(node)) return false;
  if (!node.initializer || !ts.isObjectLiteralExpression(node.initializer)) return false;

  const type = node.type;
  if (!type || !ts.isTypeReferenceNode(type)) return false;
  if (type.typeName.getText(type.getSourceFile()) !== "Record") return false;

  return (
    type.typeArguments?.length === 2 &&
    type.typeArguments.every((argument) => argument.kind === ts.SyntaxKind.StringKeyword)
  );
}

/// A file that takes `?error=` off the query string. Detected by the property
/// in its searchParams type, which covers `error?: string`,
/// `error: string | undefined`, and any other spelling of the annotation —
/// unlike the substring match this replaced, which only saw the first.
function readsErrorParam(file: SourceFile): boolean {
  let found = false;
  walk(file.ast, (node) => {
    if (
      (ts.isPropertySignature(node) || ts.isPropertyAssignment(node)) &&
      ts.isIdentifier(node.name) &&
      node.name.text === ERROR_PARAM
    ) {
      found = true;
    }
  });
  return found;
}

describe("?error= message tables", () => {
  // A guard that silently matches nothing passes forever. The floors sit well
  // below today's counts on purpose: this fails when the scan breaks, not when
  // somebody legitimately deletes a page.
  it("can still see the files it is guarding", () => {
    expect(FILES.length).toBeGreaterThan(20);
    expect(FILES.filter(readsErrorParam).length).toBeGreaterThanOrEqual(8);
  });

  // The rule that actually stops the crash. It does not care what the table is
  // called, how it was built, or how the index is spelled.
  it("indexes nothing by the ?error= query param", () => {
    expect(findAll(indexesByErrorParam)).toEqual([]);
  });

  it("has no ?error= file declaring a bare string-map literal", () => {
    const offenders = findAll(
      (node, file) => declaresBareStringMap(node) && readsErrorParam(file),
    );

    expect(offenders).toEqual([]);
  });

  it("has nobody hand-rolling a null-prototype table now that messageTable exists", () => {
    const offenders = findAll(
      (node) =>
        ts.isCallExpression(node) &&
        node.expression.getText(node.getSourceFile()) === "Object.assign" &&
        node.arguments.some((argument) =>
          argument.getText(node.getSourceFile()).startsWith("Object.create(null)"),
        ),
    );

    expect(offenders).toEqual([]);
  });
});
