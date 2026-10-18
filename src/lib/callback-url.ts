/// Where to send someone after they sign in.
///
/// The value is attacker-supplied — /signin?callbackUrl=… goes into the form,
/// through the server action, and rides all the way to the link in the email —
/// so it is constrained to same-site paths. Anything else becomes "/".
///
/// Pure and DB-free so the hostile inputs can be enumerated in a test.

/**
 * Reduce a caller-supplied callback URL to something safe to redirect to.
 *
 * Rejects absolute URLs and both spellings of a scheme-relative one:
 * "//evil.example" and "/\evil.example". URL parsers normalize a backslash to
 * a slash, so the second is the first wearing a hat — a check for "//" alone
 * lets it through.
 *
 * Also rejects any ASCII control character, anywhere. The WHATWG parser strips
 * tab, CR and LF from a URL before reading it, so "/\t/evil.example" passes a
 * second-character check and then resolves to https://evil.example/ — the
 * same scheme-relative escape, hidden behind a character nobody types.
 */
export function safeCallbackUrl(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return "/";
  }

  if (/[\u0000-\u001f\u007f]/.test(value)) {
    return "/";
  }

  const secondCharacter = value[1];
  if (secondCharacter === "/" || secondCharacter === "\\") {
    return "/";
  }

  return value;
}
