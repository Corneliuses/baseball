/// The `?error=…` lookup tables every page carries, in one place.
///
/// Two hazards, and this module answers both — deliberately, because either
/// one alone leaves the other open:
///
/// 1. **The key is attacker-chosen.** It comes straight off the query string,
///    so on a plain object literal `?error=constructor` resolves an
///    `Object.prototype` member. That is truthy, so the `??` fallback never
///    fires, and React throws "Functions are not valid as a React child" on the
///    way out — a crashed page from a hand-typed URL. `messageTable` gives the
///    object a null prototype, so there is nothing left to inherit.
///
/// 2. **The next table might skip step 1.** Fifteen pages declared their own
///    before this module existed and three had been hardened by hand, which is
///    exactly the split that lets the fix rot. So `messageFor` refuses to
///    return anything that is not a string, and stays safe even against a plain
///    literal added later by someone who never read this file.
///
/// Pure and DB-free, tested next door.

export const DEFAULT_ERROR_MESSAGE = "Something went wrong.";

/// Indexed as `string | undefined` rather than `string`: looking up an
/// arbitrary key misses far more often than it hits, and typing the result as
/// `string` is what hides the miss until it reaches the page.
export type MessageTable = Readonly<Partial<Record<string, string>>>;

/// Frozen as well as null-prototyped. Freezing guards nothing about the
/// prototype problem above — it is here because these tables are module-level
/// constants shared by every request the server handles.
export function messageTable(entries: Record<string, string>): MessageTable {
  return Object.freeze(Object.assign(Object.create(null), entries));
}

/**
 * The sentence for `key`, or `null` when there is no key at all.
 *
 * The distinction matters to the caller: `null` means "no error to report, and
 * render nothing", while the fallback means "something failed and we don't
 * recognise the code" — which is still worth telling the reader about.
 */
export function messageFor(
  table: MessageTable,
  key: string | undefined,
  fallback: string = DEFAULT_ERROR_MESSAGE,
): string | null {
  if (!key) {
    return null;
  }

  const message = table[key];
  return typeof message === "string" ? message : fallback;
}
