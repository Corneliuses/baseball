# Task Doc — Coach-recorded absences: let staff set a player's RSVP on their behalf (#54)

## Prerequisites

- [ ] None — no blocking issues. A live Postgres URL (Neon dev branch) is needed *only*
      to generate the migration with `pnpm db:migrate`; otherwise hand-write the SQL
      (see Phase 1) and verify with `prisma migrate diff`.

## Phase 1: Schema & Data Layer

- [ ] `prisma/schema.prisma`: add nullable `recordedById` + `recordedBy` relation
      (`@relation("RsvpRecordedBy")`, `onDelete: SetNull`) to `Rsvp`; add the
      `recordedRsvps Rsvp[] @relation("RsvpRecordedBy")` back-relation to `User`.
      Comment the column: set only for staff-recorded responses, null = family-recorded.
- [ ] Create `prisma/migrations/<timestamp>_add_rsvp_recorded_by/migration.sql`
      (`ALTER TABLE "Rsvp" ADD COLUMN "recordedById" TEXT;` + FK with
      `ON DELETE SET NULL ON UPDATE CASCADE`, matching the initial migration's style).
- [ ] Run `pnpm db:generate` so the client and enums pick up the column.
- [ ] `src/lib/rsvp.ts`: add `RsvpSourceRow` type and pure `staffRecordedPlayerIds()`.
- [ ] `src/lib/rsvp.test.ts`: cover `staffRecordedPlayerIds` (staff row, family row,
      mixed, empty).
- [ ] `src/lib/rsvps.ts`: add `recordedById: string | null` to `upsertRsvp` (written on
      both `create` and `update`); add `clearRsvp` (`deleteMany`, idempotent); add
      `isPlayerRostered(teamId, playerId)`; widen `listEventRsvps` select/return to
      include `recordedById`.
- [ ] `src/lib/rsvps.test.ts`: `recordedById` written on create *and* update; guardian
      write nulls a previously staff-set value; `clearRsvp` no-ops with no row;
      `isPlayerRostered` filters by `teamId`.

## Phase 2: Action & Event Page

- [ ] `src/app/t/[teamId]/schedule/actions.ts`: widen `rsvpResponseSchema` with
      `"clear"`; extend `requireGuardedEvent` (rename to `requireRsvpWriter`) to return
      the resolved write path — guardian first (`recordedById: null`), then COACH+ &&
      `isPlayerRostered` (`recordedById: userId`), else redirect (`not-your-player` for
      parents, `not-on-team` for a COACH+ naming an unrostered player). Keep the
      `from=home` started-event gate and every redirect/`unstable_rethrow` pattern
      as-is. `rsvpAction` routes `clear` to `clearRsvp`, otherwise passes the path's
      `recordedById` to `upsertRsvp`.
- [ ] `src/app/t/[teamId]/schedule/actions.test.ts`: new cases per the design doc's
      testing table (coach staff-write, guardian null-write, coach-guardian precedence,
      parent rejection unchanged, unrostered rejection, clear, archived, home gate).
- [ ] `src/app/t/[teamId]/schedule/[eventId]/page.tsx`: render RSVP buttons for
      `canRsvp || role !== "PARENT"`; add the Clear form (staff controls only, and only
      when state ≠ `no-response`); append "· Recorded by coach" to the badge line for
      players in `staffRecordedPlayerIds(rsvpRows)`; add `not-on-team` copy to the
      page's `messageTable` (never a plain object literal).
- [ ] `src/app/t/[teamId]/schedule/[eventId]/page.test.tsx`: coach sees controls on
      every row; parent scope unchanged; Clear visibility; provenance note renders iff
      `recordedById` non-null.

## Phase 3: Docs

- [ ] `AGENTS.md`: one-line note in the routes paragraph or Gotchas that the event
      page's RSVP action now has a staff path writing `recordedById` (provenance, not
      authorship of state). Skip if the diff comments already carry it — do not bloat.

## Pre-Commit Gate

Per AGENTS.md `## Commands` — run `pnpm check` (lint → typecheck → test) before
reporting done; CI additionally runs `pnpm exec next build` (never `pnpm build` in CI).

- [ ] Lint ✅
- [ ] Typecheck ✅
- [ ] Tests ✅

## Files Modified / Created

| File | Change |
|---|---|
| `prisma/schema.prisma` | `Rsvp.recordedById` (nullable FK, SetNull) + `User` back-relation |
| `prisma/migrations/<ts>_add_rsvp_recorded_by/migration.sql` | New — additive column + FK |
| `src/lib/rsvp.ts` | `RsvpSourceRow`, `staffRecordedPlayerIds` |
| `src/lib/rsvp.test.ts` | Tests for the new pure helper |
| `src/lib/rsvps.ts` | `upsertRsvp` provenance param, `clearRsvp`, `isPlayerRostered`, wider `listEventRsvps` |
| `src/lib/rsvps.test.ts` | Tests for the data-layer changes |
| `src/app/t/[teamId]/schedule/actions.ts` | Two-path authorization, `clear` response |
| `src/app/t/[teamId]/schedule/actions.test.ts` | New action cases |
| `src/app/t/[teamId]/schedule/[eventId]/page.tsx` | Staff controls, Clear, provenance note, error copy |
| `src/app/t/[teamId]/schedule/[eventId]/page.test.tsx` | New page cases |
| `AGENTS.md` | Optional one-line note (Phase 3) |
