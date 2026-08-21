import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DIAMOND_GEOMETRY, FIELD_ART } from "@/components/diamond-geometry";

/**
 * Keeps `docs/design/design-plan.md` honest about the code it describes.
 *
 * That document ships in the same repository as its implementation, which
 * makes it a second source of truth — and a second source of truth rots
 * silently. It rotted three times before this test existed: the colour table
 * named one `--accent` where the code had split `--accent` and `--banana`, the
 * marker section specified a `<rect>` pill that was never built, and the field
 * geometry still quoted the radii from before the visual-review fixes moved
 * them. Every one of those was caught by a human reading the diff, which is
 * exactly the review attention this test is meant to buy back.
 *
 * So the plan states its facts in a shape a machine can check, and this asserts
 * them. It is deliberately narrow: it verifies **claims the document makes**,
 * never that the document mentions everything. Prose, rationale, and the
 * screen-by-screen pass stay free-form — the point is to catch stale numbers
 * and stale token names, not to turn a design document into a schema.
 *
 * Not co-located, unusually for this repo, because it guards a file in `docs/`
 * against two sources in `src/` and belongs beside neither.
 *
 * **When this fails, fix whichever side is wrong.** Usually that is the
 * document: the code moved and the prose did not. Never delete the claim to
 * silence the test — restating it correctly is the entire job.
 */

// Vitest runs with the project root as its working directory (vitest.config.ts
// sets no other `root`), and `import.meta.url` is not a file URL under its
// transform, so this is the resolution that actually works here.
const repoRoot = process.cwd();
const plan = readFileSync(join(repoRoot, "docs/design/design-plan.md"), "utf8");
const globalsCss = readFileSync(join(repoRoot, "src/app/globals.css"), "utf8");

/// The `:root` block and the `prefers-color-scheme: dark` override, as
/// token -> value maps.
function cssTokens(): { light: Map<string, string>; dark: Map<string, string> } {
  // `[\s\S]` rather than `.` with the dotAll flag: tsconfig targets below
  // es2018, where `/s/` is a compile error.
  const lightBlock = /:root \{([\s\S]*?)\n\}/.exec(globalsCss);
  const darkBlock =
    /@media \(prefers-color-scheme: dark\) \{\s*:root \{([\s\S]*?)\n {2}\}/.exec(
      globalsCss,
    );

  if (!lightBlock || !darkBlock) {
    throw new Error(
      "Could not find the :root and dark :root blocks in globals.css — this " +
        "parser, not the stylesheet, is probably what needs updating.",
    );
  }

  const parse = (block: string) =>
    new Map(
      [...block.matchAll(/--([a-z-]+):\s*([^;]+);/g)].map(([, name, value]) => [
        name,
        value.trim(),
      ]),
    );

  return { light: parse(lightBlock[1]), dark: parse(darkBlock[1]) };
}

/// Rows of the plan's colour tables: token name, plus the first HSL triple in
/// each of the light and dark cells. Rows whose cells carry no triple are
/// skipped rather than failed — a table may legitimately describe a token in
/// words — so the check only ever fires on a stated value that is wrong.
function documentedTokens(): {
  name: string;
  light: string | null;
  dark: string | null;
}[] {
  const hsl = (cell: string) => /`(\d+ \d+% \d+%)`/.exec(cell)?.[1] ?? null;

  return [...plan.matchAll(/^\|\s*`--([a-z-]+)`\s*\|([^|]*)\|([^|]*)\|/gm)].map(
    ([, name, lightCell, darkCell]) => ({
      name,
      light: hsl(lightCell),
      dark: hsl(darkCell),
    }),
  );
}

describe("design-plan.md colour tables", () => {
  const { light, dark } = cssTokens();
  const documented = documentedTokens();

  it("documents tokens at all, so a broken parser cannot pass silently", () => {
    // Without this, a regex that matches nothing turns every check below into
    // a vacuous pass over an empty list — the classic way a drift guard stops
    // guarding without anyone noticing.
    expect(documented.length).toBeGreaterThanOrEqual(15);
  });

  it.each(documented)("--$name exists in globals.css", ({ name }) => {
    expect(light.has(name)).toBe(true);
  });

  it.each(documented.filter((token) => token.light !== null))(
    "--$name has the light value the plan states",
    ({ name, light: stated }) => {
      expect(light.get(name)).toBe(stated);
    },
  );

  it.each(documented.filter((token) => token.dark !== null))(
    "--$name has the dark value the plan states",
    ({ name, dark: stated }) => {
      expect(dark.get(name)).toBe(stated);
    },
  );
});

describe("design-plan.md geometry claims", () => {
  /// Claims written as `FIELD_ART.trackRadius = 392` or
  /// `DIAMOND_GEOMETRY.height = 520`, including one level of nesting
  /// (`FIELD_ART.mound.r = 18`).
  const claims = [
    ...plan.matchAll(
      /`(FIELD_ART|DIAMOND_GEOMETRY)\.([a-zA-Z]+)(?:\.([a-zA-Z]+))? = (-?\d+(?:\.\d+)?)`/g,
    ),
  ].map(([, object, key, nested, value]) => ({
    label: `${object}.${key}${nested ? `.${nested}` : ""}`,
    object,
    key,
    nested,
    value: Number(value),
  }));

  it("finds the claims it is meant to check", () => {
    expect(claims.length).toBeGreaterThanOrEqual(8);
  });

  it.each(claims)("$label is $value in the code", ({ object, key, nested, value }) => {
    const source: Record<string, unknown> =
      object === "FIELD_ART" ? FIELD_ART : DIAMOND_GEOMETRY;
    const target = nested
      ? (source[key] as Record<string, unknown>)?.[nested]
      : source[key];

    expect(target).toBe(value);
  });
});

describe("design-plan.md utility claims", () => {
  /// Utilities the plan names as part of the texture vocabulary. Each is
  /// declared with Tailwind 4's `@utility`, so its absence means the plan is
  /// describing something that was renamed or never built — the shape the
  /// `<rect>`-pill drift took.
  const utilities = [
    "bg-pinstripe",
    "text-halo",
    "animate-rise",
    "animate-step-up",
  ];

  it.each(utilities)("%s is declared in globals.css and named in the plan", (name) => {
    expect(globalsCss).toContain(`@utility ${name}`);
    expect(plan).toContain(name);
  });

  it.each(["animate-rise", "animate-step-up"])(
    "%s stays gated on prefers-reduced-motion",
    (name) => {
      // design-plan.md §8's hard rule, and #49's AC2. Both utilities carry the
      // gate in their own @utility block, so it is deleted by editing that
      // block — which is silent: the animation simply plays for someone who
      // asked the OS for less motion, and no test that renders markup notices.
      const block = globalsCss.slice(globalsCss.indexOf(`@utility ${name} {`));
      const body = block.slice(0, block.indexOf("\n}\n"));

      expect(body).toContain("prefers-reduced-motion: reduce");
      expect(body).toMatch(/animation:\s*none/);
    },
  );

  it.each(["animate-rise", "animate-step-up"])(
    "%s animates transform only, never opacity",
    (name) => {
      // Motion serialises initial state into the SSR markup and CSS keyframes
      // ship in the stylesheet, so a fade means the lineup is blank until the
      // bundle loads — on a page read at a field on one bar of signal. The
      // step-up has a second reason: a scale would push the banana halo onto
      // the warning track (DIAMOND_GEOMETRY.haloRadius).
      const keyframe = name === "animate-rise" ? "rise" : "step-up";
      const block = globalsCss.slice(
        globalsCss.indexOf(`@keyframes ${keyframe} {`),
      );
      const body = block.slice(0, block.indexOf("\n}\n"));

      expect(body).not.toContain("opacity");
      expect(body).not.toContain("scale");
      expect(body).toContain("translateY");
    },
  );

  it("does not still promise the pill that `text-halo` replaced", () => {
    // The specific stale claim a reviewer caught by hand. Cheap to pin, and it
    // fails loudly if the paragraph is ever reverted wholesale.
    expect(plan).not.toMatch(/pill behind the\s+name\/RSVP tag/);
  });
});
