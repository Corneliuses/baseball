# Proposal — Phase 7: RSVP with tri-state semantics (#7)

## Executive Summary

This phase lets parents record attendance per kid per event — games and practices — and
establishes the three-state RSVP model the rest of the MVP builds on: **attending**,
**declined**, and **no-response** are distinct, with the absence of an `Rsvp` row being
the third state. The schema already encodes this; the work is a pure contract module
(`src/lib/rsvp.ts`) that #8 (view page) and #12 (readiness) will both consume, a thin
team-scoped data wrapper, a guarded server action upserting on
`@@unique([eventId, playerId])`, and an Attendance card on the event detail page.

The approach copies the repo's established pure-module-plus-thin-wrapper pattern
(calendar/schedule, roster-rules/roster) and the existing server-action shape. No schema
change, no new dependencies. Two rules are load-bearing: the write is restricted to
players the caller guards **and** that are rostered on the URL's team (the guardian link
is global, so guardianship alone would permit cross-team writes), and RSVP is reporting,
never a gate — nothing filters roster or chart placement by it.

## Scope

### In Scope
- Pure `src/lib/rsvp.ts`: `RsvpState`, `deriveRsvpState`, `buildRsvpStateMap` + tests
- New `src/lib/rsvps.ts` data wrapper: event RSVP reads, guarded-player query, upsert
- `rsvpAction` in the schedule actions file, open to all roles (PARENT+), archived teams rejected
- Attendance card on `/t/[teamId]/schedule/[eventId]` for games and practices: tri-state
  badges for the whole roster, Going / Not going toggles for the caller's own kids only

### Out of Scope
- Attendance summaries on the schedule list/month views (#8's view page owns read-side surfacing)
- Readiness consumption of RSVP state (#12)
- A "clear my response" path back to `no-response` (deliberate — an answer should not be deletable into silence)
- Coach override to RSVP on a family's behalf (the issue's guardian rule admits no exception)
- Push/live updates — fetch-on-load like every other page

## Acceptance Criteria

1. Pure `src/lib/rsvp.ts` exports `type RsvpState = "attending" | "declined" | "no-response"`
2. `deriveRsvpState`: no row → `no-response`; `attending: true` → `attending`; `attending: false` → `declined`
3. A helper builds a `Map` for one event across a roster, defaulting every unrepresented player to `no-response`
4. `src/lib/rsvp.test.ts` covers all three states and the empty-roster case
5. RSVP toggle server action upserts on `@@unique([eventId, playerId])`
6. The toggle is restricted to players the caller guards via `GuardianPlayer`
7. RSVPs work on practices as well as games
8. The schedule UI surfaces all three states, `no-response` visually distinct from `declined`
9. `pnpm check` green
10. `pnpm build` green

## Implementation Phases

| Phase | Description | Areas Affected |
|---|---|---|
| 1 | Pure contract module + tests | `src/lib/rsvp.ts`, `src/lib/rsvp.test.ts` |
| 2 | Team-scoped data wrapper + tests | `src/lib/rsvps.ts`, `src/lib/rsvps.test.ts` |
| 3 | Server action + Attendance UI + tests | `src/app/t/[teamId]/schedule/actions.ts`, `.../[eventId]/page.tsx`, their tests |

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Cross-team RSVP write (guardian link is global) | High | Guard = guardianship ∩ roster membership on the URL's team, checked inside the action after `requireTeamAccess` |
| RSVP leaking into chart authoring as a filter later | High | Contract documented in the module docstring and design doc; no filtering helper exported |
| Database outage rendered as "nobody responded" | Med | RSVP reads propagate errors instead of swallowing (same rationale as `nextGame`) |
| `no-response` conflated with `declined` in UI | Med | Distinct labels and styles, asserted by page tests |
| Same-family upsert race (`P2002`) | Low | Accepted — single-family writer set, retry would land identically |

## Effort Estimate

**Overall:** Small (1–2 days)

| Phase | Estimate |
|---|---|
| Phase 1 | 0.25 day |
| Phase 2 | 0.25 day |
| Phase 3 | 0.5–1 day |

## Next Steps

1. Review and approve this proposal.
2. Follow `task-doc.md` to implement phase by phase.
3. After implementation, finalize with the `finalize-issue` skill (verify AC against the
   PR, archive `.agents/issue-planner/7/`, merge, and close the issue).
