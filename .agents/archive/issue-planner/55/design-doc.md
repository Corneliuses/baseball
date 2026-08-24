# Design Doc — Readiness: show the effective batting order and decline badges in the chart editors (#55)

## Overview

`computeReadiness` already derives `effectiveOrder` — the batting order with declined
players removed and ranks closed up — but nothing renders it, and the chart editors the
readiness page links to load no RSVP data at all. The coach can see *that* the lineup is
broken but not *what Saturday's card actually looks like*, and lands in an editor that has
no idea who declined. This closes the see-it half of the see-it → fix-it loop (finding C3,
Aug 2026 UX audit).

## Acceptance Criteria

- [ ] Readiness shows the declined-removed, ranks-closed batting order for the next game
- [ ] Chart editors show which players have declined the next game, without changing
      drag/save semantics
- [ ] No RSVP data is stored or written by any of this — pure reads
- [ ] With no upcoming game, both editors render exactly as today

**Clarification (user decision, this session):** the readiness page renders the effective
order card **only when a decline actually changed the batting order** — i.e. at least one
player with `battingOrder !== null` declined. When nobody in the order declined, the
effective order is identical to the standing order already on `/view`, and the "Ready"
screen stays the calm scoreboard it is today. A position-only decliner (selective team)
empties a fielding spot but does not change the order, so no order card renders for them.

## Architecture & Data Model

No schema, migration, or new `src/lib` query. Everything is derived at request time from
reads that already exist (`nextGame`, `getChart`, `listEventRsvps`, `buildRsvpStateMap`,
`computeReadiness`).

### Data Layer

Unchanged. `Readiness.effectiveOrder` (`src/lib/readiness.ts:52,148`) already carries the
generic entry rows back out, so the readiness page — which calls it with
`ChartViewEntry` — gets jersey numbers for free.

### API / Service Layer

| Endpoint / Function | Type | Auth | Purpose |
|---|---|---|---|
| `readiness/page.tsx` loader | RSC | COACH+ (existing) | Renders `readiness.effectiveOrder` — no new queries |
| `chart/page.tsx` loader | RSC | COACH+ (existing) | Adds `nextGame` + `listEventRsvps` reads; derives `declinedEntryIds` |
| `chart/positions/page.tsx` loader | RSC | COACH+ (existing) | Same two reads, same derivation |

No server action changes. `saveBattingOrderAction` / `savePositionsAction` and their form
payloads (`order`/`positions` + `baseline`) are untouched — AC3's "pure reads" is enforced
by not routing the new data anywhere near a write.

### UI Component Tree

- `readiness/page.tsx`
  - new local `EffectiveOrderList` (an `<ol>` of dugout rows: `JerseyDot` slot number,
    name, mono `#jersey`) inside a new Card, rendered between "Positions uncovered" and
    the awaiting card
- `chart/page.tsx` → `BattingOrderEditor` gains prop `declinedEntryIds?: readonly string[]`
  - `SlotItem` / `PoolItem` → `PlayerLabel` gains optional `declined` flag → static tag
- `chart/positions/page.tsx` → `PositionsEditor` gains the same prop
  - `Chip` gains optional `declined` flag → static tag

## Key Decisions

### Decision 1: Declined state travels as a separate prop, not on the entry type

**Options considered:**
- Option A: add `rsvpState` to `ChartEditorEntry` / `PositionsEditorEntry`
- Option B: keep the entry types unchanged; pass `declinedEntryIds: readonly string[]`
  as its own prop and look chips up in a `Set`

**Decision:** Option B.
**Rationale:** Both editors carry a deliberate comment — "RSVP state is deliberately
absent: the editor never loads RSVPs at all, so it structurally cannot filter by them."
The *structural* half of that guarantee is worth keeping: the draft logic in
`src/lib/chart.ts` (`buildBattingDraft`, `resolveDrop`, `buildPositionsDraft`,
`resolvePositionDrop`) consumes the entry rows, and if RSVP state rode on them it would be
one refactor away from filtering. A separate prop that only the leaf label components
read keeps RSVP data out of everything that decides seating. The comments get updated to
say exactly this: decoration arrives on a side channel the draft logic never sees.

### Decision 2: Badge is the shared declined vocabulary, statically styled

**Options considered:**
- Option A: fade the chip name via `RSVP_STYLE.declined.nameClassName`
- Option B: append a small text tag — `RSVP_STYLE.declined.label` ("Not going") in
  `RSVP_STYLE.declined.tagClassName` — and leave the name at full strength

**Decision:** Option B.
**Rationale:** design-plan.md §10 — state is colour *plus* a label, never colour alone;
a faded name on a drag chip could also read as "disabled", which the chip is not (the
issue is explicit: no filtering, no auto-benching, dragging a declined player stays
legal). Static styling only, no animation, per the dnd-kit/Motion ownership rule — the
tag is plain markup inside an element dnd-kit positions.

### Decision 3: Badge every chip, wherever it renders

Declined players are badged in the slots **and** in the pool/zone. The pool badge is the
point of the feature's second half: the coach who just watched SS decline is about to
promote a substitute — if that substitute also declined, the badge on their pool chip is
the difference between one edit and two.

### Decision 4: The readiness card renders only when a decline changed the order

Per the user decision above. Gate: `readiness.declined.some((e) => e.battingOrder !== null)`.
Edge: if *every* batter declined, `effectiveOrder` is empty — the card still renders (the
gate is true) with a one-line empty state instead of an empty `<ol>`.

### Decision 5: Slot numbers are the closed-up ranks

The `<ol>` renders `index + 1` in the `JerseyDot`, not `entry.battingOrder` — "ranks
closed up" is the issue's phrase and the whole point: this is the card as the plate
umpire would read it. The original slot is not shown; a coach who wants the standing
order has it on `/view` and in the editor.

## Security & Permissions

All three pages are already COACH+ via `requireTeamAccess(teamId, { intent: "read",
minRole: "COACH" })` — parents cannot reach any surface this touches. RSVP data is
already coach-visible on readiness and the event page; no new exposure. Intent stays
`"read"` everywhere (archived teams may still look).

## Error Handling

Matching each page's existing contract: the new reads are deliberately **not** wrapped in
try/catch — `nextGame` / `listEventRsvps` outages propagate rather than silently rendering
"nobody declined", which on these pages is indistinguishable from good news (the readiness
page documents this exact rule at `page.tsx:93`). In the editor pages, a null `nextGame`
is the AC4 path, not an error: `declinedEntryIds` is `[]` and the render is byte-identical
to today.

## Testing Strategy

| Layer | Test Type | File(s) | Notes |
|---|---|---|---|
| Readiness page | RSC render (existing pattern: mock libs, `renderToStaticMarkup`) | `src/app/t/[teamId]/readiness/page.test.tsx` | card gated on order-affecting decline; closed-up renumbering; position-only decliner → no card; all-batters-declined empty state |
| Chart page loaders | RSC render, editor mocked to capture props | `src/app/t/[teamId]/chart/page.test.tsx`, `src/app/t/[teamId]/chart/positions/page.test.tsx` | `declinedEntryIds` derived from next game's RSVPs; `[]` when `nextGame` → null; add `nextGame`/`listEventRsvps` mocks to the existing mock block |
| Editors | Testing Library component tests | `src/app/t/[teamId]/chart/BattingOrderEditor.test.tsx`, `src/app/t/[teamId]/chart/positions/PositionsEditor.test.tsx` | badge on declined chips in slot and pool/zone; absent otherwise; save form payload (`order`/`positions`, `baseline`) unchanged; omitted prop renders as today |

Static imports of the modules under test, per AGENTS.md (no `await import()` in tests).

## Config Changes

- [ ] Schema / index changes — none required
- [ ] Access rule changes — none required
- [ ] Environment variables — none required
- [ ] Dependency changes — none required

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| Every batter declined | Low | Card renders with a one-line empty state, not an empty list |
| Position-only player declined (selective team) | Low | Order unchanged → no order card (gate checks `battingOrder !== null`); the decline still shows in "Out" and "Positions uncovered" |
| No upcoming game | — | AC4: editor pages pass `[]`; readiness already early-returns its no-game card |
| Archived team | Low | Editor pages render the archived card before the editor; `declinedEntryIds` computed but unused — harmless read |
| Doubleheader / in-progress game (`GAME_GRACE_MS`) | Low | `nextGame`'s grace window is a display rule and this is a display — consistent with `/view` and readiness today; nothing here writes against the selection |
| Badge tempts future filtering of the pool | Med | Decision 1 keeps RSVP off the entry type; comments in both editors updated to restate the boundary |
| dnd-kit + animation conflict | Low | Tag is static markup; no Motion, no CSS animation on drag elements |
