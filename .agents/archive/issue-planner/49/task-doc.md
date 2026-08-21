# Task Doc — Lineup view: highlight the signed-in parent's kids with an animation (#49)

## Prerequisites

- [x] No blocking issues. No migration, no new dependency, no environment variable.
- [ ] `pnpm install && pnpm db:generate` (the generated client is gitignored, so a fresh
      clone will not typecheck without it).
- [ ] Read `docs/design/design-plan.md` §2 (one banana per screen), §6.3 (the fence),
      §8 (motion rules) — Phase 3 edits all three.

---

## Phase 1 — Domain & shared vocabulary (pure, DB-free)

- [ ] In `src/lib/chart-view.ts`, add `diamondName: string` to the `ChartViewPlayer` type,
      documenting that it is the *field* name (first name, or `First L.` on a collision) and
      that `playerName` remains the full name for lists and the `sr-only` mirror.
- [ ] In `src/lib/chart-view.ts`, add a private `buildDiamondNames(players)` helper: split
      each `playerName` on whitespace, count first-name occurrences across **all** rostered
      players (not just the seated ones), and emit `First L.` for every player whose first
      name is shared. Fall back to the whole string for a single-token name, matching the
      current `shortName` behaviour.
- [ ] Wire it into `buildChartView` so `lineup`, `byPosition` and `unassigned` all carry
      `diamondName`.
- [ ] Add tests to `src/lib/chart-view.test.ts`: unique first name → first name only;
      two-way collision → `First L.` on **both**; three-way collision; single-token name;
      same first name *and* same last initial → both identical (the accepted tie-break);
      `playerName` unchanged throughout.
- [ ] Create `src/components/guarded-style.ts` exporting `YOUR_PLAYER_TEXT` and a
      `GUARDED_STYLE` object (`haloClassName`, `markerNameClassName`, `rowClassName`,
      `badgeClassName`). Head it with a docblock in the shape of `rsvp-style.ts`'s: one
      vocabulary, three consumers, colour is never the only carrier.
- [ ] Create `src/components/guarded-style.test.ts` — every token non-empty; the halo class
      uses the banana token; the badge text is exactly `Your player`.
- [ ] In `src/components/diamond-geometry.ts`, add `haloRadius: 25` to `DIAMOND_GEOMETRY`
      with a comment recording the two constraints it satisfies (nearest-neighbour gap of
      64px between SHORTSTOP and SECOND_BASE; the warning-track inner edge at 374 vs
      CENTER_FIELD's 345px reach from the home circle).

## Phase 2 — The field: FieldArt, the utility, and the Diamond

- [ ] In `src/components/FieldArt.tsx`, add `fence?: "banana" | "chalk"` defaulting to
      `"banana"`, and swap the fence `<circle>`'s class between `stroke-banana` and
      `stroke-chalk`. Update the component's docblock: it no longer unconditionally paints
      the banana, and the caller now chooses where the screen spends it.
- [ ] Update the `FIELD_ART.fenceRadius` comment in `src/components/diamond-geometry.ts` —
      it currently asserts "The fence is drawn in banana yellow — that screen's one banana",
      which stops being true for `/view`.
- [ ] Add fence-prop tests (new `src/components/FieldArt.test.tsx`, or fold into the two
      diamond suites): `"banana"` emits `stroke-banana`; `"chalk"` emits `stroke-chalk` and
      **no** `stroke-banana`.
- [ ] In `src/app/globals.css`, add `@utility animate-step-up` plus `@keyframes step-up` —
      translate-only, ~0.4s, `both`, non-looping, with its own
      `@media (prefers-reduced-motion: reduce) { animation: none; }` block. Copy
      `animate-rise`'s comment shape and restate the translate-only reasoning.
- [ ] In `src/app/t/[teamId]/view/Diamond.tsx`, delete the private `shortName` helper and
      read `player.diamondName` instead.
- [ ] Add `guardedPlayerIds?: ReadonlySet<string>` to `Diamond`'s props (default an empty
      set) and thread an `isGuarded` boolean into `Marker`.
- [ ] In `Marker`, when `isGuarded`: render a halo `<circle r={DIAMOND_GEOMETRY.haloRadius}>`
      behind the marker with `GUARDED_STYLE.haloClassName`, and wrap the marker's contents in
      an **inner** `<g className="animate-step-up">`. Leave the outer
      `<g transform={translate(x y)}>` untouched — a CSS transform on that element overrides
      the attribute and teleports the marker to the origin.
- [ ] Pass `fence="chalk"` to `<FieldArt />` in `Diamond.tsx` and note Decision 1 in the
      adjacent comment.
- [ ] In `Diamond`'s `sr-only` `<ul>`, append ` (your player)` to a guarded player's entry —
      in the position list **and** in the allPlay outfield join (AC4).
- [ ] Add geometry assertions to `src/app/t/[teamId]/view/Diamond.test.tsx`: the halo clears
      every neighbouring marker; the halo stays inside the viewBox on all four sides; the
      CENTER_FIELD halo's outer edge stays inside `FIELD_ART.trackRadius - trackWidth/2`.

## Phase 3 — The page, the bench, and the design plan

- [ ] In `src/app/t/[teamId]/view/page.tsx`, capture `userId` from `requireTeamAccess`
      (currently discarded at line ~46) — mirror the destructuring in
      `schedule/[eventId]/page.tsx:60`.
- [ ] Add `guardedRosteredPlayerIds(teamId, userId)` to the existing `Promise.all`, **not**
      wrapped in try/catch — same stance as `nextGame`, documented in a comment.
- [ ] Pass `guardedPlayerIds` to `<Diamond />`.
- [ ] In the batting-order `<ol>`, when the row's `playerId` is guarded: apply
      `GUARDED_STYLE.rowClassName` alongside the existing classes and render a
      `YOUR_PLAYER_TEXT` badge. Keep the existing `animate-rise` and its stagger delay
      untouched — no second animation (Decision 4).
- [ ] Add a "Bench" `<Card>` after the Positions/Batting-order row, rendered only when
      `!allPlay && chart.unassigned.length > 0`. List each player (name, jersey, RSVP tag
      when `showRsvp`), guarded rows marked with the same `rowClassName` + badge. Reuse the
      batting row's markup rather than inventing a second row style.
- [ ] Extend `src/app/t/[teamId]/view/page.test.tsx`:
  - [ ] Add a `guardedRosteredPlayerIds` mock to the existing `@/lib/rsvps` mock, defaulting
        to `new Set()` in `beforeEach` — copy `schedule/[eventId]/page.test.tsx:78`.
  - [ ] `it("calls guardedRosteredPlayerIds with the signed-in user and this team")`.
  - [ ] `it("halos the viewer's own kid on the diamond")`.
  - [ ] `it("marks the viewer's own kid in the batting order")`.
  - [ ] `it("announces the viewer's players in the sr-only mirror")` (AC4).
  - [ ] `it("changes nothing for a viewer guarding no players on this team")` — AC5, assert
        the rendered HTML contains neither the halo class nor the badge text.
  - [ ] `it("gives two players sharing a first name last initials on the diamond")` (AC3).
  - [ ] `it("lists a non-allPlay team's unassigned players on a bench card")` (AC6).
  - [ ] `it("draws no bench card for an allPlay team — those players are the outfield")`.
  - [ ] `it("draws a chalk fence on the view page, keeping the banana for the kid")`.
- [ ] Update `docs/design/design-plan.md`:
  - [ ] **§6.3** — the fence is banana in the *editor*; on `/view` it is chalk and the banana
        belongs to the guarded marker. Keep the `FIELD_ART.… = n` claim lines intact and in
        their existing parseable form — `design-plan-drift.test.ts` reads them.
  - [ ] **§7, Lineup view** — record the guarded-player highlight, the last-initial rule, and
        the bench list.
  - [ ] **§8, Motion** — add `animate-step-up` next to `animate-rise`, with the translate-only
        and reduced-motion rules restated.
- [ ] In `src/design-plan-drift.test.ts`, add `"animate-step-up"` to the `utilities` array so
      the new utility cannot drift out of the plan.
- [ ] Add a bullet to `AGENTS.md`'s Gotchas: `/view` and the positions editor now paint
      *different* fences, and `FieldArt`'s `fence` prop is where a screen decides how it
      spends its one banana.

---

## Pre-Commit Gate

Per `AGENTS.md` → `## Commands`. `pnpm check` is lint → typecheck → test and needs no
database; `pnpm build` does need `DATABASE_URL`, so use `pnpm exec next build` on a bare
checkout.

- [ ] `pnpm lint` ✅
- [ ] `pnpm typecheck` ✅
- [ ] `pnpm test` ✅
- [ ] `pnpm check` (all three) ✅
- [ ] Manual pass, since three of the five ACs are visual and none of them is fully provable
      by assertion:
  - [ ] Sighted check at phone width that the halo reads instantly on the green field.
  - [ ] Toggle OS "reduce motion" and confirm the marker does not move (AC2).
  - [ ] Disable JavaScript and confirm the halo, the badge, the bench and every name are
        still present in the raw HTML (AC2).

## Files Modified / Created

| File | Change |
|---|---|
| `src/lib/chart-view.ts` | Add `diamondName` to `ChartViewPlayer`; compute it in `buildChartView` with duplicate-first-name disambiguation |
| `src/lib/chart-view.test.ts` | Tests for `diamondName` collision, three-way, single-token, tie-break |
| `src/components/guarded-style.ts` | **New** — the one "your player" vocabulary for three consumers |
| `src/components/guarded-style.test.ts` | **New** — token and label assertions |
| `src/components/diamond-geometry.ts` | Add `DIAMOND_GEOMETRY.haloRadius`; correct the fence comment |
| `src/components/FieldArt.tsx` | New `fence` prop; docblock update |
| `src/components/FieldArt.test.tsx` | **New** — fence-prop rendering (or folded into the diamond suites) |
| `src/app/globals.css` | New `@utility animate-step-up` + `@keyframes step-up` |
| `src/app/t/[teamId]/view/Diamond.tsx` | `guardedPlayerIds` prop; halo + inner-`<g>` animation; `diamondName`; `fence="chalk"`; `sr-only` suffix; drop `shortName` |
| `src/app/t/[teamId]/view/Diamond.test.tsx` | Halo geometry assertions |
| `src/app/t/[teamId]/view/page.tsx` | Capture `userId`; load guarded ids; guarded batting rows; new bench card |
| `src/app/t/[teamId]/view/page.test.tsx` | Nine new cases across AC1–AC6 plus the mock default |
| `docs/design/design-plan.md` | §6.3, §7, §8 |
| `src/design-plan-drift.test.ts` | Pin `animate-step-up` |
| `AGENTS.md` | Gotcha: the two diamonds now paint different fences |
