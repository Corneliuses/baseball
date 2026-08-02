/// Shared by both chart actions (#10, #11).

/**
 * `JSON.parse` a form field, reporting failure as `undefined` rather than
 * throwing.
 *
 * Both actions check team access before they look at the payload, so the parse
 * happens inside the same `try` that translates `TeamAccessError`. A throwing
 * parse would need its own nested `try` in there whose only job is to call
 * `redirect` — which throws too, straight back out to the enclosing catch.
 * Returning `undefined` keeps that flat: every schema in these actions is
 * required, so an unparseable field fails validation exactly like a malformed
 * one and lands on the same "couldn't be read" redirect.
 *
 * A field that is absent entirely stringifies to "null", which parses cleanly
 * and then fails the schema — the same outcome by a different route.
 */
export function parseJson(value: FormDataEntryValue | null): unknown {
  try {
    return JSON.parse(String(value));
  } catch {
    return undefined;
  }
}
