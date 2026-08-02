# Task Doc — Phase 11: Positions diamond editor (dnd-kit droppables) (#11)

## Prerequisites

- [x] #9 (validation gate) closed — confirmed; #10 merged (`4094318`, `3d1ec5e`)
- [x] Design decisions confirmed with owner (route, allPlay storage, view-page scope) —
      see design-doc.md Key Decisions

## Phase 1: Pure logic — `src/lib/chart.ts`

- [ ] Add `PositionsDraft` type, `droppablePositions`, `buildPositionsDraft`,
      `placeAtPosition` (swap semantics), `unassignPosition`, `samePositions`,
      `POSITION_POOL_ID`, `resolvePositionDrop`, `nextDroppableId` to `src/lib/chart.ts`
- [ ] Add `validatePositions` (reasons: `unknown-entry`, `duplicate-entry`,
      `invalid-position`; partial charts valid) to `src/lib/chart.ts`
- [ ] Extend `chartWriteFailure` in `src/lib/chart.ts`: P2002 with `position` in
      `meta.target` → `"position-conflict"`; widen `ChartWriteFailure`
- [ ] Write unit tests for all of the above in `src/lib/chart.test.ts` — include the
      stale-named-outfield-under-allPlay draft case and the full swap matrix
      (pool→empty, pool→occupied, position→empty, position→occupied, self-drop, invalid)

## Phase 2: Data layer — `src/lib/roster.ts`

- [ ] Add `savePositions(teamId, assignments)` two-phase array-form `$transaction`,
      mirroring `saveBattingOrder` (including `teamId` in every phase-2 where clause)
- [ ] Update the module docstring line "`position` is still never written here and
      belongs to #11" in `src/lib/roster.ts`
- [ ] Mirror whatever coverage `saveBattingOrder` has in `src/lib/roster.test.ts`

## Phase 3: Editor UI — `src/app/t/[teamId]/chart/`

- [ ] Extract `MOUSE_ACTIVATION` / `TOUCH_ACTIVATION` constants to
      `src/app/t/[teamId]/chart/drag-activation.ts`; refactor
      `chart/BattingOrderEditor.tsx` to import them (keep its comment about Decision 10)
- [ ] Move `POSITION_COORDS` + `DIAMOND_GEOMETRY` from `view/Diamond.tsx` to
      `src/components/diamond-geometry.ts`; update `view/Diamond.tsx` and
      `view/Diamond.test.tsx` imports
- [ ] Create `chart/positions/PositionsEditor.tsx`: DndContext with shared activation
      constants; absolutely positioned HTML droppables at percentage coords over the SVG
      diamond outline; Outfield/Bench zone per `allPlay`; `pointerWithin` +
      `rectIntersection` collision; KeyboardSensor with `nextDroppableId`-backed
      coordinateGetter; Cancel/Save gated on `samePositions`; **no Motion imports**
- [ ] Create `chart/positions/actions.ts`: `savePositionsAction` — Zod-parse the
      assignments record, `requireTeamAccess(write, COACH)`, re-load team + chart,
      `validatePositions`, `savePositions`, translate failures, `revalidatePath` for
      chart, chart/positions, and view, redirect `?saved=1`
- [ ] Create `chart/positions/page.tsx`: access gate → `notFound()`, archived card,
      empty-roster card, `ERROR_MESSAGES`, `sortRoster` ordering, key-remount of the
      editor, links to `/t/[teamId]/chart` and `/t/[teamId]/view`
- [ ] Add a "Positions" button/link on `chart/page.tsx` next to "View chart"
- [ ] Write component tests in `chart/positions/PositionsEditor.test.tsx` (6 vs 9
      droppables by allPlay, zone label, dirty gating, hidden-input payload)
- [ ] Write page tests in `chart/positions/page.test.tsx` and action tests in
      `chart/positions/actions.test.ts`, mirroring the #10 equivalents

## Phase 4: View page — allPlay outfield rendering

- [ ] Extend `buildChartView` in `src/lib/chart-view.ts` with `unassigned:
      ChartViewPlayer[]`; tests in `src/lib/chart-view.test.ts`
- [ ] Update `view/Diamond.tsx`: accept `allPlay` + `outfieldPool`; under allPlay render
      occupied-only LF/CF/RF (never "Open") plus a pool cluster in the outfield arc and an
      sr-only "Outfield" entry; verify no marker text clips (geometry invariants)
- [ ] Pass `team.allPlay` and the pool through `view/page.tsx`
- [ ] Update `view/Diamond.test.tsx` and `view/page.test.tsx`

## Phase 5: Verification

- [ ] Manual: `pnpm dev`, phone-sized viewport — time the full flow (batting order on
      `/chart`, positions on `/chart/positions`) against the brief's **under-5-minutes**
      target; record the result in the PR description
- [ ] Manual: verify scroll-vs-drag feel on the diamond (TouchSensor delay working)

## Pre-Commit Gate

Per AGENTS.md `## Commands`:

- [ ] `pnpm check` (lint → typecheck → test) ✅
- [ ] `pnpm build` ✅ (requires `DATABASE_URL`; use `pnpm exec next build` if unavailable
      and say so in the PR)

## Files Modified / Created

| File | Change |
|---|---|
| `src/lib/chart.ts` | Add positions draft/validation logic + failure translation |
| `src/lib/chart.test.ts` | Tests for all new pure logic |
| `src/lib/roster.ts` | Add `savePositions`; docstring update |
| `src/lib/roster.test.ts` | Coverage mirroring `saveBattingOrder`'s |
| `src/lib/chart-view.ts` / `chart-view.test.ts` | `unassigned` pool derivation |
| `src/components/diamond-geometry.ts` | NEW — shared `POSITION_COORDS` + `DIAMOND_GEOMETRY` |
| `src/app/t/[teamId]/chart/drag-activation.ts` | NEW — shared sensor activation constants |
| `src/app/t/[teamId]/chart/BattingOrderEditor.tsx` | Import shared activation constants |
| `src/app/t/[teamId]/chart/page.tsx` | Link to the positions editor |
| `src/app/t/[teamId]/chart/positions/page.tsx` | NEW — positions editor page |
| `src/app/t/[teamId]/chart/positions/PositionsEditor.tsx` | NEW — diamond drag editor |
| `src/app/t/[teamId]/chart/positions/actions.ts` | NEW — `savePositionsAction` |
| `src/app/t/[teamId]/chart/positions/*.test.*` | NEW — page/editor/action tests |
| `src/app/t/[teamId]/view/Diamond.tsx` | allPlay outfield cluster; geometry import |
| `src/app/t/[teamId]/view/Diamond.test.tsx` | Updated + new allPlay assertions |
| `src/app/t/[teamId]/view/page.tsx` / `page.test.tsx` | Pass `allPlay` + pool |
