# Proposal — Phase 11: Positions diamond editor (dnd-kit droppables) (#11)

## Executive Summary

Coaches get a drag-and-drop baseball diamond at `/t/[teamId]/chart/positions` for setting
the team's standing defensive positions, persisted as the existing nullable `position`
column on `RosterEntry` — no new models, per Decision 16. The editor mirrors #10's proven
shape end to end: pure, gesture-agnostic draft logic in `src/lib/chart.ts` (swap-on-drop,
tested without a DOM), a server action that re-loads and re-validates everything at save
time, and a two-phase transactional write that nulls every `position` for the team before
writing final values — sidestepping the non-deferrable `RosterEntry_teamId_position_key`
unique index exactly as #10 did for `battingOrder`.

The one real modeling decision: under `allPlay` the outfield is a single zone, so infield
assignments persist as named positions and every other player persists as `position =
null` (allPlay has no bench, so null unambiguously means "outfield"); LF/CF/RF are never
written for allPlay teams. Because `allPlay` defaults to true, the parent-facing view page
is updated in the same issue to render outfield kids as a cluster instead of showing
"Open" LF/CF/RF markers with those kids missing from the diamond.

## Scope

### In Scope
- Diamond editor with positioned droppables at `/t/[teamId]/chart/positions` (new
  sub-route; cross-linked with the batting order editor and the view page)
- `allPlay = true`: six infield droppables + one Outfield zone holding everyone else;
  `allPlay = false`: nine droppables + Bench/Dugout zone
- Explicit Cancel / Save; two-phase transactional `savePositions` in `src/lib/roster.ts`
- Pure position logic + server-side validation in `src/lib/chart.ts`, co-located tests,
  designed gesture-agnostically for the future tap-to-select mode
- Shared drag activation config (`TouchSensor` delay 250ms/tolerance 8) extracted from
  #10's editor and reused
- Keyboard drag support via a coordinateGetter that snaps between droppable centers
- View page: allPlay outfield cluster rendering (confirmed in scope by owner, 2026-08-02)
- Manual measurement of the brief's third success target (lineup + positions on a phone
  in under 5 minutes)

### Out of Scope
- Tap-to-select / tap-to-place mode (listed as *Later*; the pure logic is built so it can
  reuse it, but no UI here)
- Inning-by-inning rotation (positions are static per explicit design)
- Any per-game position storage (Decision 16), undo/history (edits are permanent), RSVP
  filtering of the assignable pool (a declined kid stays fully placeable)
- Schema or migration changes — none needed

## Acceptance Criteria

1. Diamond with droppables for all positions, labeled solely via `POSITION_LABELS`
   (`C` = Catcher, `CF` = Center Field)
2. `allPlay = true` → one kid per infield position; Outfield zone holds all remaining
   players (persisted as `position = null`; LF/CF/RF never written)
3. `allPlay = false` → one kid per position; remainder in a Bench/Dugout zone
4. Dropping on an occupied position swaps, matching #10's drag grammar
5. Explicit Cancel / Save; nothing persists until Save; Save is a two-phase write inside
   one `db.$transaction` (null all `position` for the team, then write finals) so no
   transient `P2002` on `RosterEntry_teamId_position_key`
6. Server action re-loads team + roster and validates before writing; races (roster edit,
   `allPlay` toggle, deleted entry) fail with explicit reload messages, never a partial
   write
7. `TouchSensor` activation config shared with #10's editor from one module
8. Pure logic in `src/lib/chart.ts` with co-located tests; no drag assumptions
9. RSVPs are never loaded by the editor — structurally cannot filter the pool
10. View page renders allPlay teams truthfully: outfield kids clustered in the outfield,
    no "Open" LF/CF/RF markers
11. Coach-only (`minRole: COACH`) for page and action; archived teams read-only; parents'
    pasted URLs 404
12. No Motion on drag surfaces; no new dependencies; no schema changes
13. Manual: full chart flow on a phone in under 5 minutes, recorded in the PR
14. `pnpm check` and `pnpm build` green

## Implementation Phases

| Phase | Description | Areas Affected |
|---|---|---|
| 1 | Pure logic: positions draft, drop resolution, validation, failure translation | `src/lib/chart.ts` + tests |
| 2 | Data layer: two-phase `savePositions` | `src/lib/roster.ts` + tests |
| 3 | Editor UI: sub-route page, diamond editor, server action, shared sensor config, shared geometry | `src/app/t/[teamId]/chart/**`, `src/components/diamond-geometry.ts` |
| 4 | View page: allPlay outfield cluster | `src/lib/chart-view.ts`, `src/app/t/[teamId]/view/**` |
| 5 | Verification: `pnpm check`, `pnpm build`, manual 5-minute phone measurement | — |

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Diamond drag surface slips (the brief's own carried risk) | High | Pre-planned fallback: dropdown-per-position form on the same route, reusing `validatePositions` + `savePositions` unchanged; #10's editor is a separate page and stays untouched either way |
| Transient unique-index violation during save | High | Two-phase write in one transaction (the issue's stated trap, same fix as #10) |
| Mid-edit races (roster/settings changed) | Med | Save-time revalidation against freshly loaded team + roster; P2025 rolls back the whole transaction |
| Stale LF/CF/RF rows on allPlay teams silently collapsing | Med | The draft shows them pooled in the Outfield zone *before* save; collapse only happens on an explicit Save (edits are permanent by design) |
| Scroll-vs-drag on phones | Med | Shared TouchSensor delay/tolerance from #10 (Decision 10) |
| Motion/dnd-kit `transform` conflict | High | No Motion imports on the editor page |

## Effort Estimate

**Overall:** Medium (3–5 days)

| Phase | Estimate |
|---|---|
| 1 — Pure logic + tests | 1 day |
| 2 — Data layer | 0.5 day |
| 3 — Editor UI + tests | 1.5–2 days |
| 4 — View page | 0.5–1 day |
| 5 — Verification | 0.5 day |

## Next Steps

1. Review and approve this proposal.
2. Follow `task-doc.md` to implement phase by phase.
3. After implementation, finalize with the `finalize-issue` skill (verify AC against the
   PR, archive `.agents/issue-planner/11/`, merge, and close the issue).
