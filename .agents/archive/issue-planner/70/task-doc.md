# Task Doc — Repeat-weekly on event create (#70)

## Prerequisites

- [x] #51 merged (PR #71) — sticky values, `useActionState` form, and the announcement
      pipeline this builds on are all in place. Nothing else blocks.

## Phase 1: Pure logic (calendar, announcements, email builder)

- [ ] `src/lib/calendar.ts`: add `MAX_REPEAT_WEEKS = 30` and
      `weeklyOccurrences(startWallClock: string, total: number): Date[]` — share the
      wall-clock parsing with `wallClockToInstant` (extract a private parse helper rather
      than duplicating `WALL_CLOCK_PATTERN` handling); build occurrence *k* as
      `new TZDate(year, month − 1, day + 7k, hour, minute, 0, APP_TIMEZONE)`; return plain
      `Date`s via `getTime()`; throw `RangeError` on bad input or `total` outside
      1–`MAX_REPEAT_WEEKS`. Comment that the cap deliberately does not couple to
      `maxDuration` (no per-row send).
- [ ] `src/lib/calendar.test.ts`: totals 1 and N; wall clock held across 8 Mar 2026 and
      1 Nov 2026; month/year rollover; `RangeError` cases.
- [ ] `src/lib/announcements.ts`: add `announceableOccurrences(startsAts: readonly Date[], now: Date): Date[]`
      (per-occurrence `shouldAnnounceEvent`), with the mixed past/future rule documented.
- [ ] `src/lib/announcements.test.ts`: all-past → empty; mixed → future subset; boundary
      (`===` now) excluded.
- [ ] `src/emails/events-announcement-email.ts`: `buildEventsAnnouncementEmail` — count +
      range subject, `buildEventHeadline` reuse, per-occurrence `formatEventDateTime`
      labels, schedule-page URL via `absoluteUrl`.
- [ ] `src/emails/EventsAnnouncementEmail.tsx`: plain template listing the dates;
      location/notes once; no family data.
- [ ] `src/emails/events-announcement-email.test.ts`: subject, labels, URL.

## Phase 2: Data layer + action

- [ ] `src/lib/schedule.ts`: `createEvents(teamId, inputs: EventInput[]): Promise<ScheduleEvent[]>`
      — array-form `db.$transaction` of `create`s, each carrying `teamId`, `EVENT_SELECT`
      on each; docstring pointing at `saveBattingOrder` for the array-form precedent.
- [ ] `src/lib/schedule.test.ts`: transaction shape, `teamId` scoping, returned rows.
- [ ] `src/app/t/[teamId]/schedule/actions.ts`:
      - Parse `repeat` (Zod: optional string → int 1–`MAX_REPEAT_WEEKS`; blank/absent → 1);
        new `invalid-repeat` error code mapped to the `repeat` field.
      - `repeat === 1` → existing single-event path, untouched.
      - `repeat > 1` → `weeklyOccurrences`, `createEvents`, then
        `scheduleBatchAnnouncement` (below); success summary names count + date range via
        `formatEventDateTime`.
      - `announceEvents(work)` beside `announceEvent`: one paced `EventsAnnouncementEmail`
        per guardian (same `MIN_SEND_INTERVAL_MS` loop, same throw-swallowing), push after
        successful email only, then `sendReceipt` with headline `"N games"`/`"N practices"`
        and the range `dateTimeLabel`. Reuse `resolveAnnouncementWork`'s recipient
        resolution (generalize its `event` field to the batch or wrap it — keep one
        resolver).
- [ ] `src/app/t/[teamId]/schedule/actions.test.ts`: repeat parsing (blank, `"1"`, N, 31,
      `"abc"`); single path unchanged when repeat absent; batch path writes once via
      `createEvents` and schedules exactly one announcement; past-occurrence filter;
      `invalid-repeat` state shape.

## Phase 3: Form UI + state

- [ ] `src/app/t/[teamId]/schedule/event-form-state.ts`: `EventFormValues.repeat: string`
      (empty default), `AddEventField` gains `"repeat"`, `stickyValues` clears `repeat`
      (comment why: a sticky count multiplies the next add), `EMPTY_EVENT_VALUES` updated.
- [ ] `src/app/t/[teamId]/schedule/repeat-preview.ts`: pure
      `repeatPreview(startsAt: string, repeat: string): string | null` — null unless
      `startsAt` parses and `repeat ≥ 2`; otherwise "N events, weekly through <weekday,
      month day>" via zone-free date-component math. No imports from `calendar.ts`.
- [ ] `src/app/t/[teamId]/schedule/repeat-preview.test.ts`: wording, rollover, null cases.
- [ ] `src/app/t/[teamId]/schedule/AddEventForm.tsx`: number input (`min=1 max=30`,
      `inputMode="numeric"`), preview line under it, `marks("repeat")` wiring; inside the
      pending-disabled fieldset.
- [ ] `src/app/t/[teamId]/schedule/schedule-messages.ts`: `invalid-repeat` message naming
      1–30, via `messageTable`.
- [ ] `src/app/t/[teamId]/schedule/AddEventForm.test.tsx`: field + preview render, repeat
      clears after `added`, error attributed to repeat.
- [ ] `src/app/t/[teamId]/schedule/page.tsx`: no change expected beyond
      `EMPTY_EVENT_VALUES`/duplicate prefill picking up the new field with `""` — verify,
      don't assume.

## Pre-Commit Gate

Per AGENTS.md `## Commands`:

- [ ] `pnpm check` (lint → typecheck → test) ✅
- [ ] `pnpm exec next build` if build verification is wanted locally — never `pnpm build`
      without `DATABASE_URL` (and never in CI; CI already builds with `pnpm exec`).

## Files Modified / Created

| File | Change |
|---|---|
| `src/lib/calendar.ts` | Add `MAX_REPEAT_WEEKS`, `weeklyOccurrences`; extract shared wall-clock parse |
| `src/lib/calendar.test.ts` | Occurrence + DST tests |
| `src/lib/announcements.ts` | Add `announceableOccurrences` |
| `src/lib/announcements.test.ts` | Batch filter tests |
| `src/lib/schedule.ts` | Add `createEvents` (array-form `$transaction`) |
| `src/lib/schedule.test.ts` | Transaction tests |
| `src/emails/events-announcement-email.ts` | New pure builder |
| `src/emails/events-announcement-email.test.ts` | Builder tests |
| `src/emails/EventsAnnouncementEmail.tsx` | New template |
| `src/app/t/[teamId]/schedule/actions.ts` | `repeat` parsing, batch path, `announceEvents` |
| `src/app/t/[teamId]/schedule/actions.test.ts` | Action tests |
| `src/app/t/[teamId]/schedule/event-form-state.ts` | `repeat` in values/fields/sticky |
| `src/app/t/[teamId]/schedule/repeat-preview.ts` | New pure client-safe preview |
| `src/app/t/[teamId]/schedule/repeat-preview.test.ts` | Preview tests |
| `src/app/t/[teamId]/schedule/AddEventForm.tsx` | Repeat input + preview |
| `src/app/t/[teamId]/schedule/AddEventForm.test.tsx` | Form tests |
| `src/app/t/[teamId]/schedule/schedule-messages.ts` | `invalid-repeat` message |
