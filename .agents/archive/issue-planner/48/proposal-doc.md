# Proposal — Team home: parent dashboard with next event, one-tap RSVP, and kid chart summary (#48)

## Executive Summary

Team home currently answers none of the three questions the product brief says the app
exists for (when, where, is my kid playing) — they all live two or more taps deeper, and
RSVPing takes 4 taps and 5 page loads. This change turns `/t/[teamId]` into a parent
dashboard: a next-event card (games **and** practices — informational, unlike readiness),
one-tap Going/Not-going per guarded kid posting to the existing `rsvpAction` and
redirecting straight back, and a one-line chart summary per kid
(`Reese · #12 · Bats 3rd · SS`, with `OF` on allPlay teams and `Bench` on selective ones).

The approach is pure composition — no schema changes, no new tables, and almost no new
queries. Three small additions to `src/lib/` keep every rule in one tested, DB-free place:
a `nextEvent` helper (because `nextGame` is games-only by deliberate contract and must
stay that way for readiness), a lifted `chartRole` shared with the readiness page, and an
enum-validated `from` field on `rsvpAction` so the redirect comes home without opening a
redirect vulnerability or duplicating the action's authorization core.

## Scope

### In Scope
- Next-event card on team home for every role, with date/time, mapped location, notes,
  and a link to the event page; quiet empty state when nothing is scheduled
- One-tap RSVP per guarded kid with current state visible, staying on team home
- One-line jersey / batting-slot / position summary per guarded kid (Bench/OF handling
  consistent with both diamonds via `fieldedPositions`)
- Archived teams: summaries and state remain, RSVP forms hidden; honest error copy on the
  race case
- Lifting `chartRole` into `src/lib/chart-role.ts`, shared with the readiness page

### Out of Scope
- Any per-game lineup/chart data (Decision 16 stands; readiness stays coach-only at
  `/readiness`)
- Changes to `nextGame` / readiness / view-page behavior
- Push or email notifications about upcoming events
- Schedule-list or event-page UI changes beyond the `rsvpAction` redirect parameter

## Acceptance Criteria

1. A parent opening team home sees the next event (game or practice) with time, place,
   and a link to the event page
2. They can RSVP each of their kids in one tap from this page, with the current state
   visible
3. Each guarded kid shows jersey, batting slot, and position (or Bench/OF) in one line
4. Archived teams show the summary but no RSVP buttons (no misleading write-rejection
   copy)
5. Coaches' view is unchanged apart from the next-event card, which is also shown to them

## Implementation Phases

| Phase | Description | Areas Affected |
|---|---|---|
| 1 | Pure logic + data layer: `selectNextEvent`, `nextEvent`, lift `chartRole` | `src/lib/calendar.ts`, `src/lib/schedule.ts`, `src/lib/chart-role.ts` (new), `readiness/page.tsx` |
| 2 | `rsvpAction` gains enum `from=home` redirect-back | `src/app/t/[teamId]/schedule/actions.ts` |
| 3 | Team home dashboard UI + tests | `src/app/t/[teamId]/page.tsx`, `page.test.tsx` |

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Loosening `nextGame` would break readiness's games-only contract | High | New `nextEvent`/`selectNextEvent` instead; `selectNextGame` delegates so "not finished" is defined once; regression tests pin games-only behavior |
| Redirect-back becomes an open redirect | High | `from` is Zod `z.enum(["home"])` — never a URL; invalid values fall back to current behavior |
| Lifting `chartRole` changes readiness rendering | Med | Bench label is opt-in; readiness imports with today's exact behavior; existing readiness suite is the guard |
| Archived-team RSVP shows misleading copy (AC 4) | Med | Forms hidden at render; action backstop routes `?error=access` to team home with the event page's honest copy |
| Team home's "no navigation links" pinned test breaks | Low | Assertion consciously narrowed to the old nav-wall destinations, intent preserved in the comment |
| DB outage renders as "nothing scheduled" | Med | `nextEvent` does not swallow errors — same contract as `nextGame` |

## Effort Estimate

**Overall:** Small (1–2 days)

| Phase | Estimate |
|---|---|
| Phase 1 | ~0.5 day |
| Phase 2 | ~0.25 day |
| Phase 3 | ~0.75–1 day (page + the bulk of the tests) |

## Next Steps

1. Review and approve this proposal.
2. Follow `task-doc.md` to implement phase by phase (single PR; phases are commit
   boundaries, not separate PRs).
3. After implementation, finalize with the `finalize-issue` skill (verify AC against the
   PR, archive `.agents/issue-planner/48/`, merge, and close the issue).
