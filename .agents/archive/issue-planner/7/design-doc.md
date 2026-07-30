# Design Doc — Phase 7: RSVP with tri-state semantics (#7)

## Overview

Parents toggle attendance per kid per event, restricted to kids they guard. This phase
establishes the three-state RSVP model — **attending, declined, and no-response are
distinct** — as a pure module whose exported type is the contract consumed by #8 (view
page) and #12 (readiness), plus the guarded server action and the schedule UI that
surfaces the states. RSVP is reporting, never a gate: nothing downstream may filter
roster or chart placement by it.

## Acceptance Criteria

Copied from the issue task list; no clarifications were needed — the issue fixes the
type shape, the derivation rules, the upsert target, and the guardian rule explicitly.

- [ ] Pure `src/lib/rsvp.ts` exports `type RsvpState = "attending" | "declined" | "no-response"`
- [ ] `deriveRsvpState(row)` — no row → `no-response`; `attending: true` → `attending`; `attending: false` → `declined`
- [ ] A helper builds a `Map` for one event across a roster, defaulting every unrepresented player to `no-response`
- [ ] Co-located tests in `src/lib/rsvp.test.ts` cover all three states and the empty-roster case
- [ ] RSVP toggle server action upserts on `@@unique([eventId, playerId])`
- [ ] The toggle is restricted to players the caller guards via `GuardianPlayer` — a parent may never RSVP for another family's kid
- [ ] RSVPs work on practices as well as games
- [ ] The schedule UI surfaces all three states, with `no-response` visually distinct from `declined`
- [ ] `pnpm check` green
- [ ] `pnpm build` green

## Architecture & Data Model

### Data Layer

**No schema change.** `Rsvp` (prisma/schema.prisma:219-231) already encodes the model:
`attending` is a non-null `Boolean`, and the **absence of a row is the third state**.
`@@unique([eventId, playerId])` is the upsert target. `GuardianPlayer`
(prisma/schema.prisma:99-108) is the family link the write guard reads.

Two new/changed modules in `src/lib/`:

1. **`src/lib/rsvp.ts` (new, pure, DB-free)** — the contract module.

   ```ts
   export type RsvpState = "attending" | "declined" | "no-response";

   /// The one field of Rsvp the derivation needs; structural so tests and
   /// callers never import the generated client.
   export type RsvpRow = { playerId: string; attending: boolean };

   export function deriveRsvpState(
     row: { attending: boolean } | undefined,
   ): RsvpState;

   /// One event across a roster: every rostered player gets an entry, players
   /// with no Rsvp row default to "no-response". Rows for players NOT in
   /// `playerIds` (e.g. a kid removed from the roster after RSVPing) are
   /// excluded — the map answers "where does this roster stand", not "what
   /// rows exist".
   export function buildRsvpStateMap(
     playerIds: readonly string[],
     rows: readonly RsvpRow[],
   ): Map<string, RsvpState>;
   ```

   #12 derives its `attending: ReadonlySet<string>` input for `computeReadiness`
   (src/lib/readiness.ts:38-41) by filtering this map for `"attending"` — the shapes
   already line up, no rework needed there.

2. **`src/lib/rsvps.ts` (new, thin data wrapper)** — team-scoped reads/writes, mirroring
   the calendar/schedule and roster-rules/roster split (pure decision next door to a
   thin Prisma wrapper). Every function takes `teamId` in the where clause, same
   argument as schedule.ts's module docstring.

   ```ts
   /// Rsvp rows for one event, scoped through the event's team.
   /// DOES NOT swallow database errors: an empty result is a meaningful
   /// product state here ("nobody has responded"), so a caught outage would
   /// silently assert that every family is silent — the same argument that
   /// keeps nextGame in schedule.ts from swallowing.
   export async function listEventRsvps(teamId: string, eventId: string): Promise<RsvpRow[]>;

   /// Player IDs the user guards that are ALSO rostered on this team.
   /// Serves both the page (which toggles to render) and the action (may this
   /// caller write this playerId).
   export async function guardedRosteredPlayerIds(teamId: string, userId: string): Promise<Set<string>>;

   /// Upsert on the eventId_playerId unique. Caller has already proven the
   /// event belongs to the team (getEvent) and the caller guards the player.
   export async function upsertRsvp(eventId: string, playerId: string, attending: boolean): Promise<void>;
   ```

### API / Service Layer

| Endpoint / Function | Type | Auth | Purpose |
|---|---|---|---|
| `rsvpAction` in `src/app/t/[teamId]/schedule/actions.ts` | Server Action | Any member (PARENT+), write intent, plus guardian check | Upsert one player's RSVP for one event |
| `listEventRsvps` | Internal (`src/lib/rsvps.ts`) | Called after `requireTeamAccess` | Load rows for the event detail page |
| `guardedRosteredPlayerIds` | Internal (`src/lib/rsvps.ts`) | Called after `requireTeamAccess` | Which toggles to render / whether the write is allowed |
| `upsertRsvp` | Internal (`src/lib/rsvps.ts`) | Called only from `rsvpAction` after all checks | The write |

Action flow (mirrors `updateEventAction`'s shape at
src/app/t/[teamId]/schedule/actions.ts:169-192):

1. Extract `teamId`, `eventId`, `playerId`, `response` from FormData; validate
   `response` with `z.enum(["attending", "declined"])`.
2. `requireTeamAccess(teamId, { intent: "write" })` — **no `minRole`**, parents are the
   primary writers; `intent: "write"` makes archived teams reject every RSVP for every
   role, per the archived-team rule.
3. `getEvent(teamId, eventId)` — proves the event named in the form belongs to the team
   in the URL; null → redirect back to the schedule. (The existing `requireEvent` helper
   is not reused as-is because it hard-codes `minRole: "COACH"`.)
4. `guardedRosteredPlayerIds(teamId, userId)` must contain `playerId` — otherwise
   redirect with `?error=not-your-player`.
5. `upsertRsvp(eventId, playerId, response === "attending")`.
6. `revalidatePath` for the schedule and event pages, redirect back to the event page.

Errors follow the established catch shape: `unstable_rethrow` first, then
`TeamAccessError` → `?error=access`, then rethrow.

### UI Component Tree

All on the existing event detail page `src/app/t/[teamId]/schedule/[eventId]/page.tsx`
(server component, no client JS needed — plain forms, matching the rest of the app):

- **Attendance card** (new, games AND practices):
  - One row per rostered player (via existing `getRoster`), showing name + state badge:
    - `attending` — affirmative style (e.g. "Going")
    - `declined` — destructive style (e.g. "Not going")
    - `no-response` — muted style (e.g. "No response"), visually distinct from declined
  - For players in `guardedRosteredPlayerIds`: two submit buttons ("Going" / "Not going")
    posting `rsvpAction`, current choice shown as active.

The schedule list/month page is unchanged in this phase; per-event attendance summaries
belong to #8's view page if wanted.

## Key Decisions

### Decision 1: Where the thin data wrapper lives — new `src/lib/rsvps.ts`

**Options considered:**
- Option A: New `src/lib/rsvps.ts` next to the pure `rsvp.ts`
- Option B: Extend `src/lib/schedule.ts` (RSVPs hang off events)
- Option C: Name it `attendance.ts` to avoid the one-letter difference from `rsvp.ts`

**Decision:** Option A.
**Rationale:** The repo's pattern is a pure module beside a thin wrapper
(calendar/schedule, roster-rules/roster, directory-rules/memberships). schedule.ts's
docstring is a carefully argued contract about *event* reads and writes; folding in
guardian queries would stretch it. `attendance.ts` introduces a second vocabulary for a
thing the schema, the issue, and #8/#12 all call RSVP. The near-identical names are
mitigated by module docstrings stating the split on line 1 of each.

### Decision 2: The write guard is guardian **and** rostered-on-this-team

**Options considered:**
- Option A: Check `GuardianPlayer` only (the issue's literal wording)
- Option B: Check `GuardianPlayer` AND `RosterEntry(playerId, teamId)`

**Decision:** Option B.
**Rationale:** `GuardianPlayer` is global by design (Decision 15), so the guardian check
alone would let a parent who is a member of team A RSVP their team-B-only kid onto a
team-A event — a cross-team write, the exact class of bug the "every function takes
teamId" rule exists to prevent. One query answers both facts. This also keeps stale
rows out: the UI only offers toggles for rostered kids, and `buildRsvpStateMap` excludes
non-roster rows on read.

### Decision 3: No path back to `no-response`

**Options considered:**
- Option A: Upsert only — parents can flip between attending and declined
- Option B: Also offer "clear my response" (delete the row)

**Decision:** Option A.
**Rationale:** `no-response` means "this family has not said", which is information the
coach reads (#12 treats non-attending as absent either way). Deleting a row would
manufacture silence out of an answer. Nothing in the issue asks for it, and the upsert
task names exactly two written states. A delete path can be a follow-up if it ever
matters.

### Decision 4: No coach override

**Options considered:**
- Option A: Guardian-only for every role, coaches included
- Option B: COACH+ may RSVP for any rostered player

**Decision:** Option A.
**Rationale:** The issue's rule is absolute ("a parent may never RSVP for another
family's kid") and grants no exception. A coach who is also a guardian still toggles
their own kids through the same door. The coach's tool for a kid whose family went
silent is the readiness view (#12), not writing attendance on their behalf. If a
verbal-RSVP override is wanted later it is a deliberate product change, not this phase.

### Decision 5: RSVP UI lives on the event detail page only

**Options considered:**
- Option A: Attendance card on `/t/[teamId]/schedule/[eventId]`
- Option B: Also inline toggles / counts on the schedule list view

**Decision:** Option A.
**Rationale:** The detail page is where one event's full context already renders, the
roster list fits a card there, and the list view stays one query per render (its
docstring guards query cost on "a phone on one bar of signal"). Per-event summaries on
the list are #8 territory.

### Decision 6: Past events accept RSVPs

Writes are not blocked by event time. Readiness reads only the next game, so a late
RSVP on a past event is inert record-keeping; blocking it would add a clock edge (which
"now"? grace windows?) for no product gain. Consistent with the app's
chart-edits-are-permanent philosophy of trusting the one coach and their families.

## Security & Permissions

- **Route access:** any team member reads the event page (existing `intent: "read"`).
- **Write access:** `requireTeamAccess(teamId, { intent: "write" })` — PARENT is enough,
  archived teams reject all roles.
- **Record scoping:** `getEvent(teamId, eventId)` proves the form's event is on the
  URL's team; `guardedRosteredPlayerIds` proves the form's player is guarded by the
  caller *and* rostered on the team. Both run inside the action, after
  `requireTeamAccess`, because only the action knows which rows it is about to write —
  same argument as `requireEvent` / `requireRosterEntry`.
- The guardian check is enforced server-side; hiding toggles in the UI is cosmetic.

## Error Handling

- `rsvp.ts` is pure — no errors, total functions.
- `rsvps.ts` reads do **not** swallow database errors (see module sketch above): the
  empty result is a meaningful state, so an outage must fail loudly, matching
  `nextGame`'s rationale in schedule.ts. Writes propagate as every mutation does.
- Action: `unstable_rethrow` first in the catch; `TeamAccessError` → `?error=access`;
  unguarded player → `?error=not-your-player`; invalid form → `?error=invalid-rsvp`;
  unknown event → redirect to the schedule. Messages join the page's existing
  `ERROR_MESSAGES` map.
- Upsert race (two tabs, same family): Prisma upsert can surface `P2002` under a true
  race. Accepted as out of scope — the writer set for one (eventId, playerId) is one
  family, the window is milliseconds, and a retry would land on the same row.

## Testing Strategy

| Layer | Test Type | File(s) | Notes |
|---|---|---|---|
| Pure derivation | Unit | `src/lib/rsvp.test.ts` | Three states; map defaults every unrepresented player; empty roster → empty map; non-roster row excluded |
| Data wrapper | Unit (mocked `db`) | `src/lib/rsvps.test.ts` | Where clauses carry `teamId` / event-team scoping; upsert targets `eventId_playerId`; guarded set intersects guardianship with roster |
| Server action | Unit (mocked libs) | `src/app/t/[teamId]/schedule/actions.test.ts` | Success redirect; unguarded player rejected; archived → `?error=access`; invalid response value; event on other team rejected — mirror the file's existing mock style |
| Page | Unit (render) | `src/app/t/[teamId]/schedule/[eventId]/page.test.tsx` | All three badges render distinctly; toggles only for guarded players; practices get the card too |

## Config Changes

- [ ] Schema / index changes — none. `Rsvp` and its unique already exist; `@@index([playerId])` covers the guardian-side lookups and `@@unique([eventId, playerId])` covers the event-side read.
- [ ] Access rule changes — none beyond the in-action checks described above.
- [ ] Environment variables — none.
- [ ] Dependency changes — none.

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| Parent RSVPs a kid not on this team (cross-team write) | High | Decision 2 — roster check joined into the guard |
| RSVP state leaks into chart authoring as a filter (#10/#11) | High | Contract documented here and in `rsvp.ts`'s docstring: RSVP is reporting, never a gate. Nothing in this phase exports a "filter roster by RSVP" helper |
| Kid removed from roster after RSVPing | Low | Stale row excluded by `buildRsvpStateMap`; row itself is harmless and dies with the event (cascade) |
| Outage read as "nobody responded" | Med | `listEventRsvps` propagates instead of swallowing |
| `no-response` and `declined` visually conflated | Med | Explicit AC; distinct badge styles + distinct labels, asserted in page test |
| Upsert `P2002` under a same-family race | Low | Accepted; see Error Handling |
