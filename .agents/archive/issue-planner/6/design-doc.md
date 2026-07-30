# Design Doc — Phase 6: Schedule — events, month grid, and list view (#6)

## Overview

Coaches create games and practices with a time, location, opponent, and notes; everyone
sees them as a month grid and a chronological list. This issue also introduces
`nextGame(teamId)` — the single place the "games only, never practices" rule lives — which
both the view page (#8) and the readiness check (#12) depend on.

It is the first feature in the app where a *time* is authored and read back, which is why
most of the design work below is about anchoring that time to a timezone.

## Acceptance Criteria

From the issue, plus the four clarifications resolved before planning:

- [ ] AC1 — A COACH or OWNER can create an `Event` with `type` (GAME | PRACTICE),
      `startsAt`, and optional `location`, `opponent`, and `notes`.
- [ ] AC2 — A COACH or OWNER can edit and delete an existing event. A PARENT can do
      neither; the controls are not rendered and the actions reject the write.
- [ ] AC3 — Any team member can read the schedule as a **month grid**, navigable by
      month, with each day cell listing that day's events.
- [ ] AC4 — Any team member can read the schedule as a **chronological list**, defaulting
      to today-forward ascending, with past events reachable behind a toggle
      (newest-first).
- [ ] AC5 — Both views live at `/t/[teamId]/schedule`, selected by a `?view=month|list`
      search param, and both link each event to `/t/[teamId]/schedule/[eventId]`.
- [ ] AC6 — `nextGame(teamId)` returns the soonest `EventType.GAME` that has not yet
      finished, and **never** returns a `PRACTICE`. It returns `null` when there is no
      such game.
- [ ] AC7 — A game counts as "next" until **3 hours after** `startsAt`, so the app keeps
      pointing at today's game while it is being played.
- [ ] AC8 — All event times are authored and displayed in **US Central time**
      (`America/Chicago`), app-wide, regardless of server or viewer timezone.
- [ ] AC9 — The pure date helpers are unit-tested: month bucketing, week padding,
      wall-clock↔instant conversion across both DST boundaries, and next-game selection
      including the no-upcoming-game case.
- [ ] AC10 — `pnpm check` and `pnpm build` are both green.

## Architecture & Data Model

### Data Layer

**No schema change and no migration.** `Event` already exists at
`prisma/schema.prisma:202-215` with every column this issue needs, and
`@@index([teamId, startsAt])` already backs the ordered reads both views perform.

The one thing the schema does *not* carry is a timezone, which Decision 1 below resolves
outside the database.

`Rsvp.event` is `onDelete: Cascade`, so deleting an event permanently destroys every RSVP
attached to it. That is correct behaviour — an event that never happens has no attendance
— but it makes delete unrecoverable and is why it gets a confirmation step.

### Module Layout

Two new `src/lib/` modules, following the established `roster.ts` (data) /
`roster-rules.ts` (pure) split that AGENTS.md mandates:

| Module | Purity | Responsibility |
|---|---|---|
| `src/lib/calendar.ts` | **Pure, DB-free** | Timezone constant and conversion, month-grid construction, day bucketing, `selectNextGame` |
| `src/lib/schedule.ts` | Data access | `listEvents`, `getEvent`, `createEvent`, `updateEvent`, `deleteEvent`, `nextGame(teamId)` |

`nextGame(teamId)` lives in `schedule.ts` because the issue names it there and it needs a
query; the decision it wraps — *which* of the loaded games is next — is the pure
`selectNextGame(events, now)` in `calendar.ts`, which is what the tests exercise.

### API / Service Layer

| Function | Type | Auth | Purpose |
|---|---|---|---|
| `listEvents(teamId, range)` | Internal (Prisma) | caller pre-checks read | Events for a month, or upcoming/past for the list |
| `getEvent(teamId, eventId)` | Internal (Prisma) | caller pre-checks read | One event, scoped by `teamId`; `null` means "not on this team" |
| `nextGame(teamId, now?)` | Internal (Prisma) | caller pre-checks read | Soonest unfinished GAME, or `null` |
| `createEvent(teamId, input)` | Internal (Prisma) | caller pre-checks write | Insert |
| `updateEvent(teamId, eventId, input)` | Internal (Prisma) | caller pre-checks write | Update, scoped by `teamId` in the where clause |
| `deleteEvent(teamId, eventId)` | Internal (Prisma) | caller pre-checks write | Delete, scoped by `teamId` in the where clause |
| `createEventAction` | Server Action | COACH+ | Form POST from the schedule page |
| `updateEventAction` | Server Action | COACH+ | Form POST from the detail page |
| `deleteEventAction` | Server Action | COACH+ | Form POST from the detail page |

### Route Tree

```
/t/[teamId]/schedule                       page.tsx      both views + coach create form
    ?view=month  (default)                               month grid
    ?view=list                                           chronological list
    ?month=YYYY-MM                                       month grid navigation
    ?past=1                                              list shows past events instead
/t/[teamId]/schedule/[eventId]             page.tsx      detail + coach edit/delete
/t/[teamId]/schedule/actions.ts                          create / update / delete
```

`?view=` rather than a client toggle so both layouts are server-rendered, linkable, and
only one ships to a phone on one bar of signal. `/schedule/[eventId]` is also where #7
will hang the per-kid RSVP toggles, so it exists from the start rather than being
retrofitted.

Event creation is an inline form on `/schedule` for coaches, exactly as
`src/app/t/[teamId]/roster/page.tsx` does for adding a player — no separate `/new` route.

## Key Decisions

### Decision 1: Event times are anchored to one app-wide timezone

**Options considered:**
- **Option A** — App-wide IANA zone, `America/Chicago`, read from `APP_TIMEZONE` with a
  hardcoded fallback. `Event.startsAt` stores a true UTC instant.
- **Option B** — A `timezone` column on `Team`, set per team in settings.
- **Option C** — Store the coach's wall clock *as if* it were UTC and format everything in
  UTC.
- **Option D** — Store the instant, format client-side in the viewer's local zone.

**Decision:** **Option A — app-wide `America/Chicago`**, confirmed by the coach.

**Rationale:** This is a one-coach app for teams in one place (product brief: "one person
who coaches youth baseball teams across seasons"), so a per-team column (B) buys
correctness nobody needs at the cost of a schema change, a migration, and a settings
field — expanding an issue the milestone scoped as UI + one helper.

Option C is the tempting cheap one and is a trap worth naming, because it looks like it
works. Storing 6:00 PM Central as `18:00Z` round-trips fine through a UTC-rendered page,
but it is not the instant the game happens — the real instant is `23:00Z`. So
`startsAt > now()` would consider a 6:00 PM game past at 1:00 PM Central, and the
readiness panel (#12) and view page (#8) would both silently jump to next Saturday's game
five hours early, on game day, which is the one moment the app has to be right. Any
future ICS feed or reminder job (both *Later* items in the brief) would inherit the same
lie.

Option D pushes formatting to the client, which costs an SSR hydration mismatch, a blank
or wrong time before hydration on a slow field connection, and shows a travelling parent
the game in the wrong zone.

**Implementation:** `APP_TIMEZONE` is added to `.env.example` documented as an IANA zone
name, defaulting to `America/Chicago`. `src/lib/calendar.ts` reads it once, validates it
against `Intl` at module load, and falls back to the default with a `console.error` if it
is unparseable — a typo in an env var must not take the app down at a field.

Verified in this environment: Node 22 ships full ICU and
`Intl.DateTimeFormat` with `timeZone: "America/Chicago"` resolves correctly; the container
itself runs `TZ=UTC`, matching Vercel.

### Decision 2: Add `@date-fns/tz` rather than hand-rolling offset math

**Options considered:**
- **Option A** — `date-fns` core only, as Decision 12 literally reads.
- **Option B** — `date-fns` + `@date-fns/tz`'s `TZDate`.
- **Option C** — No date library for the timezone-sensitive parts: `Intl.DateTimeFormat`
  for formatting plus integer `{year, month, day}` arithmetic for the grid.

**Decision:** **Option B — add `@date-fns/tz` (v1.5.0, verified available on npm).**

**Rationale:** Option A does not actually work, and the way it fails is quiet. Every
`date-fns` core function operates in the *system* timezone: `startOfMonth`,
`startOfWeek`, `eachDayOfInterval`, and `format` all resolve against `TZ`. On Vercel
`TZ=UTC`, so a 7:30 PM Central game on the 31st buckets into the *next* month's grid, and
`format` prints 00:30 the following day. Worse, the bug is invisible on a developer
machine already set to Central and appears only in production — and the reverse in tests,
where a UTC-midnight `Date` under a Central-set `TZ` lands on the previous day.

Option C is correct and dependency-free, but re-implements DST-aware wall-clock↔instant
conversion by hand — a fixed-point iteration over `Intl.formatToParts` offsets — which is
precisely the kind of thing to import rather than write.

`@date-fns/tz` is the official `date-fns` v4 companion (v4's headline feature was
first-class timezone support, split into this package). `TZDate` is a `Date` subclass, so
every existing `date-fns` function keeps working and simply resolves in the attached zone.
One `new TZDate(y, m, d, h, min, 0, APP_TIMEZONE)` gives the correct UTC instant for a
wall clock **including DST**, solving parsing, bucketing, and formatting in one move.

This is consistent with **Decision 12, not a revision of it**. Decision 12 rejects
*calendar component libraries* (FullCalendar, `react-big-calendar`) in favour of a
hand-built grid; we still hand-build the grid. `.agents/app-brainstorm/` stays untouched.

### Decision 3: `nextGame` uses a 3-hour grace window

**Options considered:**
- Strict `startsAt > now`.
- `startsAt + 3h > now`.
- Any GAME on the same calendar day wins.

**Decision:** **`startsAt + 3h > now`**, as `GAME_GRACE_MS` exported from `calendar.ts`.

**Rationale:** A game that started forty minutes ago is still the game the coach is
standing at. Under a strict comparison the view page and readiness panel flip to next
week's game at first pitch — the exact moment the coach is most likely to open the app.
Three hours comfortably covers a youth game with no realistic risk of shadowing a genuine
next game, since two games on the same team within three hours does not happen.

The same-calendar-day rule was rejected because it needs the timezone answer to define
"today" *and* still shows a 10:00 AM game at 11:00 PM that night.

The window is a named exported constant so #8 and #12 read the same number rather than
each re-deriving it.

### Decision 4: The month grid is built from a pure function over a day list

`buildMonthGrid(year, month)` returns weeks of `{ date, inMonth }` cells — no events, no
DOM, no data access — and `bucketEventsByDay(events)` returns a `Map<string, Event[]>`
keyed by `YYYY-MM-DD` in the app timezone. The page joins them.

**Rationale:** This is the AGENTS.md pure-core rule applied to the one part of this issue
with real edge cases (week padding, 6-row months, leap Februaries). Keeping the grid free
of events means the grid tests are integer assertions with no fixtures, and the bucketing
tests are timezone assertions with no grid.

Weeks start **Sunday** (US convention). Row count is **variable, 5 or 6** — the natural
result of padding to whole weeks — rather than always 6. A fixed 6 rows would add a
trailing empty week to most months, which costs vertical space on a phone for a stability
nobody notices.

### Decision 5: Write actions scope by `teamId` in the where clause, never by trust

`updateEvent` and `deleteEvent` both put `teamId` in the Prisma `where`, and the detail
page loader resolves the event through `getEvent(teamId, eventId)`.

**Rationale:** This is the same lesson `requireRosterEntry` in
`src/app/t/[teamId]/roster/actions.ts` documents. `requireTeamAccess` proves the caller
may write to *this team*; it cannot prove the record they named belongs to it, because a
server action POSTs to the current page URL and only the action knows what it is about to
mutate. Without the scope, a coach on team A could POST any `eventId` and delete team B's
game — cascading team B's RSVPs with it.

## Security & Permissions

| Operation | Minimum role | Enforcement |
|---|---|---|
| Read schedule (both views) | any member | `requireTeamAccess(teamId, { intent: "read" })` at the top of each `page.tsx` |
| Read event detail | any member | same, plus `getEvent(teamId, eventId)` scoping |
| Create / edit / delete event | COACH | `requireTeamAccess(teamId, { intent: "write", minRole: "COACH" })` at the top of each action |

- **Archived teams reject every write**, owner included — `intent: "write"` already
  handles this in `checkTeamAccess`; nothing extra is needed here.
- **Every page calls `requireTeamAccess` itself**, not relying on
  `src/app/t/[teamId]/layout.tsx`. Layouts do not re-run on client-side navigation, so a
  page that trusts the layout is unprotected on exactly the transitions that matter.
- **Nothing goes in `proxy.ts`.** It stays a cookie-read redirect, per AGENTS.md.
- The `?view`, `?month`, and `?past` params are attacker-controlled strings and are
  validated with Zod, falling back to defaults rather than throwing.

## Error Handling

Follows the shape-based rule already documented in `src/lib/roster.ts`:

| Function | On database error | Why |
|---|---|---|
| `listEvents` | swallow, log, return `[]` | A list — a dead database renders an empty page rather than crashing a request |
| `getEvent` | **propagate** | Caller turns `null` into `notFound()`; a swallowed outage would report "this event doesn't exist" for one that does |
| `nextGame` | **propagate** | `null` is a meaningful product state ("no upcoming game"). A swallowed outage would render that state falsely and mislead #8 and #12 |
| `createEvent` / `updateEvent` / `deleteEvent` | **propagate** | A write that silently fails but looks successful is worse than one that throws |

Server actions mirror `roster/actions.ts` exactly: `unstable_rethrow(error)` first, then
`TeamAccessError` → `redirect(...?error=access)`, otherwise rethrow. Validation failures
redirect with an `?error=` code resolved through an `ERROR_MESSAGES` map on the page.

`Event` carries **no unique constraints**, so there is no `P2002` translation to write —
nothing analogous to `rosterWriteFailure` is needed.

## Testing Strategy

| Layer | Test type | File | Notes |
|---|---|---|---|
| Pure calendar core | Unit | `src/lib/calendar.test.ts` | The heart of this issue. Wall-clock↔instant across both 2026 DST boundaries; grid padding for a Sunday-start month, a 6-row month, and a leap February; day bucketing for a late-evening event that would misbucket under UTC; `selectNextGame` for games-only, grace window, no-upcoming-game, and empty input |
| Data access | Unit (mocked `./db`) | `src/lib/schedule.test.ts` | Follows `src/lib/roster.test.ts`: module-level `vi.fn()` spies, `vi.mock("./db")`. Asserts `teamId` is in every where clause and that `nextGame` filters `type: "GAME"` |
| Server actions | Unit (mocked libs) | `src/app/t/[teamId]/schedule/actions.test.ts` | Follows `roster/actions.test.ts`. Asserts `minRole: "COACH"`, PARENT rejection, cross-team `eventId` rejection, and validation redirects |
| Schedule page | Unit (`renderToStaticMarkup`) | `src/app/t/[teamId]/schedule/page.test.tsx` | Follows `directory/page.test.tsx`. Both views render; create form hidden from PARENT; empty state; `notFound()` for a non-member |
| Detail page | Unit (`renderToStaticMarkup`) | `src/app/t/[teamId]/schedule/[eventId]/page.test.tsx` | Edit/delete controls hidden from PARENT; `notFound()` for an event on another team |

Tests must not depend on the machine's `TZ`. Every timezone assertion goes through
`APP_TIMEZONE` explicitly, and `selectNextGame` takes `now` as a parameter rather than
calling `new Date()` internally.

## Config Changes

- [ ] Schema / index changes — **none required.** `Event` and `@@index([teamId, startsAt])`
      already exist; no migration.
- [ ] Access rule changes — **none required.** `requireTeamAccess` covers this issue as-is.
- [ ] Environment variables — **`APP_TIMEZONE`** added to `.env.example`, documented as an
      IANA zone name, default `America/Chicago`. Optional: the fallback is hardcoded, so
      the app boots without it.
- [ ] Dependency changes — **`@date-fns/tz@^1.5.0`** added (see Decision 2). Verified
      available on npm from this environment.

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| `date-fns` core silently resolving in `TZ=UTC` on Vercel, misbucketing late-evening events into the wrong month | **High** | Decision 2 — `TZDate` everywhere a date is bucketed, compared, or formatted. A test asserts an 8:00 PM Central event on the last of the month lands in that month |
| Wall clock that does not exist (2:30 AM, 8 Mar 2026) or is ambiguous (1:30 AM, 1 Nov 2026) | Low | `TZDate` resolves both deterministically; behaviour is pinned by a test rather than left to chance. Youth games at 2 AM do not occur |
| `nextGame` flipping to next week's game at first pitch | Med | Decision 3's 3-hour grace, as a shared exported constant |
| A coach deleting an event, cascading its RSVPs irreversibly | Med | Two-step confirm on the detail page; the delete action redirects back to the schedule. Documented as permanent, consistent with the app's no-undo stance on chart edits |
| A coach on team A POSTing team B's `eventId` | **High** | Decision 5 — `teamId` in every `where` clause and in `getEvent` |
| Invalid `APP_TIMEZONE` value making `Intl` throw at request time | Med | Validated once at module load in `calendar.ts`, falling back to `America/Chicago` with a logged error |
| Hand-built grid getting week padding wrong at month boundaries | Med | Grid is a pure integer function with tests for a Sunday-start month, a 6-row month, and a leap February |
| `?month=` / `?view=` / `?past=` tampering | Low | Zod-validated with fallbacks, never thrown on |
| A parent seeing coach-only controls | Low | Role gating in the page plus the action's own `minRole: "COACH"`; hiding the UI is never the enforcement |
| `node_modules` is absent in a fresh session | Low | `pnpm install && pnpm db:generate` before any work — the generated Prisma client is gitignored |
