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
 */
export function safeCallbackUrl(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return "/";
  }

  const secondCharacter = value[1];
  if (secondCharacter === "/" || secondCharacter === "\\") {
    return "/";
  }

  return value;
}
