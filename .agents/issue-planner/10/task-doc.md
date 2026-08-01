# Task Doc — Phase 10: Batting order editor (dnd-kit sortable) (#10)

## Prerequisites

- [x] #9 (Validation gate) closed — closed 2026-08-01, proceed decision made
- [x] `@dnd-kit/core` / `sortable` / `utilities` installed (already in package.json)
- [ ] Read `node_modules/next/dist/docs/` sections on Server Actions and client
      components (Next 16 conventions differ from training data — AGENTS.md)
- [ ] Skim the installed `@dnd-kit/sortable` README/types for `rectSwappingStrategy`,
      `TouchSensor`, and `sortableKeyboardCoordinates` (verify against v10, not memory)

## Phase 1: Pure logic — `src/lib/chart.ts`

- [ ] Create `src/lib/chart.ts` with `BattingDraft`, `slotCount`, `buildBattingDraft`,
      `placeInSlot`, `unassign`, `draftToOrderedIds`, `validateBattingOrder`, and a
      dirty-check helper (see design-doc.md for exact contracts). Pure, DB-free,
      DOM-free — the `chart-view.ts` pattern. Named exports only.
- [ ] Create `src/lib/chart.test.ts` co-located, covering:
      - `slotCount`: allPlay true/false, roster sizes 0, 5, 9, 12
      - `buildBattingDraft`: dense, sparse (1,2,5), overflow past slotCount, all-null
      - `placeInSlot`: slot↔slot swap, unassigned→empty slot, unassigned→occupied slot
        (displaced player becomes unassigned), no-op drop on self, immutability
      - `unassign`: from slot; no-op when already unassigned
      - `validateBattingOrder`: ok path (assignments dense 1..k), `unknown-entry`,
        `duplicate-entry`, `too-many-slots`, `missing-players` (allPlay=true with a
        player left out)

## Phase 2: Data layer — `src/lib/roster.ts`

- [ ] Extend `getChart`'s select with `id: true`; add `entryId: string` to
      `ChartViewEntry` in `src/lib/chart-view.ts` and thread it through `getChart`'s
      mapping (view page and `buildChartView` are unaffected)
- [ ] Add `saveBattingOrder(teamId, orderedEntryIds)` to `src/lib/roster.ts`: array-form
      `db.$transaction([updateMany(null all for teamId), ...update({ id, teamId }, index+1)])`
      — two-phase per the issue's trap; every update scoped by `teamId`
- [ ] Update roster.ts's header comment (currently: batting order "never written here")
- [ ] Add a chart write-failure mapper (P2025 → `roster-changed`, defensive P2002 →
      `order-conflict`) — either in `src/lib/chart.ts` alongside a `PrismaLikeError`
      duck-type or in `roster-rules.ts` next to `rosterWriteFailure`; keep it pure
- [ ] Extend `src/lib/roster.test.ts` (existing `vi.mock("./db")` pattern): phase order,
      teamId scoping on every statement, index+1 values, unassigned entries get no
      phase-2 statement
- [ ] Extend `src/lib/chart-view.test.ts` only if `ChartViewEntry` change requires
      fixture updates

## Phase 3: Route — `src/app/t/[teamId]/chart/`

- [ ] `actions.ts`: `saveBattingOrderAction(formData)` — `extractTeamId`, Zod-parse the
      JSON `order` field, `requireTeamAccess(write, COACH)`, re-load roster ids +
      `team.allPlay`, `validateBattingOrder`, `saveBattingOrder`, map failures to
      `?error=` codes, `revalidatePath` chart + view, redirect `?saved=1`
      (mirror `src/app/t/[teamId]/roster/actions.ts` structure, incl. `unstable_rethrow`)
- [ ] `page.tsx`: server component — `requireTeamAccess(read, minRole COACH)` →
      `notFound()` on `TeamAccessError`; load `getChart` + team (`allPlay`,
      `archivedAt`); empty-roster empty state linking to roster page; archived team
      renders the chart read-only with a notice; error/saved banners from search params
- [ ] `BattingOrderEditor.tsx` (`"use client"`): DndContext with TouchSensor
      (`{ delay: 250, tolerance: 8 }`), Pointer/Mouse sensor (`{ distance: 5 }`),
      KeyboardSensor; `SortableContext` with `rectSwappingStrategy`; slot list +
      unassigned pool (pool only when `allPlay = false`); `onDragEnd` →
      `placeInSlot`/`unassign`; Save/Cancel bar (Save disabled when clean; Cancel
      restores loaded snapshot); hidden form field `order` = JSON of
      `draftToOrderedIds`. **No Motion imports in this file.** dnd-kit's `transition`
      for settling. Use existing `Button`/`Card` primitives from `src/components/ui/`
- [ ] Entry point: add coach-gated "Edit chart" button to
      `src/app/t/[teamId]/page.tsx` (`role === "COACH" || role === "OWNER"` — reuse the
      existing `role` variable) linking to `/t/${teamId}/chart`
- [ ] Tests: `actions.test.ts` (access, invalid payload, each validation reason,
      P2025 mapping, revalidate/redirect targets — mirror roster `actions.test.ts`),
      `BattingOrderEditor.test.tsx` (render, dirty-state Save/Cancel, posted payload;
      no simulated drags — see design-doc Testing Strategy), `page.test.tsx`
      (parent → notFound, archived notice, empty roster)

## Phase 4: Verification

- [ ] `pnpm check` (lint → typecheck → test) — green
- [ ] `pnpm build` — note: requires `DATABASE_URL` (build runs `prisma migrate deploy`
      first). Without one in the environment, run `pnpm exec next build` to verify the
      compile step, per AGENTS.md
- [ ] Manual phone pass before closing the issue: scroll the list without starting a
      drag; drag with the 250ms hold; save; confirm `/t/[teamId]/view` reflects the
      order (the coach measures the brief's "under 5 minutes" target at the end of #11)

## Pre-Commit Gate

Per AGENTS.md `## Commands`:

- [ ] `pnpm check` ✅ (lint → typecheck → test)
- [ ] `pnpm build` (or `pnpm exec next build` if no `DATABASE_URL`) ✅

## Files Modified / Created

| File | Change |
|---|---|
| `src/lib/chart.ts` | **New** — pure draft/swap/validate logic |
| `src/lib/chart.test.ts` | **New** — exhaustive unit tests |
| `src/lib/roster.ts` | `getChart` selects `id`; add `saveBattingOrder`; update header comment |
| `src/lib/roster.test.ts` | Tests for `saveBattingOrder` |
| `src/lib/chart-view.ts` | `ChartViewEntry` gains `entryId` |
| `src/lib/roster-rules.ts` *(or chart.ts)* | Chart write-failure mapper |
| `src/app/t/[teamId]/chart/page.tsx` | **New** — coach-gated editor page |
| `src/app/t/[teamId]/chart/BattingOrderEditor.tsx` | **New** — client dnd editor |
| `src/app/t/[teamId]/chart/actions.ts` | **New** — save action |
| `src/app/t/[teamId]/chart/*.test.ts(x)` | **New** — action/component/page tests |
| `src/app/t/[teamId]/page.tsx` | Coach-gated "Edit chart" button |
