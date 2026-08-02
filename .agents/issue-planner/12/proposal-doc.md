# Proposal — Phase 12: Next-game readiness, tri-state (#12)

## Executive Summary

`computeReadiness` currently reads attendance as a binary set, so a family that hasn't
answered yet is reported exactly like one that declined — before the first RSVP arrives,
the check claims every batter is absent and every position uncovered. This proposal
reworks the pure derivation to consume the tri-state `RsvpState` map that #7/#8 already
established (`src/lib/rsvp.ts`), splitting **declined** from **awaiting response** and
driving uncovered positions from declines alone, then builds the first surface for it: a
coach-only, read-only readiness panel at `/t/[teamId]/readiness` for the team's next
game only.

The approach reuses every existing thin DB wrapper (`nextGame`, `getChart`,
`listEventRsvps`) in the same compose-then-derive shape as the view page, adds no schema
or dependency changes, and keeps all of Decision 16's constraints: nothing is stored,
nothing is rearranged, and the panel's only actions are links to the two existing chart
editors — a patch made from there is a normal, permanent chart edit.

## Scope

### In Scope
- Tri-state rework of `computeReadiness` (`ReadonlyMap<string, RsvpState>` input;
  `declined` / `awaiting` split; declined-only `uncoveredPositions`;
  `ready` = no declines affecting the chart; no-response players stay in `effectiveOrder`)
- An `allPlay` parameter so positions a team doesn't field are never reported uncovered
  (small deliberate addition beyond the issue's task list — Decision 4)
- Full rewrite of `src/lib/readiness.test.ts` plus new tri-state coverage
- Coach-only readiness panel page at `/t/[teamId]/readiness` with its page tests
- A coach-only nav button on team home

### Out of Scope
- Any write path, RSVP nudging, or "apply fix" action from the panel (Decision 16;
  chart edits happen only in the #10/#11 editors)
- Email/notification of readiness state (#13), PWA surfacing (#14)
- Practices and later games (next GAME only, via `nextGame`)
- Documentation refresh of AGENTS.md's readiness paragraph (#15 owns it)

## Acceptance Criteria

1. `computeReadiness` accepts a `ReadonlyMap<string, RsvpState>` sourced from `src/lib/rsvp.ts`
2. A player absent from the map is treated as `no-response`, never as absent
3. Output separates declined players from players awaiting response — no merged "absent" list
4. `uncoveredPositions` is driven by declined players only; silence never uncovers a position
5. `ready` = no declines affecting the chart, documented in the module docstring; awaiting responses are surfaced separately and do not block
6. The six existing tests are rewritten and new coverage exists for: nobody responded yet; a mix of all three states; declined-vs-silent producing different output
7. A coach-facing panel shows who is out, which positions that leaves uncovered, and who hasn't answered — for the next game only
8. Data loading uses thin `src/lib/` wrappers; the derivation stays pure and DB-free
9. `uncoveredPositions` keeps scorebook order (`ALL_POSITIONS`)
10. `pnpm check` and `pnpm build` pass

## Implementation Phases

| Phase | Description | Areas Affected |
|---|---|---|
| 1 | Pure derivation rework + test rewrite | `src/lib/readiness.ts`, `src/lib/readiness.test.ts` |
| 2 | Readiness panel page, nav button, page tests | `src/app/t/[teamId]/readiness/`, `src/app/t/[teamId]/page.tsx` |

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Panel grows a special-cased write path (Decision 16 violation) | High | Read-only by design; only affordances are links to the existing editors, which carry their own gates and the `baseline` concurrent-edit guard |
| Coach reads "no response" as "safe" and a kid no-shows | Med | Awaiting section always visible with count, using the shared `RSVP_STYLE` "No response" language — surfaced, not alarming, never hidden |
| Stale position rows on allPlay teams still false-alarm | Med | Decision 4: filter uncovered positions to the fielded set, mirroring `buildChartView` |
| Signature change breaks callers | Low | Zero production callers exist today (only the test file imports it); consumers land in the same change |

## Effort Estimate

**Overall:** Small (1–2 days)

| Phase | Estimate |
|---|---|
| Phase 1 | 0.5 day |
| Phase 2 | 0.5–1 day |

## Next Steps

1. Review and approve this proposal.
2. Follow `task-doc.md` to implement phase by phase.
3. After implementation, finalize with the `finalize-issue` skill (verify AC against the
   PR, archive `.agents/issue-planner/12/`, merge, and close the issue).
