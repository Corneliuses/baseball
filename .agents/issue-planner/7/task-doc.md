# Task Doc — Phase 7: RSVP with tri-state semantics (#7)

## Prerequisites

- [x] #4 (Roster) merged — `src/lib/roster.ts` and roster routes exist
- [x] #6 (Schedule) merged — `src/lib/schedule.ts`, event pages and actions exist (PR #22)
- [x] `pnpm db:generate` run locally so `@/generated/prisma` resolves

## Phase 1: Pure contract module

- [ ] Create `src/lib/rsvp.ts` exporting `RsvpState`, `RsvpRow`, `deriveRsvpState`,
      and `buildRsvpStateMap` per the design doc — DB-free, no imports beyond types.
      Module docstring states the tri-state model, that absence-of-row is a real state,
      and that RSVP never gates roster or chart placement (the contract #8 and #12 consume).
- [ ] Write `src/lib/rsvp.test.ts`: `deriveRsvpState` for all three inputs; map covers
      every rostered player and defaults missing ones to `no-response`; empty roster →
      empty map; a row for an unrostered player is excluded.

## Phase 2: Data wrapper

- [ ] Create `src/lib/rsvps.ts` with `listEventRsvps(teamId, eventId)` (event-team
      scoped, errors propagate), `guardedRosteredPlayerIds(teamId, userId)`
      (GuardianPlayer ∩ RosterEntry), and `upsertRsvp(eventId, playerId, attending)`
      (upsert on `eventId_playerId`). Docstring explains the rsvp.ts/rsvps.ts split and
      why the reads do not swallow errors.
- [ ] Write `src/lib/rsvps.test.ts` with the mocked-`db` pattern from
      `src/lib/roster.test.ts`, asserting the scoping in each where clause and the
      upsert's unique target.

## Phase 3: Server action + schedule UI

- [ ] Add `rsvpAction` to `src/app/t/[teamId]/schedule/actions.ts`: extract/validate
      fields (`z.enum(["attending", "declined"])`), `requireTeamAccess(teamId,
      { intent: "write" })` with no minRole, `getEvent` to pin the event to the team,
      guardian+roster check via `guardedRosteredPlayerIds`, then `upsertRsvp`,
      `revalidatePath`, redirect. Catch shape mirrors `updateEventAction`
      (`unstable_rethrow` → `TeamAccessError` → rethrow).
- [ ] Extend `src/app/t/[teamId]/schedule/actions.test.ts` for `rsvpAction`: success,
      unguarded player, cross-team event, archived team, invalid response value.
- [ ] Add the Attendance card to `src/app/t/[teamId]/schedule/[eventId]/page.tsx`:
      load `getRoster`, `listEventRsvps`, `guardedRosteredPlayerIds`; build the state
      map; render one row per rostered player with a tri-state badge (`no-response`
      styled and labeled distinctly from `declined`); render Going / Not going forms
      only for guarded players; render on games AND practices. Add the new error codes
      to `ERROR_MESSAGES`.
- [ ] Extend `src/app/t/[teamId]/schedule/[eventId]/page.test.tsx`: three distinct
      badges; toggles only for guarded players; card present on a practice.

## Pre-Commit Gate

Per AGENTS.md `## Commands`:

- [ ] `pnpm check` (lint → typecheck → test) ✅
- [ ] `pnpm build` ✅

## Files Modified / Created

| File | Change |
|---|---|
| `src/lib/rsvp.ts` | New — pure tri-state derivation and map builder (the contract) |
| `src/lib/rsvp.test.ts` | New — co-located tests for the pure module |
| `src/lib/rsvps.ts` | New — thin team-scoped data wrapper (reads, guard query, upsert) |
| `src/lib/rsvps.test.ts` | New — scoping tests with mocked `db` |
| `src/app/t/[teamId]/schedule/actions.ts` | Add `rsvpAction` |
| `src/app/t/[teamId]/schedule/actions.test.ts` | Add `rsvpAction` cases |
| `src/app/t/[teamId]/schedule/[eventId]/page.tsx` | Add Attendance card + toggle forms + error messages |
| `src/app/t/[teamId]/schedule/[eventId]/page.test.tsx` | Add attendance rendering cases |
