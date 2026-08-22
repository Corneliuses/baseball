# Design Doc — Coach-recorded absences: let staff set a player's RSVP on their behalf (#54)

## Overview

When a parent texts "Mason's out Saturday," the coach currently has nowhere to record it:
`requireGuardedEvent` rejects any caller who doesn't guard the player, so readiness keeps
counting Mason as "No response." This change lets COACH+ set (and clear) any rostered
player's RSVP from the event page, marks staff-recorded responses visibly, and keeps the
family as the owner of the state via plain last-write-wins.

## Acceptance Criteria

- [ ] A coach can mark any rostered player Going / Not going / clear on any open event, from the event page
- [ ] A staff-recorded response is visually distinguishable from a family-recorded one
- [ ] A guardian's own tap overwrites a coach entry (and vice versa) with no special casing
- [ ] Parents still cannot set other families' RSVPs; archived teams and past events still reject all writes
- [ ] Readiness reflects coach-recorded absences immediately

Clarifications recorded here (no issue comments existed to draw on):

- "Any open event" means the same policy the event page already applies to guardians:
  the event page deliberately accepts a late answer (see the comment in
  `requireGuardedEvent`, `src/app/t/[teamId]/schedule/actions.ts:302-313`) — a coach
  recording "Mason's out" at 9:15 for the 9:00 game is exactly the texting habit this
  replaces. The `from=home` started-event gate is untouched, and team home grows no coach
  controls, so no new grace-window write surface opens. "Past events reject writes" in
  AC4 therefore refers to the existing home-origin gate and to archived teams, which
  reject every write in `checkTeamAccess` before anything RSVP-specific runs.
- "Clear" removes the `Rsvp` row, returning the player to `no-response` — the tri-state
  in `src/lib/rsvp.ts` already treats row-absence as the real "no response" state, so
  clearing needs no new state, only a delete.

## Architecture & Data Model

### Data Layer

**Schema change (one small migration):** nullable `recordedById` on `Rsvp`.

```prisma
model Rsvp {
  id           String   @id @default(cuid())
  eventId      String
  playerId     String
  attending    Boolean
  /// Set only when a staff member recorded this response on the family's
  /// behalf; null means the family recorded it themselves. Every write sets
  /// or clears it, which is what makes last-write-wins carry provenance
  /// for free.
  recordedById String?
  updatedAt    DateTime @updatedAt

  event      Event  @relation(fields: [eventId], references: [id], onDelete: Cascade)
  player     Player @relation(fields: [playerId], references: [id], onDelete: Cascade)
  recordedBy User?  @relation("RsvpRecordedBy", fields: [recordedById], references: [id], onDelete: SetNull)

  @@unique([eventId, playerId])
  @@index([playerId])
}
```

`User` gains the back-relation `recordedRsvps Rsvp[] @relation("RsvpRecordedBy")`.
`onDelete: SetNull` so removing a staff account can never cascade away a family's RSVP —
the row degrades to looking family-recorded, which is the harmless direction.

**`src/lib/rsvps.ts` (thin data layer):**

- `upsertRsvp(eventId, playerId, attending, recordedById: string | null)` — the new
  parameter is written on both `create` and `update`, so a guardian's tap nulls a coach's
  `recordedById` and a coach's tap sets it, with no special casing (AC3).
- New `clearRsvp(eventId, playerId): Promise<void>` — `db.rsvp.deleteMany` on the pair,
  idempotent when no row exists (two coaches clearing the same kid must not error).
- New `isPlayerRostered(teamId, playerId): Promise<boolean>` — the staff path's
  counterpart to `guardedRosteredPlayerIds`: it folds roster membership on *this* team
  into the check for the same reason (Decision 15 — guardianship and players are global),
  so a coach cannot RSVP a kid from another team onto this one's event.
- `listEventRsvps` select grows `recordedById` (its return type widens to
  `RsvpSourceRow[]`, below). `listRsvpsForEvents` (team home) is untouched — see
  Decision 3.

**`src/lib/rsvp.ts` (pure, DB-free):**

- New `RsvpSourceRow = RsvpRow & { recordedById: string | null }`.
- New pure helper `staffRecordedPlayerIds(rows: readonly RsvpSourceRow[]): Set<string>` —
  returns the players whose current response was staff-recorded. Trivial, but it keeps
  the event page free of row-shape logic and gives the provenance rule one tested home.
- `deriveRsvpState` / `buildRsvpStateMap` unchanged — provenance never affects state.

### API / Service Layer

No new endpoints; Server Actions only, per the architecture.

| Endpoint / Function | Type | Auth | Purpose |
|---|---|---|---|
| `rsvpAction` (extended) | Server Action | PARENT+ (guardian path) / COACH+ (staff path) | Set or clear one player's RSVP for one event |
| `requireRsvpWriter` (renamed/extended `requireGuardedEvent`) | Internal | — | Resolve which path the caller is on, or reject |

The authorization ladder inside the action, in order:

1. `requireTeamAccess(teamId, { intent: "write" })` — membership + archived gate,
   exactly as today. Archived teams reject both paths here (AC4).
2. `getEvent(teamId, eventId)` — team/event scoping, never skipped (issue requirement).
3. **Guardian path first:** if `guardedRosteredPlayerIds` contains the player, the caller
   writes as the family — `recordedById: null`. A coach who guards their own kid lands
   here, so their tap on their own child is a family tap, which is what a family member
   would expect to read back.
4. **Staff path:** else if `role !== "PARENT"` and `isPlayerRostered(teamId, playerId)`,
   the caller writes as staff — `recordedById: userId`.
5. Else redirect `?error=not-your-player` (parents on other families' kids, exactly
   today's behaviour) — or `?error=not-on-team` when a COACH+ names an unrostered
   player id (only reachable from a crafted form).
6. The existing `from=home` started-event gate runs unchanged after path resolution.

`response` widens from `z.enum(["attending", "declined"])` to
`z.enum(["attending", "declined", "clear"])`; `clear` calls `clearRsvp`. The action
accepts `clear` from either path (a guardian clearing their own kid is harmless and
avoids special casing); the UI only *renders* the Clear button in the staff controls,
per the AC.

### UI Component Tree

Event page (`src/app/t/[teamId]/schedule/[eventId]/page.tsx`) only — no new components:

- Attendance list row: `canRsvp` becomes `canRsvp || canRecordForTeam` where
  `canRecordForTeam = role !== "PARENT"`. Coaches see Going / Not going on every row,
  plus **Clear** (rendered only when a row exists to clear, i.e. state ≠ `no-response`).
  Forms post the same hidden fields to the same `rsvpAction`.
- Provenance note: when `staffRecordedPlayerIds` contains the player, the badge line
  reads e.g. `Not going · Recorded by coach` in the existing muted style. Text +
  position, never colour alone — same accessibility rule `rsvp-style.ts` documents.

## Key Decisions

### Decision 1: `recordedById` FK, not a `source` enum

**Options considered:**
- Option A: nullable `recordedById String?` FK to `User`, null = family-recorded.
- Option B: `source` enum (`GUARDIAN | STAFF`) on `Rsvp`.

**Decision:** Option A.
**Rationale:** Strictly more informative for the same migration cost — "which coach"
is answerable later (a four-coach team is a supported shape) without another migration,
while the UI needs only a null check. It is also the shape the issue names first. The
enum saves nothing: both are one nullable column, and the FK's `SetNull` failure mode is
benign.

### Decision 2: extend `rsvpAction`, don't add a second action

**Options considered:**
- Option A: a parallel `coachRsvpAction` with its own gate.
- Option B: one action, two authorization paths inside the existing gate.

**Decision:** Option B, per the issue's own proposal.
**Rationale:** Both surfaces already post to one action, and the issue's AC3 ("no special
casing") is structural here: one code path doing `upsertRsvp(..., recordedById)` for both
writers is what makes last-write-wins true by construction. A second action would
duplicate the event-scoping, origin, and error plumbing, and drift is precisely what the
existing comments in this file warn about. `guardedRosteredPlayerIds` stays untouched for
parents, as the issue requires.

### Decision 3: provenance marker on the event page only (this ticket)

**Options considered:**
- Option A: show "Recorded by coach" on the event page attendance list only.
- Option B: also thread `recordedById` through team home (`listRsvpsForEvents`,
  `buildRsvpStateMapsByEvent`) and annotate the home badges.

**Decision:** Option A.
**Rationale:** The AC requires distinguishability where the coach acts and the family
reads the full attendance conversation — the event page, one tap from every badge on team
home. Option B widens the change into `rsvp.ts`'s multi-event map builder and team home's
already-dense badge line for a second copy of the same fact. If families ask "how did my
kid get marked out?" *from home*, that's a cheap follow-up: the column already exists.
Deferring it is flagged in the proposal's out-of-scope list.

### Decision 4: guardian path wins for a coach who guards the player

A coach RSVPing their own kid records as the family (`recordedById: null`). Checking
guardianship first makes this fall out of the ladder ordering rather than a special case,
and it is the honest reading: "Recorded by coach" on your own child, tapped by you, would
be noise.

## Security & Permissions

- Guardian path: unchanged — `guardedRosteredPlayerIds` (guardianship ∩ this team's
  roster). Parents still cannot touch other families' kids (AC4): a parent who fails the
  guardian check has role `PARENT` and never reaches the staff path.
- Staff path: `role !== "PARENT"` from `requireTeamAccess`'s return value (COACH and
  OWNER — the same `canEdit` predicate the page already uses), **plus**
  `isPlayerRostered(teamId, playerId)` so team/event scoping is never skipped. Both
  checks run inside the action, never in Proxy, per AGENTS.md.
- Archived teams: rejected for every writer by `requireTeamAccess(intent: "write")`
  before any path resolves.
- Render-time gating (which buttons appear) remains a convenience; the action is the
  boundary, same as today.

## Error Handling

- Same `unstable_rethrow` → `TeamAccessError` → `?error=` redirect structure as every
  action in the file.
- New `?error=not-on-team` copy added via the existing `messageTable` in the event page
  (never a plain object literal — `error-message-tables.test.ts` enforces this).
- `clearRsvp` uses `deleteMany` so clearing an already-absent row succeeds silently.
- Database errors keep propagating (fail closed), matching `rsvps.ts`'s documented policy.

## Testing Strategy

| Layer | Test Type | File(s) | Notes |
|---|---|---|---|
| Pure RSVP logic | Unit | `src/lib/rsvp.test.ts` | `staffRecordedPlayerIds`: staff rows, family rows, empty |
| Data layer | Unit (mocked `db`) | `src/lib/rsvps.test.ts` | `upsertRsvp` writes `recordedById` on create *and* update; `clearRsvp` idempotent; `isPlayerRostered` scopes by team |
| Action | Unit (mocked libs) | `src/app/t/[teamId]/schedule/actions.test.ts` | Coach on unguarded rostered player → upsert with `recordedById`; guardian → `recordedById: null` (coach-guardian included); PARENT on unguarded player → `not-your-player`, no write; coach on unrostered player → `not-on-team`; `clear` → `clearRsvp`; archived team → `access`; `from=home` started-event gate still holds |
| Event page | Component | `src/app/t/[teamId]/schedule/[eventId]/page.test.tsx` | Coach sees buttons on every row + Clear when a row exists; parent sees only their kids' buttons and no Clear; "Recorded by coach" renders iff `recordedById` non-null |
| Readiness | — | none | No change: it consumes the tri-state map, which ignores provenance (AC5 holds by construction; existing suite already covers declined→uncovered) |

Existing patterns to copy: the actions suite's mock-hoisting + `redirectUrlOf` helper and
pinned clock; static imports of the module under test (never `await import()` in a test).

## Config Changes

- [ ] Schema migration — `prisma/migrations/<timestamp>_add_rsvp_recorded_by/`: one
      `ALTER TABLE "Rsvp" ADD COLUMN "recordedById" TEXT` + FK constraint
      (`ON DELETE SET NULL`). Additive and nullable: no backfill, existing rows read as
      family-recorded, which is true. Rollback = drop column; readiness and state
      derivation never read it, so a rollback cannot corrupt behaviour.
      **Creating it needs a live Postgres URL (Neon dev branch — not `prisma dev`, per
      AGENTS.md); alternatively hand-write the SQL in the existing migrations' style and
      verify with `prisma migrate diff`.** It applies to production automatically on
      deploy via `pnpm build`.
- [ ] `pnpm db:generate` after the schema edit (client is gitignored).
- [ ] Access rule changes — in-action only, none elsewhere (Proxy untouched, per AGENTS.md).
- [ ] Environment variables — none.
- [ ] Dependency changes — none.

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| Coach and guardian race on the same kid | Low | Last write wins via the existing upsert on `@@unique([eventId, playerId])`; `recordedById` is written in the same statement, so state and provenance can never disagree |
| Coach who guards the player | Low | Guardian path checked first — records as family (Decision 4) |
| Crafted form: coach names a player on another team | Med | `isPlayerRostered(teamId, playerId)` mirrors the guardian path's roster intersection; `getEvent(teamId, eventId)` already pins the event |
| Crafted form: parent names another family's kid | Med | Unchanged guardian check; staff path unreachable at role PARENT |
| Clear on a player with no RSVP row | Low | `deleteMany` is a no-op, action redirects `?saved=1` |
| Staff `User` deleted later | Low | `onDelete: SetNull` — row survives, marker quietly drops |
| Migration deployed, code not yet (or vice versa) | Low | Column is nullable and unread by old code; new code writing before migration cannot happen — `pnpm build` runs `migrate deploy` first |
| Team home stays provenance-blind | Low | Deliberate (Decision 3); event page is one tap away and flagged as a possible follow-up |
