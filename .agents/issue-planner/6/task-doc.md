# Task Doc — Phase 6: Schedule — events, month grid, and list view (#6)

## Prerequisites

- [x] #3 (Teams, `/t/[teamId]` scoping, `requireTeamAccess`) — landed, merged in PR #20
- [ ] `pnpm install` — `node_modules` is absent in a fresh session
- [ ] `pnpm db:generate` — `src/generated/prisma` is gitignored; nothing typechecks without it
- [ ] `pnpm add @date-fns/tz` — new dependency, see design-doc Decision 2
- [ ] Read `node_modules/next/dist/docs/01-app/01-getting-started/` on pages and search
      params before writing route code — this is not the Next.js in training data

No schema change and no migration in this issue.

---

## Phase 1: Pure calendar core

Everything here is DB-free and DOM-free, tested without a database. Nothing in this phase
imports Prisma or React.

- [ ] Create `src/lib/calendar.ts` with a module docstring stating the Decision 1 rule:
      all event times are anchored to one app-wide IANA zone, and `Event.startsAt` holds
      a true UTC instant, never a wall clock
- [ ] Export `APP_TIMEZONE` in `src/lib/calendar.ts` — read `process.env.APP_TIMEZONE`,
      validate it once at module load by constructing an `Intl.DateTimeFormat` inside a
      try/catch, fall back to `"America/Chicago"` with a `console.error` on failure
- [ ] Export `GAME_GRACE_MS = 3 * 60 * 60 * 1000` in `src/lib/calendar.ts` with a comment
      explaining it keeps `nextGame` pointed at a game in progress (design-doc Decision 3)
- [ ] Add `wallClockToInstant(value: string): Date` to `src/lib/calendar.ts` — takes a
      `datetime-local` string (`YYYY-MM-DDTHH:mm`), returns the UTC instant via
      `new TZDate(...)` from `@date-fns/tz`. Throw `RangeError` on a malformed string,
      matching `parseJerseyNumber`'s style in `src/lib/roster-rules.ts`
- [ ] Add `instantToWallClock(date: Date): string` to `src/lib/calendar.ts` — the inverse,
      for pre-filling the edit form's `datetime-local` input
- [ ] Add `formatEventDateTime(date: Date): string` and `formatEventTime(date: Date): string`
      to `src/lib/calendar.ts`, both formatting in `APP_TIMEZONE`
- [ ] Add `dayKey(date: Date): string` to `src/lib/calendar.ts` — the `YYYY-MM-DD` calendar
      day of an instant **in `APP_TIMEZONE`**, the join key between the grid and the events
- [ ] Add `buildMonthGrid(year: number, month: number): MonthWeek[]` to
      `src/lib/calendar.ts` — weeks of `{ dayKey, day, inMonth }` cells, Sunday-start,
      padded to whole weeks, variable 5–6 rows (design-doc Decision 4)
- [ ] Add `bucketEventsByDay<T extends { startsAt: Date }>(events: T[]): Map<string, T[]>`
      to `src/lib/calendar.ts`, keyed by `dayKey`
- [ ] Add `monthRange(year, month): { start: Date; end: Date }` to `src/lib/calendar.ts` —
      the UTC instants bounding that Central-time month, for the `listEvents` query
- [ ] Add `selectNextGame<T extends { type: EventType; startsAt: Date }>(events: T[], now: Date): T | null`
      to `src/lib/calendar.ts` — filters to `GAME`, keeps those with
      `startsAt + GAME_GRACE_MS > now`, returns the earliest, `null` if none
- [ ] Add `parseMonthParam(raw: unknown, now: Date): { year: number; month: number }` and
      `parseViewParam(raw: unknown): "month" | "list"` to `src/lib/calendar.ts` — Zod-backed,
      falling back to the current Central month and `"month"` rather than throwing
- [ ] Write `src/lib/calendar.test.ts` covering:
  - [ ] `wallClockToInstant` round-trips through `instantToWallClock`
  - [ ] `wallClockToInstant("2026-07-15T18:00")` → `2026-07-15T23:00:00Z` (CDT, UTC-5)
  - [ ] `wallClockToInstant("2026-01-15T18:00")` → `2026-01-16T00:00:00Z` (CST, UTC-6)
  - [ ] The nonexistent wall clock `2026-03-08T02:30` resolves deterministically
  - [ ] The ambiguous wall clock `2026-11-01T01:30` resolves deterministically
  - [ ] `dayKey` puts an 8:00 PM Central event on the 31st in that month, **not** the next
        — the specific bug `date-fns` core would cause under `TZ=UTC`
  - [ ] `buildMonthGrid` for a month starting on Sunday (5 rows), a 31-day month starting
        on Saturday (6 rows), and February 2028 (leap)
  - [ ] Every grid row has exactly 7 cells, and `inMonth` counts equal the real day count
  - [ ] `bucketEventsByDay` groups two same-day events together and handles an empty list
  - [ ] `selectNextGame` ignores a `PRACTICE` sooner than the next `GAME`
  - [ ] `selectNextGame` still returns a game that started 40 minutes ago
  - [ ] `selectNextGame` skips a game that started 4 hours ago
  - [ ] `selectNextGame` returns `null` for no upcoming games and for an empty list
  - [ ] `parseMonthParam` falls back on `"garbage"`, `"2026-13"`, and `undefined`
- [ ] Add `APP_TIMEZONE` to `.env.example` — IANA zone name, default `America/Chicago`,
      noted as optional. Keep the existing `!.env.example` gitignore negation intact

---

## Phase 2: Data access

- [ ] Create `src/lib/schedule.ts` with a module docstring restating the error-handling
      split from `src/lib/roster.ts` (lists swallow, single lookups and writes propagate)
      and the games-only rule
- [ ] Add the `ScheduleEvent` type and an `EVENT_SELECT` const to `src/lib/schedule.ts`,
      mirroring `ROSTER_ENTRY_SELECT` in `src/lib/roster.ts`
- [ ] Add `listEventsInMonth(teamId, year, month)` to `src/lib/schedule.ts` — uses
      `monthRange`, orders by `startsAt` ascending, swallows errors and returns `[]`
- [ ] Add `listUpcomingEvents(teamId, now)` to `src/lib/schedule.ts` — `startsAt >= now`,
      ascending, swallows errors and returns `[]`
- [ ] Add `listPastEvents(teamId, now)` to `src/lib/schedule.ts` — `startsAt < now`,
      **descending**, swallows errors and returns `[]`
- [ ] Add `getEvent(teamId, eventId)` to `src/lib/schedule.ts` — `findFirst` with **both**
      ids in the where clause. Does **not** swallow errors; document why, referencing
      `getRosterEntry`
- [ ] Add `nextGame(teamId, now = new Date())` to `src/lib/schedule.ts` — query
      `type: "GAME"` and `startsAt >= now - GAME_GRACE_MS` ordered ascending with
      `take: 1`, then pass through `selectNextGame` so the rule has one home. Does **not**
      swallow errors
- [ ] Add `createEvent(teamId, input)`, `updateEvent(teamId, eventId, input)`, and
      `deleteEvent(teamId, eventId)` to `src/lib/schedule.ts` — `teamId` in every where
      clause (design-doc Decision 5); none swallow errors
- [ ] Write `src/lib/schedule.test.ts` following `src/lib/roster.test.ts`'s mocking style
      (`vi.mock("./db")` with module-level spies), covering:
  - [ ] `listEventsInMonth` returns `[]` and logs when the database throws
  - [ ] `getEvent` **rethrows** when the database throws, rather than returning `null`
  - [ ] `getEvent`, `updateEvent`, and `deleteEvent` all put `teamId` in the where clause
  - [ ] `nextGame` filters on `type: "GAME"`
  - [ ] `nextGame` returns `null` when the query comes back empty

---

## Phase 3: Routes, actions, and UI

- [ ] Create `src/app/t/[teamId]/schedule/actions.ts` modelled on
      `src/app/t/[teamId]/roster/actions.ts` — reuse its `extractTeamId` shape, its
      `unstable_rethrow` → `TeamAccessError` → rethrow ordering, and its `?error=` redirects
- [ ] Add the Zod `eventSchema` to `src/app/t/[teamId]/schedule/actions.ts` — `type` as a
      `z.enum(["GAME", "PRACTICE"])`, `startsAt` as a non-empty `datetime-local` string,
      and `location` / `opponent` / `notes` trimmed and emptied to `null`
- [ ] Add `createEventAction` to `src/app/t/[teamId]/schedule/actions.ts` —
      `requireTeamAccess(teamId, { intent: "write", minRole: "COACH" })`, then
      `wallClockToInstant`, then `createEvent`; `revalidatePath` and redirect to the schedule
- [ ] Add `updateEventAction` to `src/app/t/[teamId]/schedule/actions.ts` — same gate,
      resolving the event through `getEvent(teamId, eventId)` before writing so a forged
      cross-team `eventId` cannot land
- [ ] Add `deleteEventAction` to `src/app/t/[teamId]/schedule/actions.ts` — same gate and
      same resolution; redirect to `/t/${teamId}/schedule`
- [ ] Create `src/app/t/[teamId]/schedule/page.tsx` — `requireTeamAccess(teamId, { intent: "read" })`
      first, then `parseViewParam` / `parseMonthParam`, then the matching loader. Include
      the `ERROR_MESSAGES` map and `metadata` export, both as `roster/page.tsx` does
- [ ] Build the month grid markup in `src/app/t/[teamId]/schedule/page.tsx` from
      `buildMonthGrid` + `bucketEventsByDay`, with prev/next month links carrying
      `?view=month&month=YYYY-MM`, and a weekday header row
- [ ] Build the chronological list markup in `src/app/t/[teamId]/schedule/page.tsx` —
      upcoming ascending by default, `?past=1` switching to past descending, with a link
      toggling between them and an empty state for each
- [ ] Add the month/list view switcher links to `src/app/t/[teamId]/schedule/page.tsx`
- [ ] Add the coach-only inline "Add an event" form to
      `src/app/t/[teamId]/schedule/page.tsx`, gated on `role !== "PARENT"`, matching the
      "Add a player" `Card` + `form action={...}` pattern in `roster/page.tsx`
- [ ] Create `src/app/t/[teamId]/schedule/[eventId]/page.tsx` —
      `requireTeamAccess(teamId, { intent: "read" })`, then `getEvent(teamId, eventId)`,
      `notFound()` on `null`. Render type, formatted date/time, location, opponent, notes
- [ ] Add the coach-only edit form to `src/app/t/[teamId]/schedule/[eventId]/page.tsx`,
      pre-filled via `instantToWallClock`
- [ ] Add the coach-only delete control to `src/app/t/[teamId]/schedule/[eventId]/page.tsx`
      behind a `?confirm=delete` two-step, with copy stating that the event's RSVPs go
      with it and that this cannot be undone
- [ ] Add a "Schedule" link to `src/app/t/[teamId]/page.tsx`'s button row, alongside
      Roster and Directory
- [ ] Write `src/app/t/[teamId]/schedule/actions.test.ts` covering:
  - [ ] Every action calls `requireTeamAccess` with `minRole: "COACH"`
  - [ ] A `TeamAccessError` redirects to `?error=access` rather than throwing
  - [ ] An `eventId` belonging to another team is rejected before any write
  - [ ] A blank or malformed `startsAt` redirects with a validation error
  - [ ] An invalid `type` value is rejected
- [ ] Write `src/app/t/[teamId]/schedule/page.test.tsx` following
      `directory/page.test.tsx` (`renderToStaticMarkup`, mocked libs), covering:
  - [ ] `?view=month` renders the grid; `?view=list` renders the list
  - [ ] An absent or garbage `?view` falls back to the month grid
  - [ ] The create form is absent for a PARENT and present for a COACH
  - [ ] Empty states render for both views
  - [ ] A non-member gets `notFound()`
- [ ] Write `src/app/t/[teamId]/schedule/[eventId]/page.test.tsx` covering:
  - [ ] Event details render with the Central-time string
  - [ ] Edit and delete controls are absent for a PARENT
  - [ ] A `null` from `getEvent` produces `notFound()`

---

## Pre-Commit Gate

Commands from `AGENTS.md`'s Commands table:

- [ ] `pnpm lint` ✅
- [ ] `pnpm typecheck` ✅
- [ ] `pnpm test` ✅
- [ ] `pnpm check` (all three) ✅
- [ ] `pnpm build` ✅

Also confirm before committing:

- [ ] `src/generated/` is still gitignored and uncommitted
- [ ] `.gitignore`'s `!.env.example` negation is intact
- [ ] `.agents/app-brainstorm/` is untouched — Decision 12 is honoured, not revised
- [ ] `.claude/` is untouched
- [ ] `src/proxy.ts` is untouched
- [ ] No `Lineup`, `LineupSlot`, or per-game row crept into `prisma/schema.prisma`

---

## Files Modified / Created

| File | Change |
|---|---|
| `src/lib/calendar.ts` | **New.** Pure timezone, month grid, bucketing, and next-game selection |
| `src/lib/calendar.test.ts` | **New.** The core test surface for this issue |
| `src/lib/schedule.ts` | **New.** Team-scoped event reads and writes, plus `nextGame(teamId)` |
| `src/lib/schedule.test.ts` | **New.** Mocked-`db` coverage of scoping and error-handling split |
| `src/app/t/[teamId]/schedule/page.tsx` | **New.** Month grid, list view, coach create form |
| `src/app/t/[teamId]/schedule/page.test.tsx` | **New.** |
| `src/app/t/[teamId]/schedule/actions.ts` | **New.** Create / update / delete server actions |
| `src/app/t/[teamId]/schedule/actions.test.ts` | **New.** |
| `src/app/t/[teamId]/schedule/[eventId]/page.tsx` | **New.** Detail, edit, delete |
| `src/app/t/[teamId]/schedule/[eventId]/page.test.tsx` | **New.** |
| `src/app/t/[teamId]/page.tsx` | Add a Schedule link to the button row |
| `.env.example` | Document `APP_TIMEZONE` |
| `package.json` | Add `@date-fns/tz` |
| `prisma/schema.prisma` | **Unchanged** — `Event` and its index already exist |
