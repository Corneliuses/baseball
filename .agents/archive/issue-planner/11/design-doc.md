# Design Doc — Phase 11: Positions diamond editor (dnd-kit droppables) (#11)

## Overview

Coaches drag players onto a labeled baseball diamond to set the team's standing defensive
positions, persisted as the nullable `position` column on `RosterEntry`. This is the second
and harder of the two drag surfaces: arbitrary positioned drop targets over a diamond,
rather than #10's sortable list. It completes the authoring side of the chart (batting
order landed in #10) and unblocks #12 (next-game readiness).

## Acceptance Criteria

From the issue, plus two clarifications confirmed with the owner (recorded under Key
Decisions below):

- [ ] Diamond graphic with arbitrary positioned droppables for the nine positions,
      labeled via `POSITION_LABELS` (`C` = Catcher, `CF` = Center Field)
- [ ] `TouchSensor` activation-delay configuration shared with #10's batting order editor
- [ ] `allPlay = true` → one kid per **infield** position (P, C, 1B, 2B, 3B, SS); the
      outfield is one zone holding all remaining players
- [ ] `allPlay = false` → one kid per position (all nine); remainder sit in a
      Bench/Dugout zone
- [ ] Explicit Cancel / Save — no autosave; edits live in local state until Save
- [ ] Save is a two-phase transactional write (null every `position` for the team, then
      write final values) to avoid transient `P2002` on `RosterEntry_teamId_position_key`
- [ ] Pure position-assignment logic in `src/lib/chart.ts` with co-located tests, designed
      gesture-agnostically (no drag assumption) so tap-to-select can reuse it later
- [ ] RSVP state never filters the assignable pool — the editor loads no RSVPs at all
- [ ] **Confirmed in scope:** the parent-facing view page renders allPlay outfield
      correctly (outfield players clustered as a zone, not "Open" LF/CF/RF markers)
- [ ] Manual measurement of the brief's third success target: coach sets lineup and
      positions on a phone in under 5 minutes
- [ ] `pnpm check` and `pnpm build` green

## Architecture & Data Model

### Data Layer

**No schema change.** `RosterEntry.position` (`prisma/schema.prisma:166`) already exists,
nullable, with unique index `RosterEntry_teamId_position_key`
(`prisma/migrations/20260728053521_001/migration.sql:196`). There is deliberately no
`PositionAssignment` model (Decision 16) and none is added.

**allPlay outfield storage (the one modeling question, resolved):** the unique index means
at most one player per named position, so "outfield holds all remaining players" cannot be
persisted as named positions — only three outfield enum values exist. Under
`allPlay = true`:

- Droppables are the six `INFIELD_POSITIONS` plus one **Outfield zone**.
- Infield assignments persist as named positions; every other player persists as
  `position = null`.
- `null` is unambiguous per mode: allPlay has no bench, so null **is** "in the outfield";
  under `allPlay = false` null remains "bench/dugout", exactly as the schema comment says.
- `LEFT_FIELD` / `CENTER_FIELD` / `RIGHT_FIELD` are **never written** for allPlay teams.
  Stale named-outfield rows (hand-set during #9, or `allPlay` toggled on after a full
  9-position chart) load into the Outfield zone in the draft — visible to the coach before
  anything is written — and collapse to `null` on the next Save.

New write in `src/lib/roster.ts`, mirroring `saveBattingOrder` exactly:

```ts
export async function savePositions(
  teamId: string,
  assignments: readonly { entryId: string; position: Position }[],
): Promise<void>
```

Array-form `db.$transaction`: phase 1 `updateMany({ where: { teamId }, data: { position: null } })`,
phase 2 one `update({ where: { id, teamId }, data: { position } })` per assignment. The
`teamId` in each phase-2 where clause is the cross-team-forgery guard; a vanished entry
throws `P2025` and rolls the whole save back.

### API / Service Layer

| Endpoint / Function | Type | Auth | Purpose |
|---|---|---|---|
| `savePositionsAction` | Server Action (`chart/positions/actions.ts`) | `requireTeamAccess(write, COACH)` | Parse + validate submitted assignments, call `savePositions`, redirect with `?saved=1` or `?error=` |
| `savePositions` | Internal (`src/lib/roster.ts`) | Caller-guarded | Two-phase transactional write of `position` |
| `getChart` | Internal (existing, `src/lib/roster.ts`) | Caller-guarded | Already returns `position`; reused unchanged |

The action re-loads the team and roster itself (`getTeamById` + `getChart`) and validates
against them — client input never decides which rows get written, and a roster edit or
`allPlay` toggle that raced the editing session fails validation instead of writing a
chart the coach never saw. Identical structure to `saveBattingOrderAction`.

### Pure logic — `src/lib/chart.ts` extensions

The draft model, gesture-agnostic (functions take `(entryId, position)`, never a drag
event; `resolvePositionDrop` is the only drag-aware adapter, mirroring `resolveDrop`):

```ts
export type PositionsDraft = {
  /// position → entryId. Under allPlay only infield keys ever appear.
  assigned: Partial<Record<Position, string>>;
  /// Everyone else: the Outfield zone under allPlay, Bench/Dugout otherwise.
  pool: string[];
};
```

| Function | Behavior |
|---|---|
| `droppablePositions(allPlay)` | `INFIELD_POSITIONS` when allPlay, else `ALL_POSITIONS` |
| `buildPositionsDraft(entries, allPlay)` | Assigned from non-null positions within `droppablePositions`; stale named-outfield entries under allPlay land in the pool; pool keeps caller (roster) order |
| `placeAtPosition(draft, entryId, position)` | **Swap semantics like #10**: dropping on an occupied position exchanges — the occupant takes the dragged player's old position, or their pool spot if the drag came from the pool. Out-of-range position (outfield under allPlay), unknown entry, self-drop → unchanged. Never mutates input |
| `unassignPosition(draft, entryId)` | Position → pool; no-op if already pooled |
| `samePositions(a, b)` | Dirty check over `assigned` only — pool order is presentation |
| `POSITION_POOL_ID`, `resolvePositionDrop(draft, activeId, overId, allPlay)` | dnd-kit id mapping; droppable ids are the `Position` enum names themselves |
| `validatePositions(submitted, rosterEntryIds, allPlay)` | Server-side: every key a real `Position` within `droppablePositions(allPlay)`, every entryId on the roster, no entryId twice. **Partial charts are valid** — an empty SS under allPlay still means everyone plays (they're in the outfield), and "no chart set yet" is a real product state (#8). Returns `{ ok, assignments } | { ok: false, reason }` with reasons `unknown-entry \| duplicate-entry \| invalid-position` |
| `chartWriteFailure` (extended) | Add `P2002` with `position` in `meta.target` → new `"position-conflict"` member (defensive; should be unreachable given the two-phase write, same as `"order-conflict"`) |

### UI Component Tree

```
src/app/t/[teamId]/chart/
├── drag-activation.ts        NEW  — MOUSE_ACTIVATION {distance: 5} and
│                                    TOUCH_ACTIVATION {delay: 250, tolerance: 8},
│                                    shared config extracted from BattingOrderEditor
├── BattingOrderEditor.tsx    EDIT — import the shared activation constants
├── page.tsx                  EDIT — add a "Positions" link next to "View chart"
└── positions/
    ├── page.tsx              NEW  — server component: requireTeamAccess(read, COACH),
    │                                archived/empty-roster cards, error/saved messages,
    │                                sortRoster ordering, key-remount of the editor
    │                                (all mirroring chart/page.tsx)
    ├── PositionsEditor.tsx   NEW  — client: DndContext, diamond droppables, zone, form
    ├── actions.ts            NEW  — savePositionsAction
    └── *.test.tsx / *.test.ts

src/components/diamond-geometry.ts  NEW — POSITION_COORDS + DIAMOND_GEOMETRY moved out of
                                    view/Diamond.tsx so the editor shares one layout truth
```

**Editor rendering:** a `relative` container sized to the diamond's aspect ratio, the
diamond outline as the same inline SVG `<polygon>`, and **absolutely positioned HTML
droppable targets** at percentage coordinates derived from `POSITION_COORDS`. HTML
droppables (not SVG nodes) because dnd-kit measures via `getBoundingClientRect` and the
draggable chips are HTML transformed by dnd-kit — keeping both in HTML avoids SVG/CSS
transform interplay. The zone (Outfield or Bench/Dugout, per `allPlay`) is a single
droppable strip below/above the diamond holding pool chips.

**Collision detection:** `pointerWithin` with `rectIntersection` fallback. `pointerWithin`
gives the natural touch semantics — a drop on empty grass hits no droppable and is a no-op
(cancel), instead of `closestCenter` snapping every stray drop to the nearest base. The
fallback covers `KeyboardSensor`, which has no pointer.

**Keyboard:** `KeyboardSensor` with a small custom `coordinateGetter` that moves the
active chip between droppable rect centers in scorebook order (arrow keys cycle
positions → zone). `sortableKeyboardCoordinates` is sortable-list-specific and does not
apply here. The pure "which droppable is next" step lives in `chart.ts`
(`nextDroppableId`) so it's tested; the getter itself is a thin client shim. Tap-to-select
remains the future accessible path (Later, out of scope) — this keeps parity with #10's
keyboard support at low cost.

**No Motion anywhere on this page** — dnd-kit owns `transform` during drags (AGENTS.md).
No autosave; hidden inputs carry `teamId` and `JSON.stringify(draft.assigned)`; Cancel
resets to the loaded draft; both buttons disabled until dirty (`!samePositions`).

### View page (confirmed in scope)

- `src/lib/chart-view.ts` — `buildChartView` additionally returns
  `unassigned: ChartViewPlayer[]` (players with `position === null`, in input order).
  Pure, no `allPlay` knowledge needed here; the page decides rendering.
- `src/app/t/[teamId]/view/Diamond.tsx` — imports geometry from
  `src/components/diamond-geometry.ts`; accepts `allPlay` and `outfieldPool`. When
  `allPlay`: LF/CF/RF markers render only if actually occupied (stale data), never as
  "Open"; pool players render as a cluster of name chips across the outfield arc, and the
  sr-only list gains an "Outfield: …" entry. When `!allPlay`: unchanged (bench players
  stay off the diamond, as today).
- `src/app/t/[teamId]/view/page.tsx` — passes `team.allPlay` and the pool through.

## Key Decisions

### Decision 1: allPlay outfield persists as `position = null` (derived zone)

**Options considered:**
- A: Outfield zone is derived — infield persists named, everyone else `null`; LF/CF/RF
  never written under allPlay.
- B: Assign LF/CF/RF to the first three zone players, `null` for the rest.
- C: Keep nine named droppables under allPlay and overflow extras into a zone.

**Decision:** A.
**Rationale:** The unique `(teamId, position)` index makes "all remaining players hold
outfield" unrepresentable as named rows, and the brief (product-brief.md:94) describes the
outfield as one zone under allPlay, not three named spots. B invents distinctions the
coach never made and makes save non-idempotent with respect to the draft; C contradicts
the brief. A also makes the save write exactly what the draft shows. Confirmed with the
owner 2026-08-02.

### Decision 2: Sub-route `/t/[teamId]/chart/positions`, not a second section on `/chart`

**Options considered:** same-page stacked sections vs. a sibling sub-route.

**Decision:** Sub-route, with cross-links between the two editors (and to `/view`).
**Rationale:** Each drag surface gets a focused phone screen — a long page with two drag
surfaces makes scroll-vs-drag worse, which is the exact risk the TouchSensor delay exists
to manage. The existing `?error=` / `?saved=` handling on `/chart` also stays untouched
instead of needing namespacing across two forms. Confirmed with the owner 2026-08-02.

### Decision 3: View-page allPlay rendering is in this issue

**Options considered:** strict issue scope (chart/ + chart.ts only) vs. include the small
view-page update.

**Decision:** Include it (Phase 4).
**Rationale:** `allPlay` defaults to `true`, so the common case after this ships would
otherwise be a parent-facing diamond showing LF/CF/RF "Open" with outfield kids missing
entirely — and "where is my kid playing" is the app's core parent promise. Confirmed with
the owner 2026-08-02.

### Decision 4: Drops swap, mirroring #10

**Decision:** Dropping onto an occupied position swaps the two players.
**Rationale:** #10 established swap (never insert-and-shift) as this app's drag grammar
(`chart.ts` header comment, issue #10); two different behaviors across two adjacent
editors would be worse than either behavior alone. Swap also never creates a duplicate
position in the draft, so the client structurally cannot submit one.

### Decision 5: Partial position charts are valid; no "missing-players" analog

**Decision:** `validatePositions` does not require every droppable filled.
**Rationale:** "No chart set yet" and partially-entered charts are real product states
(#8's `hasChart`, the #9 hand-entry weekend). Under allPlay a roster can be smaller than
six; and an unfilled infield spot still satisfies "every kid plays" — they're all in the
outfield. The batting order's `missing-players` rule guards a different invariant
(everyone *bats*) that has no positional counterpart.

## Security & Permissions

- Page: `requireTeamAccess(teamId, { intent: "read", minRole: "COACH" })`;
  `TeamAccessError` → `notFound()` so a pasted URL 404s for parents. Nothing links here
  for them.
- Action: `requireTeamAccess(teamId, { intent: "write", minRole: "COACH" })` inside the
  action — proxy.ts stays optimistic-only, untouched.
- Archived teams (`archivedAt` non-null) reject writes for every role via
  `requireTeamAccess`; the page renders the same read-only card as `/chart`.
- Phase-2 updates carry `teamId` in the where clause — a forged entryId from another team
  matches no row, throws `P2025`, and rolls back the transaction.

## Error Handling

Same shape as #10: the action redirects to `?error=<code>`; the page maps codes to
messages via an `ERROR_MESSAGES` record.

| Code | Source | Meaning |
|---|---|---|
| `invalid-positions` | Zod/JSON parse | Payload unreadable — reload |
| `unknown-entry` | `validatePositions` | Roster changed mid-edit |
| `duplicate-entry` | `validatePositions` | Same player at two positions (forged/raced payload) |
| `invalid-position` | `validatePositions` | Not a position, or a named outfield spot submitted under allPlay (settings toggled mid-edit) |
| `roster-changed` | `chartWriteFailure` (P2025) | Entry deleted between load and save; transaction rolled back |
| `position-conflict` | `chartWriteFailure` (P2002 on position) | Defensive — should be unreachable given the two-phase write |
| `access` | `TeamAccessError` | Role/archive state changed |

`savePositions` propagates database errors (mutations never swallow, per roster.ts's
header); the action translates known shapes and rethrows the rest.

## Testing Strategy

| Layer | Test Type | File(s) | Notes |
|---|---|---|---|
| Pure draft + validation | Unit | `src/lib/chart.test.ts` | buildPositionsDraft (incl. stale-outfield-under-allPlay), placeAtPosition swap matrix, unassign, resolvePositionDrop, validatePositions reasons, chartWriteFailure position branch, nextDroppableId |
| View model | Unit | `src/lib/chart-view.test.ts` | `unassigned` derivation, existing behavior unchanged |
| Editor component | Unit (jsdom) | `chart/positions/PositionsEditor.test.tsx` | Render per allPlay mode (6 vs 9 droppables, zone label), dirty-gating of Cancel/Save, hidden-input payload, no RSVP props exist — real drags can't run in jsdom, which is exactly why the logic lives in chart.ts (same rationale as #10) |
| Page | Unit (jsdom) | `chart/positions/page.test.tsx` | Access gate → notFound, archived card, empty-roster card, error/saved messages, roster ordering |
| Action | Unit | `chart/positions/actions.test.ts` | Mirrors `chart/actions.test.ts`: parse failures, validation redirects, failure translation |
| View diamond | Unit (jsdom) | `view/Diamond.test.tsx` | allPlay: no "Open" outfield markers, pool cluster renders + sr-only entry, geometry/no-clip invariants still hold |

## Config Changes

- [ ] Schema / index changes — **none** (deliberately; Decision 16)
- [ ] Access rule changes — none (existing `requireTeamAccess` covers it)
- [ ] Environment variables — none
- [ ] Dependency changes — none (`@dnd-kit/core` already installed)
- [ ] Docs — AGENTS.md's route list gains `chart/positions` (done at finalize, per repo habit)

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| Editor slips (the brief's carried risk — "most likely to slip") | High | Fallback pre-planned: cut the diamond to a dropdown-per-position form on the same route reusing `validatePositions`/`savePositions` unchanged; #10's editor is a separate page and stays untouched |
| Transient duplicate position during save | High | Two-phase write inside one transaction (phase 1 nulls, phase 2 writes) |
| allPlay toggled or roster edited mid-edit | Med | Action re-loads team + roster and validates fresh; `invalid-position` / `unknown-entry` / P2025 → explicit reload messages, nothing partially written |
| Stale LF/CF/RF rows under allPlay | Med | Draft pools them visibly before save; Save collapses them to null — permanent, consistent with "chart edits are permanent" |
| Drop on empty grass | Low | `pointerWithin` → no droppable → no-op, drag cancels |
| Scroll-vs-drag on a phone | Med | Shared TouchSensor `{delay: 250, tolerance: 8}` from #10 (Decision 10) |
| Motion/dnd-kit transform fight | High | No Motion imports anywhere on the editor page (AGENTS.md) |
| P2002 `meta.target` shape unverified on live Postgres | Low | Same duck-typing + both-shapes matching as `chartWriteFailure`/`rosterWriteFailure`; caveat already documented in AGENTS.md |
