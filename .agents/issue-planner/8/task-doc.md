# Task Doc — Phase 8: View page — read-only chart with RSVP state (#8)

## Prerequisites

- [x] #7 (RSVP with tri-state semantics) — closed; `src/lib/rsvp.ts`, `src/lib/rsvps.ts`,
      and `nextGame` in `src/lib/schedule.ts` all exist as this plan assumes
- [ ] Nothing else blocks; #5 may land in parallel without conflict (different files)

## Phase 1: Data & View Model (pure logic first)

- [ ] Create `src/lib/chart-view.ts`: define the entry input type (`playerId`,
      `playerName`, `jerseyNumber`, `battingOrder`, `position`) and
      `buildChartView(entries, rsvpStates)` returning `{ lineup, byPosition, hasChart }`
      — lineup sorted ascending by `battingOrder`, `byPosition` a
      `Map<Position, entry>`, each entry carrying its `RsvpState`. Do **not** import
      `readiness.ts`'s `ChartEntry` (see design-doc Decision 2). Module docstring states
      the rule: RSVP state decorates, never filters.
- [ ] Write `src/lib/chart-view.test.ts`: ordering; position map; `hasChart` over empty /
      partial / full charts; the invariant test that varying RSVP states changes labels
      only, never membership or order; empty roster.
- [ ] Add `getChart(teamId)` to `src/lib/roster.ts` returning `chart-view.ts`'s entry
      type — `select` on `battingOrder`, `position`, `jerseyNumber`, `player.{id,name}`,
      `where: { teamId }`. Errors propagate (no try/catch) — document why in its
      docstring per the `nextGame` argument.

## Phase 2: Page & Components

- [ ] Create `src/app/t/[teamId]/view/Reveal.tsx` — `"use client"`, `m.div` from
      `motion/react` with a fade + small y-translate on mount. No `LazyMotion` here (the
      root layout provides it) and **no `layout` prop** (comment the dnd-kit rule).
- [ ] Create `src/app/t/[teamId]/view/Diamond.tsx` — server component rendering the
      inline-SVG diamond; nine markers from `ALL_POSITIONS`, labels via
      `POSITION_LABELS`, player name + jersey under each label, open-slot treatment for
      unassigned positions, per-state styling (attending default / declined greyed +
      "Not going" / no-response full-strength + "No response").
- [ ] Create `src/app/t/[teamId]/view/page.tsx` — `requireTeamAccess(teamId,
      { intent: "read" })` with the standard `TeamAccessError → notFound()` guard;
      fetch `nextGame`, then `getChart` + `listEventRsvps` in a `Promise.all`;
      `buildRsvpStateMap` → `buildChartView`; render the no-game and no-chart empty
      states, else the next-game header, `Diamond`, ordered lineup `<ol>`, and legend
      inside `Reveal`. Stack on phones, side-by-side at `lg:`. `export const metadata`
      title like the sibling pages.
- [ ] Add the "Lineup" button to `src/app/t/[teamId]/page.tsx`'s button row, linking to
      `/t/${teamId}/view`, visible to all roles.

## Phase 3: Page Tests

- [ ] Write `src/app/t/[teamId]/view/page.test.tsx` following
      `src/app/t/[teamId]/schedule/page.test.tsx`'s pattern (`vi.mock` of
      `@/lib/team-access`, `@/lib/roster`, `@/lib/rsvps`, `@/lib/schedule`,
      `next/navigation`; `renderToStaticMarkup`). Mock `motion/react` if the client
      `Reveal` breaks static rendering. Cover: parent access; `notFound()` on
      `TeamAccessError`; no-game empty state; no-chart empty state; declined player
      greyed but present in their slot and batting position; no-response rendered
      distinctly from declined; all nine `POSITION_LABELS` present when the chart is
      full.

## Pre-Commit Gate

Per AGENTS.md `## Commands`:

- [ ] `pnpm check` (lint → typecheck → test) ✅
- [ ] `pnpm build` ✅

## Files Modified / Created

| File | Change |
|---|---|
| `src/lib/chart-view.ts` | **New** — pure view-model builder |
| `src/lib/chart-view.test.ts` | **New** — co-located tests |
| `src/lib/roster.ts` | Add read-only `getChart(teamId)` |
| `src/app/t/[teamId]/view/page.tsx` | **New** — the view page |
| `src/app/t/[teamId]/view/page.test.tsx` | **New** — page tests |
| `src/app/t/[teamId]/view/Diamond.tsx` | **New** — SVG diamond (server) |
| `src/app/t/[teamId]/view/Reveal.tsx` | **New** — Motion reveal (client) |
| `src/app/t/[teamId]/page.tsx` | Add "Lineup" nav button |
