# Task Doc — Phase 12: Next-game readiness, tri-state (#12)

## Prerequisites

- [x] #10 Batting order editor — landed (`src/app/t/[teamId]/chart/`)
- [x] #11 Positions diamond editor — landed (`src/app/t/[teamId]/chart/positions/`)
- [ ] `pnpm install && pnpm db:generate` on a fresh checkout (generated client is gitignored)

## Phase 1: Pure derivation — `computeReadiness` tri-state rework

- [ ] Rework `src/lib/readiness.ts`:
  - [ ] Change the signature to `computeReadiness<T extends ChartEntry>(chart: readonly T[], rsvps: ReadonlyMap<string, RsvpState>, allPlay: boolean): Readiness<T>`, importing `RsvpState` from `@/lib/rsvp`
  - [ ] Resolve each player's state as `rsvps.get(playerId) ?? "no-response"` — a missing entry is never absent
  - [ ] Replace `absentFromOrder` with `declined: T[]` and `awaiting: T[]`, scoped to chart-affecting players (`battingOrder !== null || position !== null`), ordered batting slot ascending with `null` slots last, then name
  - [ ] Drive `uncoveredPositions` from declined holders only, filtering `ALL_POSITIONS` to the fielded set (`allPlay ? ALL_PLAY_INFIELD_POSITIONS : ALL_POSITIONS` — import both from `@/lib/positions`) so scorebook order is preserved
  - [ ] `effectiveOrder` = batting order minus **declined** only; no-response players stay in
  - [ ] `ready` = `declined.length === 0`; document in the module docstring that awaiting responses are surfaced separately and never block readiness
  - [ ] Update the module docstring: tri-state semantics, the `ready` definition, and the unchanged read-only / no-persisted-lineup constraints
- [ ] Rewrite `src/lib/readiness.test.ts` for the new signature (all 14 cases in the design doc's Testing Strategy — the 6 rewrites plus tri-state, allPlay, position-only-decliner, map-miss, and `ready`-pinning cases). Build maps with `buildRsvpStateMap` where it reads naturally; hand-build maps for the map-miss case.
- [ ] Run `pnpm test src/lib/readiness.test.ts` (or `pnpm vitest run src/lib/readiness.test.ts`) — green before Phase 2

## Phase 2: Coach-facing readiness panel

- [ ] Create `src/app/t/[teamId]/readiness/page.tsx` (RSC, default export per Next.js requirement):
  - [ ] `requireTeamAccess(teamId, { intent: "read", minRole: "COACH" })`, `TeamAccessError` → `notFound()` — copy the gate shape from `src/app/t/[teamId]/chart/page.tsx`
  - [ ] Load `nextGame(teamId)`; on `null` render the "No upcoming game" empty-state card (mirror `view/page.tsx:57-75`) linking to `/t/${teamId}/schedule`
  - [ ] `Promise.all` of `getTeamById(teamId)`, `getChart(teamId)`, `listEventRsvps(teamId, game.id)` — no try/catch, per each loader's documented outage contract
  - [ ] Derive: `buildRsvpStateMap(chartEntries.map(e => e.playerId), rsvpRows)` → `computeReadiness(chartEntries, rsvpStates, team?.allPlay ?? true)`
  - [ ] Render: game header card (`formatEventDateTime` from `@/lib/calendar`, opponent, location); summary card ("Ready for game day" / "Needs attention"); "Out" section from `declined` (name, jersey, batting slot, position via `POSITION_LABELS`); "Positions uncovered" from `uncoveredPositions`; "No response yet" from `awaiting` using `RSVP_STYLE["no-response"]` language; links to `/t/${teamId}/chart` and `/t/${teamId}/chart/positions`
  - [ ] Empty chart (`declined`/`awaiting` empty because nothing is chart-affecting and no entry has order/position): "No chart set yet" card linking to both editors
  - [ ] **No server actions, no write path, no RSVP mutation** — links to the editors are the only affordance
  - [ ] `metadata.title` following the sibling pages' pattern
- [ ] Add the coach-only nav button in `src/app/t/[teamId]/page.tsx`: inside the existing `role !== "PARENT"` guard, `Next-game readiness` → `/t/${teamId}/readiness`
- [ ] Write `src/app/t/[teamId]/readiness/page.test.tsx`, following `src/app/t/[teamId]/view/page.test.tsx`'s mocking pattern (mock `@/lib/team-access`, `@/lib/schedule`, `@/lib/roster`, `@/lib/rsvps`, `@/lib/teams`). Cover: no-game empty state; ready render (no declines, some awaiting); needs-attention render (declined + uncovered listed); parent role → `notFound`; no special write affordance appears

## Pre-Commit Gate

Per `AGENTS.md` Commands (`pnpm check` = lint → typecheck → test):

- [ ] `pnpm check` ✅
- [ ] `pnpm build` ✅ — requires `DATABASE_URL` (build runs `prisma migrate deploy` first); on an env without one, `pnpm exec next build` verifies the compile step and the full build must be confirmed by the Vercel deploy

## Files Modified / Created

| File | Change |
|---|---|
| `src/lib/readiness.ts` | Rework: tri-state map input, declined/awaiting split, allPlay-aware uncovered, new `ready` semantics, generic entry type |
| `src/lib/readiness.test.ts` | Rewrite all 6 tests + 8 new tri-state/allPlay/edge cases |
| `src/app/t/[teamId]/readiness/page.tsx` | New: coach-only readiness panel (read-only, links to editors) |
| `src/app/t/[teamId]/readiness/page.test.tsx` | New: page tests per `view/page.test.tsx` pattern |
| `src/app/t/[teamId]/page.tsx` | Add coach-only "Next-game readiness" nav button |
