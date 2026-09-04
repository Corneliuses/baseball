import type { RsvpState } from "@/lib/rsvp";

/// The email half of "Pastoral Banana Ball" (`docs/design/design-plan.md`).
///
/// Every screen in the app is cream paper, field green, midnight navy and one
/// rationed Banana Yellow. The emails were plain white sans-serif with a
/// near-black button, which is a different product arriving in the family's
/// inbox — the one surface a parent sees *before* they ever open the app. This
/// module is the shared vocabulary that fixes that, and `EmailLayout` /
/// `EmailKit` spend it.
///
/// **Everything here is frozen hex from the LIGHT theme**, the same trade
/// `app/manifest.ts` makes and for a stricter version of the same reason: a
/// mail client is not a browser. There is no cascade to read `hsl(var(--x))`
/// from, `@media (prefers-color-scheme: dark)` is dropped by most clients that
/// matter, and Tailwind class names never arrive at all — so an email is styled
/// with inline hex or it is styled by Gmail. `brand.test.ts` redoes the
/// HSL-to-hex conversion out of `globals.css` and fails when a token moves,
/// because a copied palette that nothing checks is a palette that rots.
///
/// Three deliberate omissions, each of which looks like something missing:
///
///   - **No images.** Not the crest, not the field art, not a spacer. Images
///     are off by default in most inboxes, so a header that carries the brand
///     in a PNG is a header that is blank for half the roster — and every
///     remote fetch reports back when a family opened their mail. The identity
///     is carried by type, colour and rules, all of which render with images
///     blocked.
///   - **No web font.** `--font-display` is Alfa Slab One, loaded by
///     `next/font` for the app; an email would have to pull it from a third
///     party at open time, which is the same beacon problem in a smaller
///     package. `EMAIL_FONT.display` is a slab *stack* instead — Rockwell and
///     friends where they exist, Georgia everywhere else — so the display
///     voice degrades to a serif rather than to Arial.
///   - **No dark variant, and no pretence that one can be asked for.** The
///     shell declares `color-scheme: light`, which Apple Mail honours and the
///     Gmail and Outlook apps ignore: those two recolour on their own,
///     darkening light grounds and lifting dark text, and no stylesheet
///     reaches Gmail at all. So the palette is designed to *survive* that pass
///     rather than to prevent it. Dark grounds stay dark and saturated
///     colours are left alone, which is why the call to action is navy ground
///     with banana lettering (see `EmailKit`'s `BananaButton`) and not the
///     other way round — a banana ground with navy text is exactly the pairing
///     Gmail's pass turns into light text on yellow, the one combination
///     design-plan.md §3 forbids outright. What a dark-mode phone gets is a
///     night-game version of the same card, not an inversion of the CTA.
export const EMAIL_COLOR = {
  /// `--background` — the cream page stock the whole message sits on.
  page: "#FAF4E5",
  /// `--card` — warm white, a shade lighter than the page, which is where the
  /// depth comes from without a single shadow.
  card: "#FDFBF7",
  /// `--foreground` — Midnight Navy. 13.9:1 on card stock.
  ink: "#1E2948",
  /// `--muted-foreground` — secondary lines and the footer. 5.8:1 on card.
  quietInk: "#6D6155",
  /// `--border` — warm sand. Borders that stop disappearing.
  border: "#DBCFBD",
  /// `--secondary` — the clay tint used for the ticket stub's stock.
  stub: "#EBDED1",
  /// `--primary` — Field Green. Links, rules, and the "attending" state.
  green: "#2F6A3A",
  /// `--banana` — the one-per-email wow, spent as lettering and keyline on a
  /// navy ground (9.2:1). Never carries white text; see the test that pins it.
  banana: "#FFC72E",
  /// `--destructive` — Stitch Red. The seam divider and the "not going" state.
  stitch: "#C6102E",
  /// `--scoreboard` — charcoal in both themes, because a scoreboard is dark
  /// and light mode only means it is daytime around it.
  scoreboard: "#14181F",
  /// `--scoreboard-foreground` — chalk readout text.
  onScoreboard: "#EBE6D5",
  /// `--scoreboard-accent` — the lit figures. Floodlight yellow, 12.4:1 on the
  /// panel: this is the banana family after dark, and it is what the sign-in
  /// code is set in.
  floodlight: "#FFD24D",
} as const;

/// Font stacks, not families. Nothing is loaded, so each of these has to look
/// deliberate on a phone that has none of the first choices.
export const EMAIL_FONT = {
  /// Headlines and hero numbers only, at 20px+ — design-plan.md §4's rule,
  /// which holds here for the same reason it holds in the app: slab body text
  /// is a ransom note.
  display:
    'Rockwell, "Rockwell Nova", "Roboto Slab", "DejaVu Serif", Georgia, "Times New Roman", serif',
  /// Geist is not installable in mail, so body text is the recipient's own
  /// system sans — the face their inbox already reads in.
  body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  /// Dates, times, jersey numbers and the sign-in code. Tabular by habit and
  /// unmistakably a readout.
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
} as const;

/// The three RSVP states in email, keyed to the same colours
/// `src/components/rsvp-style.ts` gives them on screen — green for going, seam
/// red for not going, muted for the answer that has not arrived.
///
/// Colour is never the only carrier here either: every place this is spent
/// prints the family's own sentence beside it (`rsvpReminderLabel`), so a
/// colour-blind parent, a plain-text client and a forwarded screenshot all
/// still say who is coming. This is a small map rather than an import of
/// `RSVP_STYLE` on purpose — that module is Tailwind class names, which mean
/// nothing in an inbox.
export const EMAIL_RSVP_COLOR: Record<RsvpState, string> = {
  attending: EMAIL_COLOR.green,
  declined: EMAIL_COLOR.stitch,
  "no-response": EMAIL_COLOR.quietInk,
};

/// The card's outer width. 600px is the width every mail client has agreed on
/// for two decades; `Container`'s own default (37.5em) is the same number in
/// ems, which a client with a resized base font gets wrong.
export const EMAIL_WIDTH = "600px";
