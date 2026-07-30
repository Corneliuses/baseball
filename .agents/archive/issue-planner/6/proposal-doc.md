# Proposal — Phase 6: Schedule — events, month grid, and list view (#6)

## Executive Summary

Coaches create games and practices with a time, location, opponent, and notes; every team
member reads them as a hand-built month grid or a chronological list, both served from
`/t/[teamId]/schedule` and both linking through to a per-event detail page. The issue also
introduces `nextGame(teamId)` — the one place the "games only, never practices" rule
lives — which the view page (#8) and the readiness check (#12) will both consume.

The interesting work is not the calendar. `Event` and its `@@index([teamId, startsAt])`
already exist, so there is **no schema change and no migration**, and Decision 12 already
settled that the grid is hand-built. The real design problem is that this is the first
feature in the app where a *time* is authored and read back, and nothing in the schema,
the product brief, or `stack-decisions.md` says which timezone that time is in. That
question was resolved during planning: **all event times are app-wide US Central
(`America/Chicago`)**, `Event.startsAt` stores a true UTC instant, and `@date-fns/tz` does
the zone-aware math — because `date-fns` core resolves against the *system* timezone,
which is UTC on Vercel and would quietly file a 7:30 PM game into the wrong month.

## Scope

### In Scope

- `Event` create, edit, and delete at COACH level, covering `type`, `startsAt`,
  `location`, `opponent`, and `notes`
- Hand-built month grid, navigable by month, Sunday-start, padded to whole weeks
- Chronological list view — upcoming ascending by default, past reachable behind a toggle
- `/t/[teamId]/schedule/[eventId]` detail page with the coach's edit and delete controls
- `src/lib/schedule.ts` with `nextGame(teamId)`, filtered to `EventType.GAME`
- `src/lib/calendar.ts` — the pure, DB-free timezone, grid, bucketing, and next-game
  selection core, exhaustively unit-tested
- One app-wide timezone, `APP_TIMEZONE`, documented in `.env.example`
- A Schedule link on the team home page

### Out of Scope

- **RSVP** — #7 owns it, and will hang the per-kid toggles on the event detail page this
  issue creates
- **The readiness panel and view page** — #12 and #8; this issue only supplies `nextGame`
- **Per-team timezones** — deliberately rejected in favour of the app-wide value; the
  upgrade path to a `Team.timezone` column stays open
- **Recurrence, drag-to-reschedule, week/day views** — Decision 12's whole point
- **ICS feed and game-day reminders** — explicit *Later* items in the product brief
- **Any schema change** — including any per-game lineup row, which Decision 16 removed
  on purpose

## Acceptance Criteria

1. A COACH or OWNER can create an `Event` with `type` (GAME | PRACTICE), `startsAt`, and
   optional `location`, `opponent`, and `notes`.
2. A COACH or OWNER can edit and delete an existing event. A PARENT can do neither — the
   controls are not rendered, and the actions reject the write.
3. Any team member can read the schedule as a month grid, navigable by month, with each
   day cell listing that day's events.
4. Any team member can read the schedule as a chronological list, defaulting to
   today-forward ascending, with past events reachable behind a toggle (newest-first).
5. Both views live at `/t/[teamId]/schedule` under a `?view=month|list` search param, and
   both link each event to `/t/[teamId]/schedule/[eventId]`.
6. `nextGame(teamId)` returns the soonest unfinished `EventType.GAME` and **never** a
   `PRACTICE`; it returns `null` when there is no such game.
7. A game counts as "next" until **3 hours after** `startsAt`, so the app keeps pointing
   at today's game while it is being played.
8. All event times are authored and displayed in US Central (`America/Chicago`), app-wide,
   regardless of server or viewer timezone.
9. The pure date helpers are unit-tested: month bucketing, week padding, wall-clock↔instant
   conversion across both DST boundaries, and next-game selection including the
   no-upcoming-game case.
10. `pnpm check` and `pnpm build` are both green.

## Key Decisions

| # | Decision | Why it matters |
|---|---|---|
| 1 | App-wide `America/Chicago`, not a `Team.timezone` column | One coach, one region. A per-team column costs a schema change, a migration, and a settings field for correctness nobody needs |
| 2 | Add `@date-fns/tz`; do not use `date-fns` core for zone-sensitive work | `date-fns` core resolves in the *system* zone. On Vercel that is UTC, so a 7:30 PM Central game buckets into the next month and prints as 00:30 the next day — invisible on a Central-set dev machine, broken in production |
| 3 | `nextGame` uses a 3-hour grace window, as a shared exported constant | A strict `startsAt > now` flips the view page and readiness panel to next Saturday at first pitch — the moment a coach is most likely to open the app |
| 4 | The month grid is a pure function over integers, joined to events by `YYYY-MM-DD` key | Grid tests need no fixtures; bucketing tests need no grid. Isolates the two things with real edge cases |
| 5 | `teamId` in every write's `where` clause | `requireTeamAccess` proves the caller may write to *this team*, not that the record they named belongs to it. Without this, a coach on team A could delete team B's game and cascade its RSVPs |

**On Decision 12:** adding `@date-fns/tz` is consistent with it, not a revision of it.
Decision 12 rejects *calendar component libraries* in favour of a hand-built grid; we
still hand-build the grid. `.agents/app-brainstorm/` is not edited.

## Implementation Phases

| Phase | Description | Areas affected |
|---|---|---|
| 1 | Pure calendar core — timezone conversion, month grid, day bucketing, `selectNextGame` — plus its full test suite and the `.env.example` entry | `src/lib/calendar.ts`, `src/lib/calendar.test.ts`, `.env.example`, `package.json` |
| 2 | Data access — team-scoped event reads and writes, and `nextGame(teamId)` | `src/lib/schedule.ts`, `src/lib/schedule.test.ts` |
| 3 | Routes, server actions, and UI — both views, the create form, the detail page, edit and delete | `src/app/t/[teamId]/schedule/`, `src/app/t/[teamId]/page.tsx` |

Phasing is warranted here rather than ceremonial: Phase 1 is where every genuine edge case
lives (DST, week padding, month boundaries) and it is testable in complete isolation, so
getting it green before any UI exists means a grid rendering bug can never be confused
with a date-math bug. Phase 2 is a thin, mechanical layer over Phase 1. Phases 1 and 2 are
also exactly what #7 needs unblocked, so they can merge ahead of Phase 3 if that helps.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `date-fns` core silently resolving in `TZ=UTC` on Vercel, misfiling late-evening events | **High** | Decision 2: `TZDate` for every bucket, compare, and format. A test asserts an 8:00 PM Central event on the last of the month stays in that month |
| A coach on team A POSTing team B's `eventId`, deleting a game and cascading its RSVPs | **High** | Decision 5: `teamId` in every `where` clause, and the detail loader resolves through `getEvent(teamId, eventId)` |
| `nextGame` flipping to next week's game at first pitch, breaking #8 and #12 on game day | Med | Decision 3's 3-hour grace, exported as a shared constant so #8 and #12 read the same number |
| Deleting an event irreversibly destroys its RSVPs (`onDelete: Cascade`) | Med | Two-step confirm on the detail page with copy that says so; consistent with the app's stated no-undo stance |
| DST-boundary wall clocks (nonexistent 2:30 AM on 8 Mar, ambiguous 1:30 AM on 1 Nov) | Low | `TZDate` resolves both deterministically; behaviour is pinned by tests rather than left to chance |
| Hand-built grid getting week padding wrong at month boundaries | Med | Pure integer function, tested for a Sunday-start month, a 6-row month, and a leap February |
| Invalid `APP_TIMEZONE` making `Intl` throw at request time | Med | Validated once at module load, falling back to `America/Chicago` with a logged error — a typo must not take the app down at a field |
| Scope creep into RSVP, since the detail page is where it will live | Low | #7 owns every RSVP path; this issue ships the page with no attendance UI on it |

## Effort Estimate

**Overall: Medium (3–4 days).**

| Phase | Estimate |
|---|---|
| Phase 1 — pure calendar core + tests | 1–1.5 days |
| Phase 2 — data access + tests | 0.5 day |
| Phase 3 — routes, actions, UI + tests | 1.5–2 days |

The estimate sits above Decision 12's "roughly a day of work" for the grid because that
figure covers the grid alone. This issue is the grid plus a list view, full event CRUD
with server actions, a detail page, the `nextGame` contract two later issues depend on,
and the timezone foundation none of the earlier phases needed. Roughly half the time is
tests and the pre-commit gate, in line with how #4 and #5 actually went.

## Next Steps

1. Review and approve this proposal.
2. Follow `task-doc.md` phase by phase, committing at each phase boundary.
3. After implementation, finalize with the `finalize-issue` skill — verify the acceptance
   criteria against the PR, archive `.agents/issue-planner/6/`, merge, and close #6.
