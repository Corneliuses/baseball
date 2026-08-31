# Pastoral Banana Ball — the design plan

> Old-school pastoral baseball — cream scorecards, chalk lines, mowed grass, felt pennants —
> crashed into by Savannah-Bananas-grade showmanship: one loud banana yellow, chunky slab
> type, tickets, scoreboards, and a little confetti when the coach ships a lineup.

This is the visual overhaul plan for the Youth Baseball Team Manager. It is a **plan, not a
diff** — nothing in `src/` changes until phases start landing — but every spec here was
written against the real code (`globals.css`, `diamond-geometry.ts`, the two chart editors,
the view page) so each phase can be picked up and built without re-deriving anything.

> **Status.** All four phases in §11 have since shipped, in the same pull request as this
> document. Where the two disagreed, this document has been corrected to describe what was
> actually built — it is the plan *and* the as-built record, not a snapshot of the original
> intent. Three things named below were deliberately **not** built: the save-success
> confetti and the RSVP ⚾ micro-pop (§8), and the sign-in field illustration (§7). They
> need a confetti dependency and new client components respectively, and were left for a
> follow-up rather than half-done. §13 explains how this document is kept from drifting
> again.
>
> **Since then (#51).** The coach-flow work built the interaction-feedback layer §8 named
> and the original pass left out: the **save-success tick** (`animate-tick`) and a
> **pending indicator** (`animate-spin-ball`) on every mutating form, plus a bespoke icon
> set (`src/components/icons.tsx`) drawn in the same felt-and-cardstock register as
> `StitchDivider` and the pennant, rather than an icon dependency. The confetti, the RSVP
> pop, and the sign-in illustration are still unbuilt.

![Palette](assets/palette.svg)

---

## 1. Where we are (the honest audit)

The app is structurally excellent and visually mute:

- **Everything is white, off-white, and near-black.** `--background` is pure white,
  `--primary` is a nearly-black brown (`24 100% 10%`), and the four `--baseball-*` tokens
  (green, brown, blue, red) that were clearly meant to carry the theme are defined in
  `globals.css` but almost nowhere used. The theme exists as unpaid potential.
- **The diamond is a hollow polygon.** `DIAMOND_POLYGON` draws four `stroke-border` lines
  on a blank card. No grass, no dirt, no bases, no foul lines. A parent squinting at a
  phone at the field sees a kite, not a ballfield.
- **Every surface is the same surface.** Games, practices, rosters, settings — identical
  white cards with identical gray borders. Nothing signals "this is the fun page" (the
  lineup) vs. "this is the admin page" (settings).
- **Typography is one voice.** Geist everywhere, at polite sizes. Nothing shouts
  "GAME DAY."

What's already *right* and must not be lost: the RSVP visual vocabulary is centralized
(`rsvp-style.ts`), state is never color-alone, the diamond geometry is shared between
viewer and editor, and the dnd-kit/Motion separation is documented and respected. The
redesign works **through** those systems, not around them.

## 2. Design principles

1. **Day at the ballpark, not a SaaS dashboard.** Warm cream paper, real green, real clay.
   The default screen temperature goes from "hospital" to "July."
2. **One banana per screen.** Banana Yellow is the wow — and it only wows if it's scarce.
   Exactly one big yellow element per screen (the CTA, the fence, the drop highlight).
   Two bananas is a fruit stand.
3. **Crunchy = texture + chunk + snap.** Grain of paper (subtle pinstripes, chalk-dash
   borders, stitch dividers), chunky slab display type, and snappy micro-motion. Never
   gradients-and-glassmorphism modern; this is felt-and-cardstock modern.
4. **Sunlight-first.** This app is read outdoors on a phone at 9 AM. Every color pairing
   in this plan clears WCAG AA at its size; state always keeps its text label. Fun that
   hurts legibility loses.
5. **The data model is the personality.** The standing chart, the three RSVP states, the
   "declined fades but never leaves" rule — the design amplifies existing semantics and
   invents zero new ones.

## 3. Color system

The full palette with hex/HSL and usage is in the image above. Token changes land in
`globals.css` (Tailwind 4 `@theme inline` picks them up automatically — no config file):

| Token | Light ("day game") | Dark ("night game") | Notes |
|---|---|---|---|
| `--background` | `42 70% 94%` Vintage Cream | `218 22% 10%` Dugout Charcoal | The single biggest de-black-and-whitening move |
| `--foreground` | `224 42% 20%` Midnight Navy | `45 36% 88%` Chalk | Navy replaces near-black everywhere |
| `--primary` | `131 39% 30%` Field Green | `120 41% 69%` grass-glow | Buttons/links become *green*, not black |
| `--secondary` | `30 40% 87%` clay tint | `219 14% 20%` | Warm secondary surfaces — a tint, not full-strength clay |
| `--accent` | `44 85% 86%` soft banana tint | `45 40% 24%` | Hover/ghost surfaces only — the *quiet* member of the banana family |
| `--banana` | `44 100% 59%` Banana Yellow | `45 100% 65%` Floodlight | The one-per-screen wow. Separate from `--accent` so the loud value can't leak into every hover |
| `--destructive` | `350 85% 42%` Stitch Red | `352 70% 55%` | Also the seam-divider colour |
| `--muted` | `40 32% 86%` | `219 14% 22%` | Quiet surfaces |
| `--muted-foreground` | `30 12% 38%` | `40 15% 68%` | Secondary text, and the declined name *on the field* |
| `--card` | `45 60% 98%` warm white | `220 19% 15%` | Cards stay lighter than the page → depth for free |
| `--border` | `35 30% 80%` warm sand | `219 14% 24%` | Borders get warm, stop disappearing |
| `--ring` | `131 39% 30%` Field Green | `45 100% 65%` Floodlight | Focus rings — yellow at night, where green would vanish |

The field's own palette, consumed by `FieldArt` in both diamonds:

| Token | Light ("day game") | Dark ("night game") | Notes |
|---|---|---|---|
| `--grass` | `104 31% 55%` | `145 31% 20%` | Fair territory |
| `--grass-stripe` | `104 33% 60%` | `145 29% 23%` | Mow rings, a shade up from the grass |
| `--infield-grass` | `104 27% 50%` | `144 30% 17%` | The diamond inside the basepaths |
| `--dirt` | `31 56% 57%` | `26 36% 35%` | Infield, home circle, mound |
| `--track` | `33 62% 60%` | `25 36% 31%` | Warning track |
| `--chalk` | `0 0% 100%` | `45 36% 88%` | Foul lines, basepaths, bases, plate |

And the scoreboard, which is charcoal in **both** themes — a scoreboard is dark; light mode
just means it is daytime around it:

| Token | Light ("day game") | Dark ("night game") | Notes |
|---|---|---|---|
| `--scoreboard` | `218 22% 10%` | `218 22% 8%` | Panel ground |
| `--scoreboard-foreground` | `45 36% 88%` | `45 36% 88%` | Readout text |
| `--scoreboard-accent` | `45 100% 65%` | `45 100% 65%` | The lit figures |

Dark mode is a **night game**: same field under floodlights — charcoal sky, deeper grass,
glowing chalk, and the yellow gets *brighter*, not muted. It already keys off
`prefers-color-scheme`; only the values change.

Contrast spot-checks (must re-verify in review): navy on cream 11.9:1 ✓ · Field Green on
cream 5.6:1 ✓ · navy on Banana Yellow 7.5:1 ✓ · white on Field Green 5.9:1 ✓. Banana
Yellow never carries white text, ever.

## 4. Typography

| Role | Face | How |
|---|---|---|
| Display / page titles / "GAME DAY" | **Alfa Slab One** (Google) | `next/font/google`, exposed as `--font-display`, new `font-display` utility via `@theme` |
| Body / UI | **Geist** (keep) | Already loaded; it's a good body face |
| Scoreboard numbers, dates, jersey numbers | **Geist Mono** (keep, promote) | Tabular numerals for the readiness scoreboard and ticket stubs |

Rules: Alfa Slab only at 20px+, only for headings and hero numbers, often uppercase with
`tracking-wide`. Body stays Geist — slab body text is a ransom note. (If Alfa Slab feels
too heavy in situ, **Graduate** is the collegiate-athletic fallback; decide once, in
Phase 1, on a real phone.)

## 5. Texture vocabulary

Five reusable motifs — each one a tiny component or utility class, built once in Phase 1
and then spent everywhere (see sketches):

![Components](assets/components.svg)

1. **Stitch divider** — `<StitchDivider/>`: two shallow dashed red arcs (SVG), the seam of
   a baseball. Replaces plain `<hr>`/border-t section breaks.
2. **Pinstripes** — a `bg-pinstripe` utility (CSS `repeating-linear-gradient`, 6% navy on
   transparent, 24px period). Header bands and hero surfaces only, never behind body text.
3. **Chalk box** — dashed 2px warm border + slightly-inset fill; the style for every empty
   state and every drop zone. Already half-exists in the editors' dashed borders — this
   names it and warms it up.
4. **Ticket perforation** — vertical dashed rule with punched-notch circles; marks
   anything RSVP-able (game cards, the event page header).
5. **Jersey dot** — navy circle, cream number, Geist Mono. Batting slot numbers, roster
   jersey numbers.

## 6. The diamond finally looks like a diamond ⚾

The centerpiece, and the explicit second half of the brief. Full mockup, day and night:

![Diamond redesign](assets/diamond-field.svg)

### What gets drawn (back to front)

All inside the existing viewBox — `DIAMOND_GEOMETRY.width = 400`,
`DIAMOND_GEOMETRY.height = 520` — behind the existing markers:

1. **Grass wedge** — fills the fair-territory fan from home plate `(200,420)` out along
   both foul lines, clipped a second time to the fence arc
   (`FIELD_ART.parkRadius = 411`) so the park
   ends at the wall instead of running green out to the corners of the box; page-cream
   shows through in foul ground and beyond the fence, keeping the poster-illustration
   feel.
2. **Mow stripes** — concentric rings centred on home, `FIELD_ART.stripeWidth = 40` wide,
   in a slightly lighter green. This is 90% of the "real field" feeling for four circles
   of effort.
3. **Warning track + fence** — a tan arc band at `FIELD_ART.trackRadius = 392`,
   `FIELD_ART.trackWidth = 36` wide, and a fence line at
   `FIELD_ART.fenceRadius = 408`, `FIELD_ART.fenceWidth = 5`. The fence's colour is the
   caller's choice, via `FieldArt`'s `fence` prop, because it is the loudest thing the
   field art paints and therefore the screen's banana to spend: the **positions editor**
   draws it Banana Yellow, and the **lineup view** draws it chalk *for a reader who has a
   kid on the team*, having moved that budget onto the child (§7) — and keeps it yellow for
   everyone else, since §2 asks for exactly one banana and zero is as much a deviation as
   two. Both sit far enough out that the deepest
   outfielder — CENTER_FIELD at y=75, so a marker edge at y=55 — stands on grass rather
   than straddling the track, which `diamond-geometry.test.ts` pins.
4. **Infield dirt** — `M200,444 L316,318 Q200,90 84,318 Z` (a diamond with an arced back
   edge behind second), plus the home-plate circle — big enough that the catcher marker
   at y=452, and the `NoCatcherMarker` disc that replaces it on an allPlay board, sit
   fully *on* dirt rather than hanging off its edge — and the mound at `(200,330)`.
   `FIELD_ART.mound.r = 18`.
5. **Infield grass** — the inset diamond `(200,398) (272,322) (200,246) (128,322)`.
   SS/2B markers at y=252 land on the dirt behind it, exactly where they stand in life.
6. **Chalk** — white foul lines home→`(14,213)`/`(386,213)` and the basepath diamond;
   white bases (rotated squares), home plate pentagon, pitching rubber.

### How it lands in code

- **New `FieldArt` server component** (`src/components/FieldArt.tsx`), pure SVG `<g>`,
  rendered by *both* `view/Diamond.tsx` and `PositionsEditor.tsx`'s `Field` before their
  markers/targets — same sharing rule that already governs `diamond-geometry.ts`, and the
  geometry constants for the art live in that same file so viewer and editor can never
  drift.
- **Nothing moves.** `POSITION_COORDS`, the 520 height, marker radius, name/tag offsets
  all stay. The catcher's name at y+47 stays inside the viewBox (the documented clipping
  trap). In the editor the art is inside the existing absolutely-positioned SVG; the HTML
  drop targets and dnd-kit measurement are untouched.
- **Theme-aware** via the CSS tokens (`fill-[hsl(var(--…))]`-style classes), so the night
  game falls out of dark mode for free.
- **Markers restyle, semantics frozen.** Cream-filled circles; `RSVP_STYLE` keeps its
  three entries and label-plus-color rule — attending gets a thick Field Green ring,
  declined fades, no-response stays dashed. New: a **`text-halo` utility**
  (`paint-order: stroke` with a background-colored stroke) behind the name and RSVP
  tag, because navy text needs backing to stay readable on grass. A halo rather than a
  `<rect>` pill: the pill has to be measured against the text it sits behind, and SVG
  gives no layout pass to measure with, so a fixed-width rect either clips a long name
  or floats around a short one. The `NoCatcherMarker` disc survives unchanged on the
  home-circle dirt.
- **allPlay outfield** markers already arc across exactly this grass
  (`outfieldZoneCoords`); they inherit the halo and need nothing else.

## 7. Screen-by-screen pass

**Sign-in** — first impression, currently a form. Cream page, pinstripe band, slab
wordmark, one banana button ("Email me a sign-in code"), and a tiny flat field illustration
(a cropped reuse of `FieldArt`). Empty-state copy: "The gate's open."

**Enter your code (post-ship addition)** — the second half of sign-in since #60 replaced
the tapped link with a typed code. Same cream card as the screen before it, and it spends
its own banana on the one button ("Sign in"), which is the §2 budget rather than a second
helping: it is a separate screen, reached by a full navigation. The code box is monospaced
and letter-spaced because a code is *read off one screen and typed into another* — the
shape of the characters is the whole job, so this is the one input in the app that does
not use the shared field styling. A rejection keeps what was typed and puts the sentence
in a `StatusBanner` under the box, never a redirect: eight characters retyped on a phone,
mid-code, is where a parent gives up.

**Team chrome (post-ship addition)** — every `/t/[teamId]` view now carries a persistent
`TeamNav` in the team layout: pill tabs on the header band, the active section filled
Field Green, the rest on card stock with a warm border. Deliberately no banana in the
nav — it appears on every screen, and a yellow tab would spend the one-banana budget
everywhere at once. The old wall of outline buttons on the team home was retired in its
favor.

**Team home + `TeamCard`** — cards become **pennant cards**: small felt-green pennant
glyph, slab team name, warm card stock. Archived teams go sepia and desaturated — a
retired jersey — instead of just being text-muted. The badge keeps the word **Archived**:
that is the app's existing vocabulary for this state, shared with the "Archived Teams"
section heading it sits under, the settings Archive/Unarchive controls, and the team
header. A second word for one state is a worse card, however good the flourish.

**Team home's player cards (post-ship addition)** — the parent's own kids stopped being a
log line. Each guarded kid gets a rookie-card hero at the top of the dashboard, and its
card art is **the kid standing on the real field**: `MiniDiamondHero` crops the painted
`FieldArt` board to a wide strip framed on the kid's spot (`POSITION_COORDS`, or the
outfield zone's centre for an allPlay kid with no named position), with the guarded halo
ringing a marker that wears the kid's jersey number in the JerseyDot colours — the same
field, coordinates, halo and step-up the lineup pages use, so the card is a close-up of
the board the parent opens next, never a third diamond that could drift. A kid the chart
puts on no field (a substitute, or a selective team's order-only batter) gets no field
art rather than an invented spot. Below the art: the jersey
number worn big on a `JerseyDot` (the component grew an `lg` cut for exactly this), the
name in slab caps on a pinstripe band — a hero surface, which is where §5 allows
pinstripes — and a marquee strip carrying `chartRole`'s line ("Bats 1st · 2B"), uppercased
by CSS so the DOM keeps the exact sentence readiness and `/view` also print. The hero's
fence is always chalk: the halo and the marquee are one banana treatment of one child,
the way `/view`'s halo, row border and chip are. Cards rise in
with the same staggered `animate-rise` the lineup view announces rows with. **This
screen's banana is the marquee**, and the budget follows the child exactly as it does on
`/view`: a kid the chart seats gets Banana Yellow with a little star; the Substitute and
no-chart-yet states drop to quiet secondary stock, because a banana shouting an empty
state is the wrong kind of loud — and a team-home screen with no guarded kid (a coach, say) simply
has no banana, matching the calm-admin rule below rather than inventing a yellow thing to
spend it on. `isBenched` in `chart-role.ts` is `chartRole`'s own bench condition, exported
so the styling and the sentence cannot disagree.

**Schedule** — games become **ticket stubs** (sketch A): perforated edge, slab opponent
name, Geist Mono date, RSVP tallies on the stub end. Practices print on plain cream stock
with a clay dashed border — games must feel like the main event. Month grid keeps using
`calendar.ts` helpers exclusively (the `APP_TIMEZONE` rule).

**Event page** — RSVP buttons get real weight: Going = Field Green fill, Not going =
stitch-red outline, current selection ringed. One moment of delight: RSVPing "Going" pops
a ⚾ micro-animation (Motion, `prefers-reduced-motion`-gated).

**Lineup view (`/view`)** — the payoff page. The full-field diamond above; batting order
as **dugout roster rows** (sketch B): jersey-dot slot number, name, RSVP pill. The
existing `Reveal` staggers rows in like a lineup being announced. The standing chart
renders even with no game on the schedule (it's standing, not per-game); only the RSVP
tags and legend are per-game and come off when there's nothing to respond to.

This is the one page that knows who is reading it, and **this screen's banana is the
reader's own kid** — the fence drops to chalk to pay for it. The budget follows the child,
so a reader with none on this team keeps the yellow fence and a page identical to the one
they saw before. A guarded
player's diamond marker gets a Banana Yellow halo at `DIAMOND_GEOMETRY.haloRadius = 25`
and one `animate-step-up` — shrinking, and eventually dropped, in a crowded allPlay outfield
where a constant ring would reach the next kid's marker (`zoneHaloRadius`); the bold name
and the screen-reader text carry it there; their batting and bench rows get a banana border, bold name and
a `Your player` chip. Colour is never the only carrier: the chip is text, and the diamond's
`sr-only` mirror appends `(your player)` in words. Markers carry first names only, so any
first name two rostered players share gets a last initial — on **both**, never one, and on
**both boards**: the viewer and the positions editor share `buildDiamondNames`. A
viewer guarding nobody sees the page exactly as it was.

The **bench** is its own card, below the diamond, holding only the players this page would
otherwise render nowhere — non-allPlay teams, and only kids in neither column. An allPlay
team's unplaced players are the outfield zone two inches above, and a kid batting third
without a fielding spot is already in the order; calling either group benched would
misdescribe them. The card — and every other surface a person reads — says **Substitutes**,
never "Bench": the softer word, chosen for the family reading it, and shared with team
home's marquee and the positions editor's zone so the state keeps one name. The code still
calls the state bench (`isBenched`, `benchLabel`, the local variables); only the printed
word softened.

**Chart editors** — restraint zone; dnd-kit owns every dragged element (the AGENTS.md
rule), so flair goes only into *static* styling: field art behind the position targets,
chalk-box drop zones, warmer chips with jersey dots. The drop-target hover state
(`isOver`) becomes a Banana Yellow chalk glow — that screen's one banana. **No Motion
anywhere near a chip.** Save button: "Post the lineup"; success confirmation (after
dnd-kit is done and the action returns) may confetti, once, briefly.

**Readiness** — becomes **The Scoreboard** (sketch D): charcoal panel even in light mode,
floodlight-yellow Geist Mono figures, uncovered positions in red. It's read-only math
(`readiness.ts` stays pure); this is purely a costume change.

**Roster/members/directory/settings** — calm pages: warm tokens, stitch dividers, jersey
dots on roster rows, no bananas. Admin should feel tidy, not loud.

**Empty states everywhere** — chalk box + one line of voice: "Nobody on the roster yet.
Every dynasty starts somewhere." Copy stays informative first, funny second; parents skim.

## 8. Motion (the Savannah swagger, safely)

Via the existing `LazyMotion`/`m` setup only:

- Page-level: the existing `Reveal` rise on card mount; lineup rows stagger in at ~40ms
  intervals via the `animate-rise` utility, an inline `animation-delay` per row.
- `animate-step-up`: the guarded marker rises once, on load, and settles — on the lineup
  view's diamond and on team home's `MiniDiamondHero`, which draws the same haloed marker.
  CSS too, and translate-only for a second reason on top of the one below — the banana halo
  already sits 2.5px inside the warning track, so a scale would push it onto the tan at the
  animation's peak and lose exactly the contrast the highlight is made of. It goes on an
  *inner* `<g>`, never the one carrying `transform="translate(x y)"`: a CSS transform
  overrides an SVG transform attribute, and animating that element drops the marker at the
  origin. Both suites pin that placement, because the failure is silent — the marker simply
  renders at the field's origin, with no error.
- `animate-rise` is CSS, not Motion, and **translate-only** — no opacity, for the same
  reason `Reveal` has none: Motion serialises `initial` into the server-rendered markup,
  so a fade ships `opacity: 0` in the HTML and the lineup stays blank until the bundle
  hydrates. At a field on one bar of signal the content has to be legible from the raw
  HTML, with the animation as polish on top.
- `animate-tick`: the **save-success tick**, built in #51. `StatusBanner` draws
  `CheckIcon`'s single polyline by sweeping `stroke-dashoffset` along it, so a confirmation
  is *written* rather than appearing. This is the one animation here allowed to touch a
  property other than `transform`, and the exception has a reason: nothing is hidden by it.
  The tick is decoration inside a `role="status"` region whose text is the actual message,
  so a tick that never draws — no CSS, reduced motion, an old engine — costs a reader
  nothing. Keep the icon one path: two would draw both halves at once.
- `animate-spin-ball`: the **pending indicator**, built in #51. `BaseballSpinner` rotates a
  drawn baseball inside `SubmitButton` while a submission is in flight. It is the one
  looping animation in the app, and it is legal because the loop is bounded by the thing it
  reports — `useFormStatus` unmounts it the moment the action settles. Under reduced motion
  the ball holds still and the button's swapped label ("Sending…") carries the news alone,
  which is why that label is required copy and not decoration.
- Micro: RSVP pop and pennant hover tilt (±2°). **Not built** — see the status note at the
  top.
- Celebration: one confetti burst (green/yellow/cream, ~1.2s) on chart save success only.
  **Not built** — needs a dependency, deferred rather than half-done.
- Hard rules: nothing dnd-kit touches gets Motion or `animate-rise` (documented
  collision); every non-essential animation respects `prefers-reduced-motion`, which
  `animate-rise` does in its own `@utility` block; nothing loops forever.

## 9. Voice

Current copy is fine and stays fine; it gets one seasoning pass. Headlines may play
("Game day," "The gate's open"); data and instructions never do. RSVP labels
Going / Not going / No response are **frozen** — they're shared vocabulary across two
pages and a legend, and clarity outranks comedy on the thing parents check from a car.

## 10. Accessibility & field-readability checklist

- AA contrast for all text; large-text-AA minimum for text-on-illustration (with pill
  backing on the diamond).
- State = color **+ label** always (already policy in `rsvp-style.ts`; extends to tickets
  and the scoreboard).
- The diamond keeps its `aria-hidden` + `sr-only` list pattern; `FieldArt` is decoration
  and adds no announced content.
- Focus rings: 2px Banana Yellow outer ring on navy/green, navy on yellow — visible in
  sunlight.
- Touch targets ≥44px in editors and RSVP buttons (drag activation constraints already
  tuned in `drag-activation.ts` — don't fight them).

## 11. Build phases

Each phase ships independently and `pnpm check` gates each one.

| Phase | What | Where | Size |
|---|---|---|---|
| **1. Repaint** | New tokens light+dark, Alfa Slab via `next/font`, `bg-pinstripe` utility, `StitchDivider`, chalk-box classes, jersey dot | `globals.css`, `layout.tsx`, `src/components/` | S–M |
| **2. The field** | `FieldArt` + geometry constants, wire into `Diamond.tsx` and `PositionsEditor`, marker pills | `diamond-geometry.ts`, `FieldArt.tsx`, both diamonds | M |
| **3. Paper goods** | Ticket-stub game cards, pennant team cards, dugout batting rows, scoreboard readiness | schedule, team home, view, readiness pages | M–L |
| **4. Showtime** | Reveal/stagger polish, RSVP pop, save confetti, empty-state voice pass | scattered, small | S |

Phase 1 alone already answers "horribly black and white." Phases are ordered by
wow-per-effort.

## 12. Guardrails (read before building any phase)

- dnd-kit and Motion never touch the same element. Editors get static flair only.
- `POSITION_LABELS` is the only source of position abbreviations.
- Diamond geometry: check the lowest marker's y+47 against the viewBox before moving
  anything; viewer and editor share every drawn coordinate through `diamond-geometry.ts`.
- `RSVP_STYLE` stays the single RSVP vocabulary; three states, label + color, declined
  fades the name and never the slot.
- No per-game anything sneaks in via design (no "today's lineup" variants — the chart is
  standing; Decision 16).
- Dates through `calendar.ts` helpers only.
- One banana per screen.

## 13. Keeping this document honest

This document ships in the same repository as the code it describes, which makes it a
second source of truth — and a second source of truth rots. In this document's first week
it rotted four times: the colour table named one `--accent` where the code had split
`--accent` and `--banana`; `--secondary` and `--border` carried values that were never
shipped; §6 specified a `<rect>` pill that was replaced by `text-halo` during
implementation; and the field radii were the ones from before the visual-review fixes
moved them. Three were caught by a reviewer reading the diff. That is expensive attention
to spend on stale numbers.

So `src/design-plan-drift.test.ts` now checks this file against the code on every
`pnpm check`, and the sections above are written in a shape it can read:

- **Colour tables.** A row of the form ``| `--token` | `H S% L%` … | `H S% L%` … |`` is a
  claim. The test asserts the token exists in `globals.css` and that both values match.
  Describing a token in words instead of an HSL triple is allowed — the cell is simply
  not checked — so the guard only ever fires on a stated value that is *wrong*.
- **Geometry.** Numbers are written as ``FIELD_ART.trackRadius = 392`` or
  ``DIAMOND_GEOMETRY.height = 520``, one level of nesting allowed
  (``FIELD_ART.mound.r = 18``). The test reads every such claim and compares it to the
  real constant. Prose may still say "roughly a third of the way out" — only the
  `Object.key = number` form is binding.
- **Utilities.** Utilities named as part of the texture vocabulary must exist as
  `@utility` blocks in `globals.css`.

Everything else — rationale, principles, the screen-by-screen pass, voice — stays
free-form on purpose. The goal is to catch stale *facts*, not to turn a design document
into a schema.

**When the test fails, fix whichever side is wrong** — usually this document, because the
code moved and the prose did not. Deleting the claim to quiet the test throws away the
only thing keeping the two in step.
