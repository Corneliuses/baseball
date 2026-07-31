# Proposal — Phase 8: View page — read-only chart with RSVP state (#8)

## Executive Summary

This phase builds the parent-facing payoff: a read-only page at `/t/[teamId]/view` that
shows the labeled baseball diamond and the ordered batting lineup in the context of the
team's next game, with each kid's RSVP state rendered as decoration on the standing chart
— declined players greyed but never removed, no-response visibly distinct and never shown
as "out". It ships before the chart editors so the validation weekend (#9) has a real page
fed by hand-entered chart data.

The approach follows the repo's established shape end to end: a new pure view-model module
`src/lib/chart-view.ts` (tested DB-free, like `rsvp.ts` and `readiness.ts`), one thin
read-only data addition `getChart(teamId)` in `src/lib/roster.ts` (error handling per the
documented `nextGame` precedent), and a server-rendered page whose only client code is a
small Motion reveal wrapper. All prerequisites are in place — #7 is closed and every
consumed function (`nextGame`, `buildRsvpStateMap`, `listEventRsvps`, `POSITION_LABELS`)
exists today.

## Scope

### In Scope
- `/t/[teamId]/view` page: SVG diamond with all nine labeled positions, ordered batting
  lineup, next-game header, responsive stacked/side-by-side layout
- Three distinct visual RSVP states, consistent with the event page's Going / Not going /
  No response vocabulary
- Empty states for "no upcoming game" and "no chart set yet" (partial charts render with
  open slots)
- Motion fade/rise reveal on open (`m` under the existing root `LazyMotion`)
- `getChart(teamId)` read helper and `buildChartView` pure module, both tested
- A "Lineup" button on the team home page so parents can reach the page

### Out of Scope
- Writing `battingOrder` / `position` — chart authoring is #10 (batting order editor) and
  #11 (positions editor); validation-weekend data is entered via `pnpm db:studio`
- Readiness/uncovered-positions warnings — #12 consumes the same inputs separately
- Any RSVP mutation UI — that shipped in #7 on the event page
- Drag & drop of any kind

## Acceptance Criteria

1. Labeled diamond graphic renders all nine positions, labels sourced from
   `POSITION_LABELS`
2. Ordered batting lineup list renders, sorted by `battingOrder`
3. Layout stacks vertically on phones and sits side-by-side on wider screens
4. Attending, declined, and no-response render as three visually distinct states
5. Declined players are greyed in place — never removed from slot or order
6. No-response is distinguishable from declined and never rendered as "out"
7. The chart is read in the context of `nextGame(teamId)`; practices and later games are
   ignored (inherited from `nextGame`'s contract)
8. "No upcoming game" and "no chart set yet" each show a friendly empty state
9. The page reveals with Motion (`LazyMotion` + `m`), with no `layout` prop on any
   future-draggable node
10. RSVP state never reorders, renumbers, or removes anyone (asserted by a dedicated test)
11. `pnpm check` and `pnpm build` pass

## Implementation Phases

| Phase | Description | Areas Affected |
|---|---|---|
| 1 | Pure view model + chart read | `src/lib/chart-view.ts` (+test), `src/lib/roster.ts` |
| 2 | Page, diamond SVG, reveal, nav link | `src/app/t/[teamId]/view/`, `src/app/t/[teamId]/page.tsx` |
| 3 | Page tests + verification gate | `src/app/t/[teamId]/view/page.test.tsx` |

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| RSVP state accidentally filtering or reordering the chart | High | Pure `buildChartView` attaches state as a label only; invariant test asserts membership/order are RSVP-independent |
| Motion `layout` prop colliding with #10/#11's dnd-kit | Med | Single `m.div` reveal wrapper, no `layout` anywhere, rule commented in `Reveal.tsx` |
| Hand-entered (db:studio) charts being partial | Med | `hasChart` treats any non-null slot/position as "chart exists"; unassigned positions render as open slots |
| Outage misread as an empty state on game morning | Med | `getChart` and `nextGame` propagate errors instead of swallowing (documented precedent) |
| Page too heavy for one bar of signal | Med | Server-rendered SVG, one tiny client component, zero new dependencies |

## Effort Estimate

**Overall:** Small (1–2 days)

| Phase | Estimate |
|---|---|
| Phase 1 | 0.25 day |
| Phase 2 | 0.5–1 day (the SVG diamond is the bulk) |
| Phase 3 | 0.25–0.5 day |

## Next Steps

1. Review and approve this proposal.
2. Follow `task-doc.md` to implement phase by phase.
3. After implementation, finalize with the `finalize-issue` skill (verify AC against the
   PR, archive `.agents/issue-planner/8/`, merge, and close the issue).
