/// `H S% L%` — the shape every colour token in `globals.css` is written in —
/// to `#RRGGBB`.
///
/// Pure and DB-free like the rest of `src/lib/`, but unusual in that nothing
/// in the running app calls it: the two surfaces that cannot express an HSL
/// token (`app/manifest.ts` and `src/emails/brand.ts`) both hold **frozen hex**
/// copied from the light theme, and their tests redo this conversion to prove
/// the copies still match. It lives here rather than inside either test
/// because two hand-rolled colour converters that disagree would fail exactly
/// one of them, and the reader would have no way to tell which one lied.
///
/// Rejects anything that is not the token shape rather than guessing. A silent
/// fallback here would make a stale colour look verified.

export function hslToHex(triple: string): string {
  const match = /^(\d+(?:\.\d+)?) (\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%$/.exec(
    triple.trim(),
  );

  if (!match) {
    throw new Error(`Not an HSL triple: ${triple}`);
  }

  const h = Number(match[1]);
  const s = Number(match[2]) / 100;
  const l = Number(match[3]) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  const [r, g, b] = (
    [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x],
    ] as const
  )[Math.floor(h / 60) % 6];

  return `#${[r, g, b]
    .map((channel) =>
      Math.round((channel + m) * 255)
        .toString(16)
        .padStart(2, "0")
        .toUpperCase(),
    )
    .join("")}`;
}
