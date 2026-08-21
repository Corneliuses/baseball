# Proposal — Lineup view: highlight the signed-in parent's kids with an animation (#49)

## Executive Summary

`/t/[teamId]/view` is the page a parent opens at a field, on a phone, to answer one
question: *where is my kid playing?* Today it does not help them answer it. The page calls
`requireTeamAccess` and throws away the `userId` it returns, so it has no idea who is
reading — leaving a parent to scan a 12–15 name diamond by eye, where markers carry first
names only and two kids named Ava are indistinguishable. This change makes the page do the
finding: the viewer's own children get a Banana Yellow halo on the diamond, a marked row in
the batting order, a plain-text `Your player` label, and a one-time reveal.

The work is **entirely presentational**. There is no schema change, no migration, no new
query and no new dependency — `guardedRosteredPlayerIds` already exists in `src/lib/rsvps.ts`
and already does the exact cross-team-safe intersection this needs, and full names are
already loaded. Two decisions go beyond the issue as written. First, the issue's proposed
banana halo would have been the screen's *second* banana, because `FieldArt` already spends
`/view`'s one banana on the outfield fence; rather than except the design rule, the fence
becomes chalk on this page and the banana moves to the child — the loudest thing on the
screen becomes the thing that matters most. Second, a benched player on a non-allPlay team
is currently drawn nowhere at all, so highlighting them would have satisfied AC1's letter
and failed its intent; a bench list is added, which is what makes the feature honest for
every parent rather than only for parents of starters.

## Scope

### In Scope
- Resolving the viewer's guarded, rostered players on `/view` and threading the id set into
  the diamond, the batting order and the new bench list.
- A Banana Yellow halo plus a one-time `animate-step-up` reveal on guarded diamond markers.
- Static emphasis (ring, weight, a `Your player` badge) on guarded batting and bench rows.
- Last-initial disambiguation on the diamond whenever two rostered players share a first
  name — computed for every player, not only for guarded ones.
- A `(your player)` suffix in the `sr-only` diamond mirror.
- Moving `/view`'s banana from the fence to the child, via a `fence` prop on `FieldArt`.
- A bench card for non-allPlay teams' unassigned players.
- Design-plan §6.3/§7/§8 updates, required to keep `design-plan-drift.test.ts` green.

### Out of Scope
- **`PositionsEditor`'s own banana budget.** It paints the banana fence *and* a banana drop
  glow on `isOver`. Defensible as-is (the glow is transient, only mid-drag) and deliberately
  not relitigated here — but the new `fence` prop makes it easy to revisit later.
- **Escalating past a last initial** when two players share a first name *and* a last
  initial. Both render `First L.`; a full surname overruns a marker sitting 64px from its
  neighbour. Full names remain in every list and in the `sr-only` mirror.
- **Any per-game behaviour.** The highlight is a property of the viewer, not of the roster
  spot, computed per request and stored nowhere — Decision 16 and AGENTS.md rule 2 stand.
- **Highlighting on other pages** (`/schedule/[eventId]` already distinguishes guarded
  players by showing RSVP controls only for them).

## Acceptance Criteria

1. A signed-in guardian's kids are visually distinct on both the diamond and the batting
   list without reading every name.
2. The highlight animates once on load, is disabled under `prefers-reduced-motion`, and the
   page stays legible pre-hydration.
3. Duplicate first names get disambiguating last initials on the diamond.
4. The `sr-only` diamond mirror announces the viewer's players.
5. No change for viewers guarding no players on this team.
6. *(Added by clarification)* A non-allPlay team's unassigned players are rendered as a
   labelled bench list, with the viewer's guarded kids marked the same way — otherwise a
   benched kid's parent gets a page that silently says nothing about their child.

## Implementation Phases

| Phase | Description | Areas affected |
|---|---|---|
| 1 | **Domain & vocabulary** — `diamondName` disambiguation in `buildChartView`; the shared `guarded-style` module; `haloRadius` geometry constant. All pure and DB-free, all unit-tested before any pixel moves. | `src/lib/`, `src/components/` |
| 2 | **The field** — `FieldArt`'s `fence` prop; the `animate-step-up` CSS utility; the halo, the inner-`<g>` animation and the `sr-only` suffix in `Diamond`; halo geometry assertions. | `src/components/`, `src/app/globals.css`, `src/app/t/[teamId]/view/` |
| 3 | **The page & the record** — `userId` capture and the guarded-ids load; guarded batting rows; the bench card; nine new page tests; `design-plan.md` §6.3/§7/§8 and the drift-test pin; the `AGENTS.md` gotcha. | `src/app/t/[teamId]/view/`, `docs/design/`, `AGENTS.md` |

Phased this way because Phase 1 is provable without rendering anything, and because Phase 2
is the phase carrying the two real hazards (the SVG transform override and the halo's
geometry budget) — worth isolating in its own diff. The design-plan edit sits *with* the code
in Phase 3, not after it: `design-plan-drift.test.ts` turns `pnpm check` red the moment the
fence changes, so treating the document as trailing cleanup would ship a red phase.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **A CSS `transform` on an SVG element overrides its `transform` attribute** — animating the marker's own `<g>` teleports it to the origin. | High | Animate an inner `<g>`; the outer keeps `translate(x y)`. Called out explicitly in the task steps. |
| **The halo overruns the warning track or a neighbour.** CENTER_FIELD reaches 345px from the home circle and the track's inner edge is at 374; SHORTSTOP and SECOND_BASE are 64px apart. | Med | `haloRadius: 25` (outer edge ≈ 371.5), pinned by new assertions in `Diamond.test.tsx` in the style of the existing viewBox checks. It is also why the animation is translate-only, never `scale`. |
| **Motion would turn `Diamond` into a client component**, shipping the whole diamond as JS to a phone on one bar of signal and risking `Reveal.tsx`'s documented blank-until-hydrated failure. | Med | CSS `@utility` instead, following the `animate-rise` precedent already on this page. `Diamond` stays server-rendered. |
| **Colour-only signalling** fails design-plan §10 and colour-blind parents. | Med | The `Your player` badge and the `(your player)` `sr-only` suffix carry the same information as text, always. |
| **Existing `/view` tests break** on the new `@/lib/rsvps` mock surface. | Low | Default `guardedRosteredPlayerIds` to `new Set()` in `beforeEach`, so every existing test keeps describing an unguarded viewer — the shape `schedule/[eventId]/page.test.tsx` already uses. |
| **The design plan silently rots** — it has drifted four times in its first week. | Low | The drift test forces the §6.3 edit; `animate-step-up` gets added to its pinned `utilities` list. |
| **Three of five ACs are visual** and not fully provable by assertion. | Low | An explicit manual gate: phone-width sighted check, OS reduce-motion toggle, and a JS-disabled raw-HTML check. |

## Effort Estimate

**Overall: Medium — 2–3 days**, including tests, the design-plan updates and one review cycle.
No migration and no new dependency keep this at the low end; the halo geometry, the SVG
transform hazard and thirteen touched files keep it off "Small."

| Phase | Estimate |
|---|---|
| Phase 1 — Domain & vocabulary | ~0.5 day |
| Phase 2 — The field | ~1 day |
| Phase 3 — The page & the record | ~1 day |
| Manual visual/reduced-motion/no-JS pass | ~0.5 day |

## Next Steps

1. Review and approve this proposal.
2. Follow `task-doc.md` phase by phase, running `pnpm check` at each phase boundary.
3. After implementation, finalize with the `finalize-issue` skill — verify each AC against
   the PR, archive `.agents/issue-planner/49/`, merge, and close the issue.
