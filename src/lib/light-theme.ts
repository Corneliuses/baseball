import { readFileSync } from "node:fs";
import { join } from "node:path";

import { hslToHex } from "./hsl-to-hex";

/// The light-theme value of one `globals.css` token, as hex.
///
/// Test support, not app code: nothing at runtime reads the stylesheet, and
/// nothing should — this exists for the two surfaces that hold **frozen hex**
/// copied from the light theme (`app/manifest.ts`, `src/emails/brand.ts`) and
/// the tests that prove the copies still match. It lives in `src/lib/` rather
/// than inside either test because two hand-rolled parsers of one file that
/// disagree fail exactly one suite and give a reader no way to tell which one
/// lied, which is the argument `hslToHex` already made for itself.
///
/// Reads the `:root { … }` block only, so the value is the light one however
/// the dark override and the `@theme inline` block are ordered around it — a
/// first-match regex over the whole file would silently pick up the dark
/// value if the blocks were ever reordered.
export function lightThemeHex(token: string): string {
  const css = readFileSync(
    join(process.cwd(), "src/app/globals.css"),
    "utf8",
  );
  // `[\s\S]` rather than `.` with the dotAll flag: tsconfig targets below
  // es2018, where `/s/` is a compile error.
  const root = /:root \{([\s\S]*?)\n\}/.exec(css);
  if (!root) {
    throw new Error(
      "Could not find the :root block in globals.css — this parser, not the " +
        "stylesheet, is probably what needs updating.",
    );
  }

  const match = new RegExp(`--${token}:\\s*([^;]+);`).exec(root[1]);
  if (!match) {
    throw new Error(
      `--${token} is not in globals.css's :root block — this parser, not the ` +
        "stylesheet, is probably what needs updating.",
    );
  }

  return hslToHex(match[1]);
}
