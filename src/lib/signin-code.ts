/// The typed sign-in code — replacing the tapped magic link (#60).
///
/// A link is redeemed by whichever browser the OS hands it to, and on a phone
/// that is routinely not the container the person is standing in: an installed
/// PWA and the browser the email link opens in can hold separate cookie jars
/// (confirmed on Android — the report behind this change — and the designed-for
/// case on iOS). The session then lands where the app cannot read it, every
/// time. A typed code is the one credential that crosses a storage-container
/// boundary, because the human carries it instead of the OS routing it.
///
/// Pure and dependency-free: the generator feeds Auth.js's
/// `generateVerificationToken`, the normalizer runs in the code-entry action,
/// and both are enumerable in tests without either of those hosts.

/// Crockford base32: no I, L, O or U, so nothing in a code is one squint away
/// from another character. 8 characters × 5 bits = 40 bits, which has to carry
/// the security by itself — there is no attempt counter (adding one would need
/// a migration), so guesses are unlimited inside the expiry window. 2^40
/// against a 10-minute window is comfortably out of online-guessing reach; a
/// 6-digit code's 20 bits would not be.
export const SIGNIN_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const SIGNIN_CODE_LENGTH = 8;

/// Ten minutes. The code is read off one screen and typed into another, so it
/// lives minutes, not the day a magic link did — short expiry is the other
/// half of the no-attempt-counter trade above.
export const SIGNIN_CODE_MAX_AGE_SECONDS = 60 * 10;

/**
 * A fresh code in canonical form: 8 uppercase alphabet characters, no
 * separator. This exact string is what Auth.js hashes and stores, and what
 * `normalizeSignInCode` must reproduce from whatever the person types.
 *
 * `byte & 31` is uniform because 32 divides 256 exactly — no rejection
 * sampling needed, and nothing here to bias.
 */
export function generateSignInCode(): string {
  const bytes = new Uint8Array(SIGNIN_CODE_LENGTH);
  crypto.getRandomValues(bytes);

  let code = "";
  for (const byte of bytes) {
    code += SIGNIN_CODE_ALPHABET[byte & 31];
  }
  return code;
}

/// How the code renders in the email: split in half so it chunks the way a
/// person reads it. The dash is display only — the normalizer strips it.
export function formatSignInCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/// Crockford's decode conventions for the characters the alphabet excludes on
/// purpose: a person reading O, I or l off a small screen meant 0 or 1. The
/// generator never emits these, so mapping them can only rescue a misread,
/// never corrupt a valid code. U stays unmapped — it is excluded to keep
/// profanity out of codes, not because it resembles anything.
const MISREAD_MAP: Record<string, string> = { O: "0", I: "1", L: "1" };

/**
 * Reduce whatever the person typed to canonical form, or null when it cannot
 * be a code at all. `k3m7 qp2x`, `K3M7-QP2X` and `k3m7qp2x` all succeed; the
 * null case is the form's cue to say "that doesn't look like a code" without
 * a round trip through Auth.js.
 */
export function normalizeSignInCode(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  const cleaned = raw
    .replace(/[\s-]/g, "")
    .toUpperCase()
    .replace(/[OIL]/g, (c) => MISREAD_MAP[c] ?? c);

  if (cleaned.length !== SIGNIN_CODE_LENGTH) {
    return null;
  }

  for (const character of cleaned) {
    if (!SIGNIN_CODE_ALPHABET.includes(character)) {
      return null;
    }
  }

  return cleaned;
}
