# Proposal — Phase 10: Batting order editor (dnd-kit sortable) (#10)

## Executive Summary

With the #9 validation gate closed, this builds the first of the two drag surfaces: a
mobile-first, drag-and-drop editor for the team's **standing** batting order at
`/t/[teamId]/chart`, replacing the hand-editing in `pnpm db:studio` that carried the
validation weekend. The order persists as `battingOrder` values on `RosterEntry` —
columns that already exist (Decision 16); no schema change, no new dependencies.

Two things dominate the design. First, the save: `RosterEntry_teamId_battingOrder_key`
is a non-deferrable unique index, so any per-row update that transiently duplicates a
value throws mid-transaction — the save is therefore a two-phase array-form
`db.$transaction` (null every `battingOrder` for the team, then write final values),
with each write scoped by `teamId` so forged entry ids fail instead of crossing teams.
Second, the split between DOM and logic: all ordering/swap/validation behavior lives in
a new pure module `src/lib/chart.ts` with exhaustive co-located tests, and the dnd-kit
component is a thin shell over it — which also sidesteps jsdom's inability to simulate
real drags. Touch behavior follows Decision 10: `TouchSensor` with an activation delay
and tolerance so scrolling a phone page never starts a drag, and no Motion `layout`
props anywhere near the sortable list.

## Scope

### In Scope
- `/t/[teamId]/chart` page (coach-and-above) with a `@dnd-kit/sortable` batting-order
  editor: swap-on-drop semantics, `allPlay`-aware slots (all players vs. 9 + unassigned
  pool), explicit Cancel / Save (no autosave)
- Pure ordering/swap/validation logic in `src/lib/chart.ts` + tests
- Two-phase transactional `saveBattingOrder` in `src/lib/roster.ts`; `getChart` extended
  to return `entryId`
- Server action with the repo's established FormData → validate → redirect-with-error
  pattern; `revalidatePath` for chart and view pages
- Coach-gated "Edit chart" entry point on the team home page

### Out of Scope
- Positions diamond editor — #11 (can run in parallel; shares `src/lib/chart.ts` scope)
- Next-game readiness tri-state — #12 (blocked by this)
- Tap-to-place non-drag input mode — Decision 10 lists it as *Later*
- Undo/history or per-game overrides — permanent standing edits are a recorded product
  decision (Decision 16); flag in real use rather than build around
- RSVP display or filtering in the editor — the editor never loads RSVPs at all

## Acceptance Criteria

1. Sortable batting-order list built with `@dnd-kit/sortable` over the team's
   `RosterEntry` rows
2. `TouchSensor` uses `activationConstraint: { delay, tolerance }`; scrolling the page
   never initiates a drag
3. `allPlay = true` → every rostered player holds a slot; `allPlay = false` →
   `min(9, roster size)` slots and the remainder are unassigned (`battingOrder = null`)
4. Dropping onto an occupied slot swaps the two players (including unassigned ↔ slot)
5. Explicit Cancel and Save; no autosave; Save disabled until the draft differs from
   the loaded order; Cancel restores the loaded order
6. Save executes as a two-phase write inside one `db.$transaction`: null all
   `battingOrder` for the team, then write final values — no transient unique violation
7. Pure ordering/swap/validation logic lives in `src/lib/chart.ts` with co-located
   tests, independent of the DOM
8. Access: page and action require COACH or above; archived teams reject the write;
   entry ids are validated against the team's own roster server-side
9. A player removed mid-edit fails the save atomically with a "roster changed" error
   rather than saving a partial order
10. `pnpm check` green; `pnpm build` verified

## Implementation Phases

| Phase | Description | Areas Affected |
|---|---|---|
| 1 | Pure logic: draft model, swap, validation + exhaustive tests | `src/lib/chart.ts` |
| 2 | Data layer: `entryId` in `getChart`, two-phase `saveBattingOrder`, failure mapper | `src/lib/roster.ts`, `src/lib/chart-view.ts`, `src/lib/roster-rules.ts` |
| 3 | Route: page, dnd editor client component, server action, entry-point button, tests | `src/app/t/[teamId]/chart/`, `src/app/t/[teamId]/page.tsx` |
| 4 | Verification: `pnpm check`, build, real-phone touch pass | — |

Phases 1–2 are independent of the DOM and land the issue's riskiest logic first; phase 3
is a thin shell over them.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Transient unique-index violation during save (the issue's stated trap) | High | Two-phase write, single transaction; covered by data-layer tests asserting statement order |
| Touch drag vs. page scroll conflict makes the page unusable at a field | High | `TouchSensor` delay + tolerance (Decision 10); manual phone verification before closing |
| Motion `layout` fighting dnd-kit's `transform` | Med | No Motion imports in the sortable tree; dnd-kit `transition` for settling |
| Hand-seeded #9 data is sparse (1,2,5) or overflows 9 slots after an `allPlay` toggle | Med | Draft normalizes on load: dense pack, overflow visibly unassigned; nothing written until Save |
| Roster changes in another tab mid-edit | Med | Stale id → P2025 → full rollback → `roster-changed` error and fresh reload |
| jsdom can't simulate real drags | Low | Drag outcomes are pure functions in `chart.ts`, tested exhaustively; component tests cover rendering, dirty state, and payload |
| P2002 `meta.target` shape still unverified on live Postgres | Low | Defensive dual-shape mapper (mirrors `rosterWriteFailure`); two-phase write makes P2002 unreachable in normal operation anyway |

## Effort Estimate

**Overall:** Medium (2–3 days)

| Phase | Estimate |
|---|---|
| 1 — Pure logic + tests | 0.5 day |
| 2 — Data layer + tests | 0.5 day |
| 3 — Route, editor, action + tests | 1–1.5 days |
| 4 — Verification incl. phone pass | 0.5 day |

## Next Steps

1. Review and approve this proposal.
2. Follow `task-doc.md` to implement phase by phase.
3. After implementation, finalize with the `finalize-issue` skill (verify AC against the
   PR, archive `.agents/issue-planner/10/`, merge, and close the issue).
