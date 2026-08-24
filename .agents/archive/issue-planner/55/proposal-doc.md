# Proposal — Readiness: show the effective batting order and decline badges in the chart editors (#55)

## Executive Summary

The readiness module already computes `effectiveOrder` — the next game's batting order
with declined players removed and ranks closed up — but renders it nowhere, and the two
chart editors the readiness page links to deliberately load no RSVP data. This change
closes finding C3's loop with pure reads: the readiness page gains a card showing
"Saturday's order as it stands" whenever a decline has changed the batting order, and
both editors badge declined players' chips with the app's existing declined vocabulary
(`RSVP_STYLE.declined`, "Not going") when a next game exists.

Nothing is stored, filtered, or auto-benched. The declined set travels to the editors as
a separate `declinedEntryIds` prop rather than on the entry rows, so the draft logic in
`src/lib/chart.ts` structurally still cannot see RSVP state — the editors' existing
"cannot be filtered by who has replied" guarantee survives intact, and the chart remains
standing per Decision 16. Badges are static markup only, respecting the dnd-kit/Motion
ownership rule.

## Scope

### In Scope
- Readiness page: read-only effective-order card (dugout-row styling, closed-up slot
  numbers), rendered only when a player holding a batting slot declined; one-line empty
  state when every batter declined
- Both chart editors: "Not going" tag on declined players' chips — in the slots/diamond
  and in the pool/zone — driven by a new server-derived `declinedEntryIds` prop
- Loader changes in both editor pages: `nextGame` + `listEventRsvps` reads (no game →
  empty prop, render identical to today)
- Tests at every layer listed in the task doc

### Out of Scope
- Any write path, RSVP storage, or per-game lineup rows (Decision 16)
- Filtering, auto-benching, or disabling declined players' chips
- "No response" indication in the editors or on the effective-order card (the awaiting
  card already accounts for silence)
- An effective *positions* chart (uncovered positions are already rendered as their own
  card)

## Acceptance Criteria

1. Readiness shows the declined-removed, ranks-closed batting order for the next game
   (per the clarification: only when a decline actually changed the order — otherwise the
   effective order is the standing order already on `/view`)
2. Chart editors show which players have declined the next game, without changing
   drag/save semantics
3. No RSVP data is stored or written by any of this — pure reads
4. With no upcoming game, both editors render exactly as today

## Implementation Phases

| Phase | Description | Areas Affected |
|---|---|---|
| 1 | Readiness — effective-order card | `src/app/t/[teamId]/readiness/` |
| 2 | Editors — declined badges via `declinedEntryIds` prop | `src/app/t/[teamId]/chart/`, `src/app/t/[teamId]/chart/positions/` |

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Badge becomes a foothold for filtering the pool later | Med | Declined set never rides the entry type; draft logic in `src/lib/chart.ts` can't see it; editor comments restate the boundary |
| Animated badge fights dnd-kit's `transform` | Low | Static styling only — no Motion, no CSS animation on drag elements |
| Swallowed outage renders "nobody declined" | Low | New reads follow each page's existing contract: no try/catch, outages propagate |
| Coach misreads the card as saved state | Low | Copy is explicit ("if the chart stays as-is… nothing is saved here"); no write path exists on the page |

## Effort Estimate

**Overall:** Small (1–2 days)

| Phase | Estimate |
|---|---|
| Phase 1 | 0.5 day |
| Phase 2 | 1 day |

## Next Steps

1. Review and approve this proposal.
2. Follow `task-doc.md` to implement phase by phase.
3. After implementation, finalize with the `finalize-issue` skill (verify AC against the
   PR, archive `.agents/issue-planner/55/`, merge, and close the issue).
