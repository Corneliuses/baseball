# Design Doc — Phase 12: Next-game readiness, tri-state (#12)

## Overview

`computeReadiness` (`src/lib/readiness.ts`) collapses the RSVP tri-state into a binary
set: a player who hasn't responded is indistinguishable from one who declined, so before
the first RSVP lands the check reports **every** batter absent and **every** position
uncovered. This issue fixes the derivation to distinguish declined from silence, then
builds the first coach-facing surface for it — a readiness panel for the next game only.

Prerequisites #10 (batting order editor) and #11 (positions editor) are landed: both
editors exist at `src/app/t/[teamId]/chart/` and `chart/positions/`.

## Acceptance Criteria

From the issue's task list, restated as verifiable outcomes:

- [ ] `computeReadiness` takes a `ReadonlyMap<string, RsvpState>` (from `src/lib/rsvp.ts`) instead of `attending: ReadonlySet<string>`
- [ ] A player absent from the map is treated as `no-response`, never as absent
- [ ] Output splits **declined** players from players **awaiting response** — no merged "absent" list
- [ ] `uncoveredPositions` is driven by **declined only** — silence never produces a false alarm
- [ ] `ready` semantics decided and documented in the module docstring: `ready` = no declines affecting the chart; outstanding responses are surfaced separately and do not block readiness
- [ ] The six existing tests are rewritten for the new signature, plus new coverage for: nobody has responded yet; a mix of all three states; declined-versus-silent producing different output
- [ ] A coach-facing readiness panel exists showing who is out, which positions that leaves uncovered, and who hasn't answered
- [ ] Data loading stays in thin DB wrappers; the decision stays pure and DB-free
- [ ] `uncoveredPositions` still returns in scorebook order (via `ALL_POSITIONS`)
- [ ] `pnpm check` green; `pnpm build` green

## Architecture & Data Model

### Data Layer

**No schema changes.** The schema already models the tri-state: `Rsvp.attending` is a
non-null boolean (`prisma/schema.prisma:222`) and the absence of a row is the third
state. Only the derivation collapses them.

**No new DB wrapper is needed.** The issue's "thin DB wrapper" task is satisfied by
wrappers built in #6–#8, which the view page (`src/app/t/[teamId]/view/page.tsx`)
already composes in exactly the shape the panel needs:

| Loader | Module | Provides |
|---|---|---|
| `nextGame(teamId)` | `src/lib/schedule.ts` | The one game (GAME-only, grace window, does not swallow outages) |
| `getChart(teamId)` | `src/lib/roster.ts` | Every roster entry with `battingOrder` / `position` / `jerseyNumber` |
| `listEventRsvps(teamId, eventId)` | `src/lib/rsvps.ts` | That event's `Rsvp` rows (does not swallow outages) |
| `getTeamById(teamId)` | `src/lib/teams.ts` | `allPlay`, for the fielded-positions set (Decision 4) |

The panel page composes these plus `buildRsvpStateMap` (`src/lib/rsvp.ts`) and the
reworked `computeReadiness` — the same load-then-pure-derive pattern as the view page.

### API / Service Layer

| Endpoint / Function | Type | Auth | Purpose |
|---|---|---|---|
| `computeReadiness(chart, rsvps, allPlay)` | Pure function | n/a | Tri-state readiness derivation (reworked) |
| `/t/[teamId]/readiness` page loader | RSC page | `requireTeamAccess(teamId, { intent: "read", minRole: "COACH" })` | Coach-facing panel |

No server actions. The module stays read-only: it stores nothing, writes nothing, never
rearranges the chart, and never persists an effective lineup (Decision 16). The panel
links to the two chart editors; it has **no write path of its own**.

### The reworked pure function

```ts
export type Readiness<T extends ChartEntry> = {
  /// Chart-affecting players who declined. Batting-order position first, then
  /// position-only holders. These are what make the team not ready.
  declined: T[];
  /// Chart-affecting players who have not responded. Surfaced, never alarming.
  awaiting: T[];
  /// Positions left empty because the assigned player DECLINED — silence never
  /// uncovers a position. Scorebook order via ALL_POSITIONS, filtered to the
  /// positions this team fields (allPlay).
  uncoveredPositions: Position[];
  /// The batting order minus declined players, ranks closed up. No-response
  /// players stay in — silence must never read as "out" (see rsvp.ts).
  effectiveOrder: T[];
  /// True when no declines affect the chart. Awaiting responses do not block.
  ready: boolean;
};

export function computeReadiness<T extends ChartEntry>(
  chart: readonly T[],
  rsvps: ReadonlyMap<string, RsvpState>,
  allPlay: boolean,
): Readiness<T>;
```

- "Chart-affecting" = `battingOrder !== null || position !== null`. Fully benched
  players are ignored entirely (existing behavior, kept).
- A playerId missing from the map is `"no-response"` — defensive `?? "no-response"`,
  the same fallback `buildChartView` uses (`src/lib/chart-view.ts:87`), even though
  `buildRsvpStateMap` populates every roster player.
- The generic `<T extends ChartEntry>` lets the page pass `ChartViewEntry[]` from
  `getChart` straight in (it's a structural superset) and get `jerseyNumber` back out
  for display, without widening `ChartEntry` or coupling to chart-view's type.

### UI Component Tree

```
/t/[teamId]/readiness/page.tsx        (RSC, minRole COACH)
├── "No upcoming game" empty-state Card  (mirrors view/page.tsx)
├── Game header Card (opponent, formatEventDateTime, location)
├── Readiness summary Card — "Ready" / "Needs attention" + counts
├── "Out" section        — readiness.declined (name, jersey, slot/position)
├── "Uncovered" section  — readiness.uncoveredPositions via POSITION_LABELS
├── "No response yet" section — readiness.awaiting
└── Links: Edit batting order (/chart) · Edit positions (/chart/positions)
```

Team home (`src/app/t/[teamId]/page.tsx`) gains a `role !== "PARENT"` nav button
"Next-game readiness", beside the existing coach-only "Edit batting order" button.

## Key Decisions

### Decision 1: What `ready` means now

**Options considered:**
- Option A: `ready` = everyone attending (all responded yes) — silence blocks readiness
- Option B: `ready` = no declines affecting the chart; awaiting surfaced separately

**Decision:** Option B (the issue's own recommendation).
**Rationale:** Option A recreates the defect at a different threshold — the panel would
cry "not ready" all week until the last family responds, which is the noise that trains
the coach to ignore the screen. A silent family usually shows up; a declined one won't.
`ready === (declined.length === 0)`; `uncoveredPositions` can only be non-empty when a
declined player holds a position, so no separate term is needed (asserted by test).

### Decision 2: Scope of the `declined` / `awaiting` lists

**Options considered:**
- Option A: Batting-order players only (`declinedFromOrder`, mirrors old `absentFromOrder`)
- Option B: Chart-affecting players — in the order **or** holding a position

**Decision:** Option B.
**Rationale:** On a selective (`allPlay = false`) team, `battingOrder` and `position`
are independently nullable, so a fielder who isn't batting is representable. Under
Option A, that player declining would uncover their position while appearing in no
people-list — the panel would say "SS uncovered" with no one named as out. Option B
names them. Fully benched players stay ignored (kept from the existing test), because
their RSVP cannot affect the game plan. Order within each list: batting slot ascending,
`null` slots last, then name — stable and matches how the coach thinks.

### Decision 3: `effectiveOrder` keeps no-response players

**Options considered:**
- Option A: Attending only (current behavior carried forward)
- Option B: Everyone except declined

**Decision:** Option B.
**Rationale:** `src/lib/rsvp.ts` is explicit that no-response "must never read as out",
and `RSVP_STYLE` renders it at full strength for the same reason. An effective order
that drops silent players tells the coach a probably-present kid isn't batting. Only a
declared "not going" removes a player from the projection; declined players close ranks
exactly as before, and the standing chart is never renumbered.

### Decision 4: `uncoveredPositions` respects `allPlay`

**Options considered:**
- Option A: Keep the current holder-based filter over all nine positions
- Option B: Add an `allPlay: boolean` parameter and only report positions the team fields

**Decision:** Option B — a small, deliberate scope addition beyond the issue's task list.
**Rationale:** An allPlay team fields `ALL_PLAY_INFIELD_POSITIONS` only; a stale
`CENTER_FIELD` or `CATCHER` row (hand-seeded in #9, or left behind by an allPlay
toggle) is pooled — not seated — by every other read (`buildChartView`,
`buildPositionsDraft`). Under Option A, that stale row's player declining reports "CF
uncovered" — a position the team cannot fill, i.e. exactly the false alarm this issue
exists to eliminate. The parameter mirrors `buildChartView(entries, rsvpStates, allPlay)`,
so the fielded-set derivation (`allPlay ? ALL_PLAY_INFIELD_POSITIONS : ALL_POSITIONS`)
already has a tested precedent. Filtering a fixed ordered list preserves the scorebook
order the issue requires (same technique as `ALL_PLAY_INFIELD_POSITIONS` itself). The
declined player still appears in the `declined` list either way — nobody vanishes.

### Decision 5: Where the panel lives

**Options considered:**
- Option A: Dedicated coach-only route `/t/[teamId]/readiness`
- Option B: Inline section on team home (`/t/[teamId]`)
- Option C: Banner on the chart editors

**Decision:** Option A.
**Rationale:** Matches the repo's one-concern-per-route convention and the established
page skeleton (own `requireTeamAccess` call, own empty state, own test file). Team home
is a thin nav hub with no data dependencies today; inlining would put `nextGame` +
chart + RSVP loads on every home visit and complicate its access story (parents see the
page; the panel is coach-facing). The editors (Option C) are where a coach *fixes* the
chart, not where they ask "are we ready Saturday" from the bleachers. A nav button from
home gives the panel a stable, linkable URL — useful later when #13's emails want to
link the coach somewhere.

### Decision 6: Gate with `minRole: "COACH"`, intent `"read"`

**Decision:** The page requires COACH, same as both editors ("nothing links here for
parents and minRole turns a pasted URL into a 404" — `chart/page.tsx`). Intent stays
`"read"` so an archived team's coach can still view readiness of a past-season chart
(the page renders nothing actionable for them anyway; the editors it links to enforce
their own write gates).

## Security & Permissions

- Page loader: `requireTeamAccess(teamId, { intent: "read", minRole: "COACH" })`,
  called by the page itself per the "check for yourself, don't trust the layout" rule.
- All queries go through existing `src/lib/` wrappers that scope by `teamId` in the
  where clause; no new query surface is added.
- No server actions, no writes, no new mutation paths. The panel's only outbound
  affordances are links to the existing editors, which carry their own COACH + write
  gates and the `baseline` concurrent-edit guard.

## Error Handling

| Layer | Behavior |
|---|---|
| `nextGame` | Does **not** swallow DB errors (its documented contract) — an outage propagates rather than rendering the healthy "no upcoming game" state. The page deliberately does not try/catch it, same as `view/page.tsx`. |
| `listEventRsvps` | Same contract — a caught outage would report every family silent, which after this issue is a real, calm-looking product state. Propagate. |
| `getChart` | Same contract ("no chart set yet" is a real state). Propagate. |
| No game scheduled | Empty-state card with a link to the schedule (mirrors view page). |
| Empty chart | "No chart set yet" card linking to both editors; `computeReadiness([], …)` stays ready-and-empty rather than throwing (existing test, kept). |
| `TeamAccessError` | `notFound()`, matching every sibling page. |

## Testing Strategy

| Layer | Test Type | File(s) | Notes |
|---|---|---|---|
| Pure derivation | Unit | `src/lib/readiness.test.ts` | Rewrite of 6 existing + new tri-state cases (below) |
| Panel page | Component (RSC render) | `src/app/t/[teamId]/readiness/page.test.tsx` | Follow `view/page.test.tsx`'s mock pattern (mock `team-access`, `schedule`, `roster`, `rsvps`, `teams`) |
| Team home nav | Component | `src/app/t/[teamId]/page.test.tsx` (extend if present, else covered by page test above) | Coach sees the button; parent does not |

Rewritten + new unit cases:

1. Whole chart attending → ready, all lists empty (rewrite)
2. One declined → in `declined`, their position in `uncoveredPositions`, not ready (rewrite)
3. Effective order closes ranks over a decline; standing chart untouched (rewrite)
4. Benched player declined → ignored entirely, ready (rewrite)
5. Uncovered positions in scorebook order, not chart order (rewrite — everyone declined but one)
6. Empty chart → ready, no throw (rewrite)
7. **Nobody has responded** → ready, `declined` empty, `awaiting` = every chart-affecting player, `uncoveredPositions` empty, `effectiveOrder` complete
8. **Mix of all three states** → each list correct simultaneously
9. **Declined vs silent differ**: same player declined vs absent from the map produces different output (`declined`+uncovered vs `awaiting`+covered)
10. No-response player **stays** in `effectiveOrder`
11. Player missing from the map entirely (not just `"no-response"`) → treated as no-response
12. allPlay: stale outfield/catcher row with a declined holder → **not** uncovered; same chart with `allPlay = false` → uncovered (Decision 4, both sides)
13. Position-only player (selective team) who declined → named in `declined` (Decision 2)
14. `ready` is false exactly when `declined` is non-empty (pins Decision 1)

## Config Changes

- [ ] Schema / index changes — none
- [ ] Access rule changes — none (new page uses existing `requireTeamAccess` with existing roles)
- [ ] Environment variables — none
- [ ] Dependency changes — none

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| Breaking a caller of `computeReadiness` | Low | Grep confirms zero production callers today — only the test file imports it. The signature change lands with its consumers in one commit. |
| Silence read as "safe" by the coach (kid no-shows) | Med | `awaiting` section is always visible with a count, styled with `RSVP_STYLE["no-response"]` language ("No response") — surfaced, not hidden, just not alarming. |
| Stale position rows on allPlay teams false-alarm | Med | Decision 4 filters to fielded positions. |
| Panel tempts a special-cased "fix it" write path | High (Decision 16 violation) | Panel links to the editors only; design and review explicitly forbid any mutation in this route. A patch made from here is a normal, permanent chart edit. |
| RSVPs change between page loads | Low | The page is a server render of live reads; refresh reflects reality. No caching layer is added. |
| Two sources of truth for tri-state semantics | Med | The derivation consumes `RsvpState` from `src/lib/rsvp.ts` — the module #7/#8 already consume — rather than re-deriving from booleans. |
