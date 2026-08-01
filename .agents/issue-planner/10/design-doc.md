# Design Doc — Phase 10: Batting order editor (dnd-kit sortable) (#10)

## Overview

The coach needs to set the team's standing batting order on a phone, by dragging, instead
of hand-editing `RosterEntry.battingOrder` in `pnpm db:studio` (the #9 workaround). This
builds the first of the two drag surfaces: a `@dnd-kit/sortable` list over the team's
roster entries, persisted by a two-phase transactional write that respects the
non-deferrable `RosterEntry_teamId_battingOrder_key` unique index.

## Acceptance Criteria

From the issue's task list, plus clarifications discovered during exploration:

- [ ] Sortable list built with `@dnd-kit/sortable` over the team's `RosterEntry` rows
- [ ] `TouchSensor` configured with `activationConstraint: { delay, tolerance }` so page
      scrolling never starts a drag (Decision 10 — this is a product requirement)
- [ ] `allPlay = true` → every rostered player gets a slot (1..N);
      `allPlay = false` → exactly `min(9, rosterSize)` slots, the rest unassigned (null)
- [ ] Dropping onto an occupied slot **swaps** the two players (not insert-and-shift)
- [ ] Explicit Cancel / Save — no autosave; Cancel restores the loaded snapshot
- [ ] Save runs as a two-phase write inside `db.$transaction`: null every `battingOrder`
      for the team, then write final values
- [ ] Pure ordering/swap logic lives in `src/lib/chart.ts` with co-located tests,
      separate from the DOM
- [ ] RSVP state never filters the list — declined / no-response players stay placeable
- [ ] Coach-and-above only; archived teams reject the write (via `requireTeamAccess`)
- [ ] `pnpm check` green; `pnpm build` verified

## Architecture & Data Model

### Data Layer

**No schema change.** `battingOrder Int?` already exists on `RosterEntry`
(`prisma/schema.prisma:163`) with `@@unique([teamId, battingOrder])` (line 174). Null
means benched — exactly how `allPlay = false` expresses a bench (Decision 16).

Two data-layer changes, both in `src/lib/roster.ts` (the one place audited for `teamId`
scoping, per AGENTS.md):

1. **`getChart` gains `entryId`.** It currently selects only `playerId`, but the save
   must key on `RosterEntry.id` (the roster spot, not the global person). Add `id: true`
   to the select and `entryId: string` to `ChartViewEntry` in `src/lib/chart-view.ts`.
   The view page ignores the new field; one chart read serves both pages.

2. **`saveBattingOrder(teamId, orderedEntryIds)`** — the first write of a chart column.
   Update roster.ts's header comment (which currently says these columns "are never
   written here; they belong to #10 and #11").

### The two-phase transactional write (the trap)

`RosterEntry_teamId_battingOrder_key` was created via `CREATE UNIQUE INDEX`
(`prisma/migrations/20260728053521_001/migration.sql:193`), which Postgres cannot make
`DEFERRABLE`. Any per-row update sequence that transiently duplicates a value throws
`P2002` mid-transaction. So:

```ts
export async function saveBattingOrder(
  teamId: string,
  orderedEntryIds: readonly string[],
): Promise<void> {
  await db.$transaction([
    // Phase 1: clear the whole team's order — no transient duplicates possible.
    db.rosterEntry.updateMany({
      where: { teamId },
      data: { battingOrder: null },
    }),
    // Phase 2: write final values. `update` (not updateMany) so a stale id
    // throws P2025 and rolls the whole transaction back.
    ...orderedEntryIds.map((entryId, index) =>
      db.rosterEntry.update({
        where: { id: entryId, teamId },
        data: { battingOrder: index + 1 },
      }),
    ),
  ]);
}
```

Notes:
- **Array-form `$transaction`, not interactive.** The statements are known up front and
  run sequentially in one transaction; no callback needed. (Contrast
  `addReturningPlayer`, which needs reads mid-transaction.)
- **Every phase-2 `update` carries `teamId` in the where clause** — the same
  cross-team-forgery guard `requireRosterEntry` documents in roster/actions.ts. A forged
  `entryId` belonging to another team fails with P2025 instead of writing.
- **A stale `entryId`** (player removed in another tab between load and save) throws
  P2025, rolls everything back, and surfaces as `?error=roster-changed`. Silently
  skipping would save a lineup with holes the coach never saw.
- Unassigned players need no phase-2 statement — phase 1 already nulled them.

### Pure logic — `src/lib/chart.ts` (new)

Pure, DB-free, DOM-free; the pattern of `chart-view.ts` / `roster-rules.ts`. The draft
model is a fixed array of slots plus an unassigned pool, both holding entry ids:

```ts
export type BattingDraft = {
  /// slots[i] is the entry in batting slot i+1; null = empty slot.
  slots: (string | null)[];
  /// Rostered entries with no slot. Empty when allPlay is true.
  unassigned: string[];
};

/// min(9, rosterSize) when allPlay is false; rosterSize when true.
export function slotCount(rosterSize: number, allPlay: boolean): number;

/// Initial draft from current battingOrder values. Sorts assigned entries by
/// battingOrder and packs them densely into slots 1..k (hand-set data from #9
/// may be sparse — 1,2,5 — or longer than 9 if allPlay was toggled off after
/// the order was set; overflow beyond slotCount goes to `unassigned`).
export function buildBattingDraft(
  entries: readonly { entryId: string; battingOrder: number | null }[],
  allPlay: boolean,
): BattingDraft;

/// The one mutation the UI performs. Dropping entry E onto slot i:
///   - E was in slot j → slots i and j SWAP (issue requirement — not arrayMove).
///   - E was unassigned, slot i occupied by F → E takes slot i, F becomes
///     unassigned (still a swap: they exchange places).
///   - E was unassigned, slot i empty → E takes slot i.
/// Dropping E onto the unassigned area: E leaves its slot (allPlay=false only).
/// Returns a new draft; never mutates.
export function placeInSlot(draft: BattingDraft, entryId: string, slot: number): BattingDraft;
export function unassign(draft: BattingDraft, entryId: string): BattingDraft;

/// Serialize for the action: ordered entry ids, empty slots compacted out?
/// NO — slots map 1:1 to battingOrder, so empty slots are simply absent:
/// the payload is [{ entryId, battingOrder }] for occupied slots only,
/// transmitted as the ordered id list with nulls filtered? See Decision 4.
export function draftToOrderedIds(draft: BattingDraft): (string | null)[];

/// Server-side validation, shared shape with the client:
/// ids unique, every id ∈ roster, length ≤ slotCount(rosterSize, allPlay),
/// and when allPlay is true every rostered entry is present.
export function validateBattingOrder(
  orderedIds: readonly (string | null)[],
  rosterEntryIds: readonly string[],
  allPlay: boolean,
): { ok: true; assignments: { entryId: string; battingOrder: number }[] }
 | { ok: false; reason: "unknown-entry" | "duplicate-entry" | "too-many-slots" | "missing-players" };
```

`hasUnsavedChanges(draft, original)` (or an equality helper) drives Save/Cancel
enablement.

### API / Service Layer

| Endpoint / Function | Type | Auth | Purpose |
|---|---|---|---|
| `saveBattingOrderAction` in `src/app/t/[teamId]/chart/actions.ts` | Server Action (FormData) | `requireTeamAccess(teamId, { intent: "write", minRole: "COACH" })` | Validate + persist the order |
| `saveBattingOrder` in `src/lib/roster.ts` | Internal | caller pre-authorizes | Two-phase transactional write |
| `getChart` in `src/lib/roster.ts` (extended) | Internal | caller pre-authorizes | Chart read, now with `entryId` |

Action flow (mirrors roster/actions.ts exactly — extractTeamId, Zod parse,
`unstable_rethrow`, redirect-with-error-code):

1. `extractTeamId(formData)`; parse `order` field — a JSON array of `(string | null)`,
   validated by Zod (`z.array(z.string().min(1).nullable()).max(30)`).
2. `requireTeamAccess(teamId, { intent: "write", minRole: "COACH" })`.
3. Load current roster ids and `team.allPlay` **inside the action** (not trusted from
   the form) and run `validateBattingOrder`. Failure → `?error=<reason>`; the
   `missing-players`/`too-many-slots` cases also catch an `allPlay` toggle that raced
   the edit.
4. `saveBattingOrder(teamId, orderedIds)`. P2025 → `?error=roster-changed`. P2002
   should be impossible given the two-phase write, but translate it defensively via a
   small chart-specific mapper (mirroring `rosterWriteFailure`) rather than 500ing —
   the P2002 `meta.target` shape is still unverified against live Postgres (see
   roster-rules.ts's caveat).
5. `revalidatePath` for `/t/[teamId]/chart` and `/t/[teamId]/view`; redirect to
   `/t/${teamId}/chart?saved=1`.

### UI Component Tree

```
src/app/t/[teamId]/chart/
├── page.tsx              # Server: requireTeamAccess(read, minRole COACH),
│                         #   getChart + team.allPlay, renders header + editor.
│                         #   Archived team → editor rendered disabled with notice.
├── BattingOrderEditor.tsx  # "use client". DndContext + SortableContext.
│                         #   Local draft state (BattingDraft), Save/Cancel bar,
│                         #   hidden <form> posting teamId + JSON order.
├── actions.ts            # saveBattingOrderAction
├── page.test.tsx
├── BattingOrderEditor.test.tsx
└── actions.test.ts
```

dnd-kit specifics:

- **Sensors:** `TouchSensor` with `activationConstraint: { delay: 250, tolerance: 8 }`;
  `PointerSensor`/`MouseSensor` with `activationConstraint: { distance: 5 }` for desktop;
  `KeyboardSensor` with `sortableKeyboardCoordinates` for accessibility.
- **Swap semantics:** `rectSwappingStrategy` from `@dnd-kit/sortable` previews a swap
  during the drag, and `onDragEnd` calls `placeInSlot` — never `arrayMove`.
- **Slots are the sortable items** when `allPlay = false`: `slotCount` slot cells (some
  empty) in a `SortableContext`, plus an unassigned droppable region beneath. When
  `allPlay = true` there is no unassigned region and every slot is occupied.
- **No Motion `layout` prop anywhere in the sortable tree** (AGENTS.md; Reveal.tsx's
  docstring already warns about this). dnd-kit's own `transition` handles drag settling.
  The page may keep a top-level `Reveal` wrapper — a mount-only `y` animation on a
  non-sortable ancestor doesn't touch drag transforms — but the safest default is to
  omit Motion from this page entirely and let #11 revisit.
- Read `node_modules/next/dist/docs/` (Next 16 conventions) and the installed
  `@dnd-kit` package docs before writing the component — per AGENTS.md, training-data
  conventions may be stale.

**Entry point:** team home (`src/app/t/[teamId]/page.tsx`) already branches on `role`
for the settings button; add an "Edit chart" button there for `COACH`/`OWNER`, linking
to `/t/${teamId}/chart`. The view page stays role-free (its docstring says nothing there
is role-gated) — don't add a coach link to it in this issue.

## Key Decisions

### Decision 1: Where the write lives — `src/lib/roster.ts`, not a new module

**Options considered:**
- Option A: `saveBattingOrder` in `src/lib/roster.ts` next to `getChart`
- Option B: a new `src/lib/chart-data.ts` thin wrapper

**Decision:** Option A.
**Rationale:** AGENTS.md's rule is "scoped queries go through `src/lib/` so there is one
place to audit for `teamId` filtering" — roster.ts is already the audit point for every
`RosterEntry` read and write, and `getChart` already lives there. A second module holding
one function splits that audit surface. The header comment in roster.ts explicitly
anticipates this ("they belong to #10 and #11") and gets updated. `src/lib/chart.ts`
stays 100% pure per the issue's scope line.

### Decision 2: Swap, not insert — `rectSwappingStrategy` + `placeInSlot`

**Options considered:**
- Option A: standard sortable insert (`arrayMove`) — what most dnd-kit examples do
- Option B: swap the source and target slots, per the issue

**Decision:** Option B (issue requirement).
**Rationale:** The issue states it outright. Swap also composes with the
`allPlay = false` bench: "unassigned player dropped on an occupied slot" and "slot player
dropped on another slot" are the same exchange operation, so `placeInSlot` is one pure
function with exhaustive tests instead of two behaviors. dnd-kit ships
`rectSwappingStrategy` for exactly this preview.

### Decision 3: Save payload is a JSON-encoded ordered id array in FormData

**Options considered:**
- Option A: hidden form field `order` = JSON array of entry ids (null for empty slots),
  posted through the existing FormData + redirect-with-error-code pattern
- Option B: call the server action with typed arguments from `startTransition` and
  return structured results (`useActionState`)

**Decision:** Option A.
**Rationale:** Every existing mutation in the repo (roster, schedule) is a FormData
action ending in `redirect(...?error=code)` — the error-display machinery on pages
already reads search params. One JSON field is a smaller deviation than a new
call-convention and result-rendering pattern; Zod validates the parsed array exactly as
`playerSchema` validates form fields. `battingOrder` values are derived server-side from
array position (index + 1), never trusted from the client.

### Decision 4: Stale roster fails the save loudly

**Options considered:**
- Option A: skip ids that no longer exist (updateMany, check counts, carry on)
- Option B: let `update` throw P2025, roll back, redirect `?error=roster-changed`

**Decision:** Option B.
**Rationale:** A skipped id means the coach saves a lineup that differs from the one on
screen — a silent wrong write in an app whose chart edits are permanent by design. The
transaction already gives rollback for free; the page reloads fresh data after the
redirect. Matches the repo's stated posture: "a write that silently fails and still
looks like it succeeded is worse than one that throws" (roster.ts).

### Decision 5: Normalize sparse hand-set data on load, dense 1..k on save

**Options considered:**
- Option A: preserve raw battingOrder values (gaps, >9 overflow) in the editor
- Option B: pack existing entries densely into slots on load; every save rewrites the
  team's full order as 1..k

**Decision:** Option B.
**Rationale:** #9 seeded `battingOrder` by hand in Studio, so 1,2,5 gaps or 12 assigned
players on a team later toggled to `allPlay = false` are real possibilities. The editor
is a full-order editor — phase 1 of the save nulls everything regardless — so dense
packing on load shows the coach exactly what a save would persist. Overflow beyond
`slotCount` lands in the unassigned pool visibly, before any write happens.

## Security & Permissions

- **Page:** `requireTeamAccess(teamId, { intent: "read", minRole: "COACH" })` —
  `TeamAccessError` → `notFound()`, the established pattern. Parents keep
  `/t/[teamId]/view`; this editor is not linked or accessible for them.
- **Action:** `requireTeamAccess(teamId, { intent: "write", minRole: "COACH" })` — which
  also rejects archived teams for every role, owner included.
- **Cross-team forgery:** entry ids come from the client, so every phase-2 update is
  scoped `where: { id, teamId }` and `validateBattingOrder` checks ids against the
  roster loaded server-side. A foreign or fabricated id fails validation (or P2025), and
  the transaction rolls back.
- Proxy stays untouched — it remains optimistic cookie-check only.

## Error Handling

| Failure | Layer | Surfaced as |
|---|---|---|
| Not coach / archived team | action (`TeamAccessError`) | `?error=access` |
| Malformed `order` JSON / Zod reject | action | `?error=invalid-order` |
| Unknown/duplicate id, wrong slot count, missing players (incl. raced `allPlay` toggle) | `validateBattingOrder` | `?error=<reason>` |
| Entry deleted mid-edit (P2025) | `saveBattingOrder` | `?error=roster-changed` |
| P2002 (defensive; should be unreachable) | chart failure mapper | `?error=order-conflict` |
| Database outage | propagates (fail loud, per roster.ts contract) | Next error boundary |

Page renders error banners from search params, same as roster/schedule pages.

## Testing Strategy

| Layer | Test Type | File(s) | Notes |
|---|---|---|---|
| Pure draft logic | Unit (node) | `src/lib/chart.ts` → `src/lib/chart.test.ts` | Exhaustive: slotCount, sparse/overflow init, all placeInSlot branches, unassign, validate |
| Data write | Unit, mocked db | `src/lib/roster.test.ts` (extend) | Follow the existing `vi.mock("./db")` pattern; assert phase-1 updateMany precedes per-id updates, all scoped by teamId, array-form `$transaction` |
| Server action | Unit, mocked lib | `src/app/t/[teamId]/chart/actions.test.ts` | Mirror roster `actions.test.ts`: access rejection, Zod rejection, validation reasons, P2025 mapping, revalidate + redirect targets |
| Editor component | Unit (jsdom + RTL) | `BattingOrderEditor.test.tsx` | Render slots/pool from props, Save disabled until dirty, Cancel restores snapshot, form posts JSON payload. **No simulated drags** — jsdom can't do real pointer geometry; the drag *outcome* is `placeInSlot`, already exhaustively tested. Wire `onDragEnd` thinly. |
| Page | Unit (jsdom) | `page.test.tsx` | Coach gate (notFound for parent), archived renders read-only notice, empty-roster empty state |

## Config Changes

- [ ] Schema / index changes — **none** (columns and unique index already exist)
- [ ] Access rule changes — none (existing `requireTeamAccess` with `minRole: "COACH"`)
- [ ] Environment variables — none
- [ ] Dependency changes — none (`@dnd-kit/{core,sortable,utilities}` already installed)

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| Transient unique violation on save | High | Two-phase write in one transaction (the issue's stated trap) |
| Page scroll starts a drag on a phone | High (product req.) | `TouchSensor` `activationConstraint: { delay: 250, tolerance: 8 }`; verify on a real phone before closing |
| Motion `layout` fights dnd-kit transforms | Med | No Motion inside the sortable tree; dnd-kit `transition` for settling |
| Hand-set sparse orders (1,2,5) or >9 assigned after `allPlay` toggle | Med | Dense pack on load; overflow to unassigned pool, visible before save (Decision 5) |
| Player removed in another tab mid-edit | Med | P2025 → rollback → `?error=roster-changed` (Decision 4) |
| `allPlay` toggled mid-edit | Low | Validation re-reads `team.allPlay` in the action; mismatch fails as `too-many-slots` / `missing-players` |
| RSVP filtering creeping in | Med (explicit non-goal) | Editor reads roster + chart only; it never loads RSVPs at all |
| Roster < 9 with `allPlay = false` | Low | `slotCount = min(9, rosterSize)`; empty roster renders an empty state linking to `/roster` |
| P2002 `meta.target` shape unverified on live Postgres | Low | Defensive mapper mirrors `rosterWriteFailure`'s dual-shape matching; carry roster-rules.ts's caveat forward |
