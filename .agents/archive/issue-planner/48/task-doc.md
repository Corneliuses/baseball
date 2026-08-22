# Task Doc — Team home: parent dashboard with next event, one-tap RSVP, and kid chart summary (#48)

> **Scope changed after this plan was approved (21 Aug 2026).** Team home now shows the
> next **three** events, each with its own RSVP buttons, rather than one card anchored to
> the soonest. In the shipped code `nextEvent` is `nextEvents(teamId, limit, now)`,
> `selectNextEvent` is the `limit: 1` case of `selectNextEvents`, the buttons are grouped
> under each event rather than under each child, and one batched read feeds
> `buildRsvpStateMapsByEvent`. The checklist below is left as approved: it is the record
> of what was planned, and rewriting it to match the outcome would erase the fact that
> the scope moved mid-flight. Read it with this note in mind.

## Prerequisites

- [ ] `pnpm install && pnpm db:generate` (generated client is gitignored; nothing
      typechecks without it)
- [ ] No blocking issues — all queries and models exist; no schema changes

## Phase 1: Pure logic + data layer (`src/lib/`)

- [ ] `src/lib/calendar.ts` — add `selectNextEvent<T extends GameCandidate>(events, now)`:
      soonest event of any type with `startsAt > now − GAME_GRACE_MS`. Refactor
      `selectNextGame` to filter `type === "GAME"` and delegate, so "not yet finished" is
      defined once. (Consider renaming `GameCandidate` → keep as-is; no exported-API break.)
- [ ] `src/lib/calendar.test.ts` — cases: practice sooner than game wins; game-only lists
      unchanged; grace window boundary; empty → null; regression: `selectNextGame` still
      skips practices.
- [ ] `src/lib/schedule.ts` — add `nextEvent(teamId, now = new Date())` mirroring
      `nextGame`: same `EVENT_SELECT`, no `type` filter, no `take: 1` (same rationale
      comment), errors NOT swallowed, returns `selectNextEvent(candidates, now)`. Extend
      the module docstring's error-handling list.
- [ ] `src/lib/schedule.test.ts` — mirror the existing `nextGame` tests for `nextEvent`.
- [ ] `src/lib/chart-role.ts` — new pure module: move `ordinal()` and `chartRole()` out of
      `src/app/t/[teamId]/readiness/page.tsx` verbatim, then add optional
      `{ benchLabel?: string }` third parameter: on a selective team with
      `position === null` (or unfielded), append `benchLabel` when provided (today's
      behavior = no label when omitted). Named exports, `@/` imports.
- [ ] `src/lib/chart-role.test.ts` — co-located tests: full line, allPlay null → `OF`,
      allPlay stale `CENTER_FIELD` → `OF`, selective null default vs `benchLabel: "Bench"`,
      selective fielded position → `POSITION_LABELS` value, ordinals incl. 11th/12th/13th,
      batting-only and position-only entries.
- [ ] `src/app/t/[teamId]/readiness/page.tsx` — delete the local copies, import
      `chartRole` from `@/lib/chart-role` (no `benchLabel` — output identical).
- [ ] Run `pnpm test` — the readiness suite is the regression guard for the lift.

## Phase 2: `rsvpAction` redirect-back

- [ ] `src/app/t/[teamId]/schedule/actions.ts` — parse optional `from` field with
      `z.enum(["home"]).optional()` (safeParse; anything invalid = absent, current
      behavior). When `from === "home"`:
      - success → `revalidatePath("/t/[teamId]", "page")` (in addition to the event-page
        revalidate) and `redirect(`/t/${teamId}?saved=1`)`
      - `invalid-rsvp`, `not-your-player`, `access` → `redirect(`/t/${teamId}?error=…`)`
      Keep every authorization check untouched; `from` influences redirect targets only.
- [ ] `src/app/t/[teamId]/schedule/actions.test.ts` — new cases: `from=home` success and
      each error redirect land on team home; missing/garbage `from` keeps event-page
      redirects (regression).

## Phase 3: Team home page

- [ ] `src/app/t/[teamId]/page.tsx` — extend the loader:
      - accept `searchParams: Promise<{ error?: string; saved?: string }>`
      - after the existing access + team fetch: `nextEvent(teamId)` (no try/catch), and
        `guardedRosteredPlayerIds(teamId, userId)`; when guarding ≥1 kid, `getChart(teamId)`
        filtered to guarded playerIds and, if an event exists,
        `listEventRsvps(teamId, event.id)` → `buildRsvpStateMap` (fetch in `Promise.all`)
- [ ] Render, in order: team facts (unchanged) → feedback line (`?saved` role="status",
      `?error` role="alert" with the event page's `ERROR_MESSAGES` copy) → next-event card
      → "Your kids" section → coach contacts (unchanged) → `InstallPrompt` (stays last)
- [ ] Next-event card: heading via the event page's logic (`Game vs X` / `Game` /
      `Practice`), `formatEventDateTime(event.startsAt)`, location as `mapsUrl` link,
      notes, `Details` link to `/t/${teamId}/schedule/${event.id}`; quiet empty state when
      null ("Nothing on the schedule yet." + no RSVP controls anywhere)
- [ ] Per guarded kid row: summary `Name · #N · Bats 3rd · SS` via
      `chartRole(entry, team.allPlay, { benchLabel: "Bench" })` (jersey styled like the
      readiness list, `#` prefix; omit missing pieces gracefully); RSVP state badge from
      `RSVP_STYLE`; Going / Not going forms copied from the event page (hidden
      `teamId`/`eventId`/`playerId`/`response` + `from=home`), variant highlighting the
      current state — rendered only when an upcoming event exists **and**
      `team.archivedAt === null`
- [ ] `src/app/t/[teamId]/page.test.tsx` — convert the `await import("./page")` helper to
      a static import (AGENTS.md rule; readiness suite is the pattern); add mocks for
      `@/lib/schedule` (`nextEvent`), `@/lib/rsvps`, `@/lib/roster` (`getChart`),
      `@/lib/rsvp` passthrough as needed
- [ ] Revise the "no navigation links of its own" test: assert absence of the old nav-wall
      destinations (`/roster`, `/chart`, `/directory`, `/settings`) instead of all
      `/t/team-1/` hrefs; update its comment to say why the event link is content, not nav
- [ ] New tests: card for a game and for a practice; empty-schedule state; kid summary
      lines (allPlay OF, selective Bench, jersey/batting present and absent); RSVP forms
      post `from=home` and show current state; archived team → summaries yes, forms no;
      member guarding nothing → no kids section; parent contact card and coach behavior
      unchanged (existing tests keep passing)

## Pre-Commit Gate

Per AGENTS.md `## Commands`:

- [ ] `pnpm check` (lint → typecheck → test) ✅ — needs no database
- [ ] Build not run locally (`pnpm build` requires `DATABASE_URL`; `pnpm exec next build`
      only if build verification is specifically wanted)

## Files Modified / Created

| File | Change |
|---|---|
| `src/lib/calendar.ts` | Add `selectNextEvent`; `selectNextGame` delegates to it |
| `src/lib/calendar.test.ts` | Tests for `selectNextEvent` + regression for `selectNextGame` |
| `src/lib/schedule.ts` | Add `nextEvent` data helper |
| `src/lib/schedule.test.ts` | Tests for `nextEvent` |
| `src/lib/chart-role.ts` | **New** — `chartRole` + `ordinal` lifted from readiness page, `benchLabel` option |
| `src/lib/chart-role.test.ts` | **New** — co-located tests |
| `src/app/t/[teamId]/readiness/page.tsx` | Import `chartRole` from `@/lib/chart-role`; delete local copies |
| `src/app/t/[teamId]/schedule/actions.ts` | `rsvpAction`: optional enum `from` field → team-home redirects + revalidate |
| `src/app/t/[teamId]/schedule/actions.test.ts` | Redirect-target tests |
| `src/app/t/[teamId]/page.tsx` | Dashboard: next-event card, kid summaries, one-tap RSVP, feedback line |
| `src/app/t/[teamId]/page.test.tsx` | Static import conversion, revised nav assertion, new dashboard tests |
