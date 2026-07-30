/// Normalizes a phone number for `User.phone`. Deliberately does not validate
/// format — this app has guardians outside the US, and extension numbers,
/// spaces, and punctuation are all legitimate. The only things rejected are
/// "clearly not a phone number" (implausibly long) and "clearly blank".

const MAX_PHONE_LENGTH = 32;

/**
 * Parse a phone number from form input. A blank field means "no number on
 * file" — `User.phone` is nullable. Collapses internal runs of whitespace to
 * a single space so "555   123  4567" and "555 123 4567" store identically.
 */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed === "") {
    return null;
  }

  if (trimmed.length > MAX_PHONE_LENGTH) {
    throw new RangeError(`Phone number must be ${MAX_PHONE_LENGTH} characters or fewer`);
  }

  return trimmed;
}
