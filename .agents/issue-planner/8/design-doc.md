# Design Doc — Phase 8: View page — read-only chart with RSVP state (#8)

## Overview

The parent-facing payoff page: one mobile screen at `/t/[teamId]/view` showing the labeled
baseball diamond and the ordered batting lineup, read in the context of the team's next
game, with each kid's RSVP state rendered as decoration — never as a filter. It ships
before the chart editors (#10, #11) so the validation weekend (#9) has something real to
show; for that weekend the chart columns are set by hand via `pnpm db:studio`.

## Acceptance Criteria

From the issue's task list, unchanged — the issue is fully specified and #7 (its only
blocker) is closed, so no clarifying questions were needed:

- [ ] Labeled baseball diamond graphic with all nine positions
- [ ] Ordered batting lineup list
- [ ] Stacked vertically on phones; side-by-side on wider screens
- [ ] Three distinct visual states per player: attending, declined, no-response
- [ ] Declined players greyed rather than removed — the real chart, with absences visible
- [ ] No-response visually distinguishable from declined, and never rendered as "out"
- [ ] Chart read in the context of `nextGame(teamId)` from `src/lib/schedule.ts`
- [ ] Empty states handled: no upcoming game, and no chart set yet
- [ ] Motion reveal on open using `LazyMotion` + `m`
- [ ] `pnpm check` green
- [ ] `pnpm build` green

Constraints restated as criteria (from the issue's Context section):

- [ ] Position labels come from `POSITION_LABELS` (`src/lib/positions.ts:6-16`), never
      hand-written
- [ ] No player is reordered, renumbered, or removed based on RSVP state
- [ ] No `layout` prop on any node that #10/#11 will later make draggable
- [ ] RSVP state consumed from `src/lib/rsvp.ts`'s `buildRsvpStateMap`, not re-derived

## Architecture & Data Model

### Data Layer

No schema changes. The chart already lives on `RosterEntry.battingOrder` /
`RosterEntry.position` (`prisma/schema.prisma:156-178`), with per-team uniques
guaranteeing no duplicate slot or position.

One new read is needed: `src/lib/roster.ts`'s `ROSTER_ENTRY_SELECT` deliberately omits the
chart columns (they belong to #10/#11 for writes), so this issue adds a read-only
`getChart(teamId)` returning, per roster entry: `playerId`, `playerName`, `jerseyNumber`,
`battingOrder`, `position`.

Existing reads consumed as-is:

| Function | Module | Role here |
|---|---|---|
| `nextGame(teamId)` | `src/lib/schedule.ts:163` | The one game the page contextualizes; `null` = "no upcoming game" empty state. Errors deliberately propagate (see its docstring — this page is a named beneficiary). |
| `listEventRsvps(teamId, eventId)` | `src/lib/rsvps.ts:21` | RSVP rows for that game |
| `buildRsvpStateMap(playerIds, rows)` | `src/lib/rsvp.ts:36` | The tri-state contract — `Map<playerId, RsvpState>` |

### API / Service Layer

| Endpoint / Function | Type | Auth | Purpose |
|---|---|---|---|
| `GET /t/[teamId]/view` (page) | Server Component | Any team member (`requireTeamAccess(teamId, { intent: "read" })`) | The read-only view page |
| `getChart(teamId)` | Internal (`src/lib/roster.ts`) | Caller-gated, teamId-scoped `where` | Chart columns per roster entry |
| `buildChartView(entries, rsvpStates)` | Pure (`src/lib/chart-view.ts`) | n/a | Derives the render model: sorted lineup, position→player map, `hasChart` |

No server actions. No route handlers. The page is entirely read-only.

### UI Component Tree

All co-located under `src/app/t/[teamId]/view/` since nothing is reused elsewhere yet:

```
page.tsx (server)                 access check → nextGame + getChart + listEventRsvps
│                                 → buildRsvpStateMap → buildChartView
├── empty state: no upcoming game (card + link to /t/[teamId]/schedule)
├── empty state: no chart set yet (card explaining the chart isn't set)
└── Reveal.tsx ("use client")     m.div fade/rise on open; features come from the
    │                             LazyMotion already wrapping the app in src/app/layout.tsx
    ├── next-game header          Card: opponent, formatEventDateTime, location
    ├── Diamond.tsx (server)      inline SVG, nine positions via ALL_POSITIONS +
    │                             POSITION_LABELS; player name (+ jersey) under each label
    ├── batting lineup list       <ol> ordered by battingOrder
    └── legend                    the three RSVP states, spelled out
```

Responsive layout: `flex flex-col lg:flex-row` (or grid equivalent) — stacked on phones,
side-by-side from `lg:` up.

## Key Decisions

### Decision 1: Where the chart read lives

**Options considered:**
- Option A: Add `battingOrder`/`position` to the existing `ROSTER_ENTRY_SELECT`
- Option B: A dedicated `getChart(teamId)` in `src/lib/roster.ts`

**Decision:** Option B.
**Rationale:** A widened shared select leaks chart columns into every roster consumer
(roster page, entry page, event page) that has no business reading them, and widens the
type #10/#11 will later mutate through. A dedicated read keeps the view page's needs
self-describing. Error handling follows the `nextGame` precedent, not `getRoster`'s
swallow-to-empty: "no chart set yet" is a real product state this page renders, so a
swallowed outage would falsely assert it on the morning of a game. `getChart` does NOT
catch — it propagates to the error boundary.

### Decision 2: Pure view-model builder vs. deriving in the page

**Options considered:**
- Option A: Sort/group inline in `page.tsx`
- Option B: Pure `buildChartView` in `src/lib/chart-view.ts` with co-located tests

**Decision:** Option B.
**Rationale:** AGENTS.md's core convention — "the decision belongs in a pure function" —
and the exact pattern `readiness.ts` and `rsvp.ts` already follow. The interesting logic
(lineup ordering, position occupancy, the `hasChart` definition, tolerating a partial
chart) tests without a database or React. `readiness.ts`'s `ChartEntry` is deliberately
NOT imported: readiness filters by attendance, which is precisely what this page must
never do — a shared type would invite sharing the behavior. `chart-view.ts` defines its
own input shape and `roster.ts` returns it, mirroring how `rsvps.ts` returns `rsvp.ts`'s
`RsvpRow`.

**`hasChart` definition:** at least one entry has a non-null `battingOrder` OR a non-null
`position`. A partial chart (three positions set, no order yet) renders normally with open
slots — only a fully empty chart shows the empty state, because during the hand-entry
weekend the coach will save incrementally.

### Decision 3: Diamond rendering technique

**Options considered:**
- Option A: Static image asset with absolutely-positioned labels
- Option B: CSS grid approximating a diamond
- Option C: Inline SVG drawn in a server component

**Decision:** Option C.
**Rationale:** SVG scales crisply on any phone, weighs nothing extra (no asset request —
the issue's "one bar of signal" context), and each position marker is a `<text>`/`<g>`
node placed at fixed coordinates, so labels come straight from `POSITION_LABELS`. It
renders on the server — no client JS. Player names render beneath each position
abbreviation; an unassigned position shows the abbreviation with an "open" marker rather
than disappearing, so the coach can see gaps in a partial chart.

### Decision 4: Motion reveal shape

**Options considered:**
- Option A: Wrap the whole content in one `m.div` fade/rise
- Option B: Staggered per-section reveals

**Decision:** Option A (one wrapper, subtle fade + small y-translate, ~0.3s).
**Rationale:** The page must stay light and legible at a field. One client component
(`Reveal.tsx`) keeps the client bundle minimal; `LazyMotion` with `domAnimation` already
wraps the app in `src/app/layout.tsx:40`, so `Reveal` uses `m` only — no second
`LazyMotion`, no top-level `motion` import. **No `layout` prop anywhere** — the lineup
list and diamond markers are exactly the nodes #10/#11 will make draggable, and Motion's
`layout` animates `transform`, which dnd-kit owns during a drag (AGENTS.md gotcha).

### Decision 5: The three visual states

**Decision:** Attending is the default full-strength rendering. Declined is greyed
(reduced opacity on the name) plus an explicit "Not going" tag in `text-destructive` —
present in their slot, visibly missing. No-response keeps the name at full strength with a
muted "No response" tag — distinguishable from declined at a glance and never conflated
with "out". A short legend explains all three.
**Rationale:** Reuses the exact label/tone vocabulary the event page's `RSVP_BADGE`
established (`schedule/[eventId]/page.tsx:39-43`) — Going / Not going / No response in
primary / destructive / muted — so parents see one consistent language. Greying only the
declined player satisfies "greyed rather than removed"; keeping no-response at full
strength satisfies "never rendered as out". Color is never the sole channel (text tags
carry the state), which also covers color-blind parents in sunlight.

### Decision 6: Navigation entry point

**Decision:** Add a "Lineup" button to the team home page's button row
(`src/app/t/[teamId]/page.tsx:50-68`), visible to every role.
**Rationale:** Parents cannot type URLs they don't know; the page is the parent-facing
payoff, so it must be reachable. One `<Button asChild>` matching the existing
Schedule/Roster/Directory row is the minimal change. (Label "Lineup" over "View" — it
says what a parent will find.)

## Security & Permissions

- Every team member (OWNER, COACH, PARENT) can read the page; there is nothing to write.
- `page.tsx` calls `requireTeamAccess(teamId, { intent: "read" })` itself, per the
  "check for yourself, don't trust the layout" rule (`layout.tsx:11-17`), turning
  `TeamAccessError` into `notFound()` exactly as every sibling page does.
- All reads are `teamId`-scoped in the `where` clause inside `src/lib/` — no new query
  bypasses the one-place-to-audit rule.
- Archived teams: reads are allowed on archived teams by design (`team-access.ts` rejects
  only writes), so the view page works on an archived season. No special handling needed.

## Error Handling

| Failure | Behavior |
|---|---|
| No session cookie | `proxy.ts` redirects to sign-in (existing matcher covers `/t/:path*`) |
| Not a member / bad teamId | `notFound()` via `TeamAccessError` |
| No upcoming game (`nextGame` → `null`) | Friendly empty state + link to the schedule |
| No chart set yet (`hasChart` false) | Friendly empty state; page still shows the next-game header |
| Database outage | `nextGame` and `getChart` propagate — error boundary, never a false empty state (their documented contracts) |
| Player in order but no position, or vice versa | Renders in the section they're assigned to; the other shows an open slot — a partial chart is normal during hand entry |

## Testing Strategy

| Layer | Test Type | File(s) | Notes |
|---|---|---|---|
| View model | Unit (pure) | `src/lib/chart-view.test.ts` | Ordering by `battingOrder`; position map; `hasChart` for empty/partial/full charts; **RSVP state never reorders or drops an entry** — the load-bearing assertion |
| Data read | Covered via page tests | — | `getChart` is a thin select; mocked in page tests like every other `src/lib` wrapper |
| Page | Unit (static render) | `src/app/t/[teamId]/view/page.test.tsx` | Copy the `schedule/page.test.tsx` pattern: `vi.mock` the lib modules, `renderToStaticMarkup`. Cases: parent can read; `notFound` on `TeamAccessError`; no-game empty state; no-chart empty state; declined player still present in slot with "Not going"; no-response tagged distinctly; labels come from `POSITION_LABELS`. Mock `motion/react` (`m.div` → `"div"`) if static render needs it — precedent for mocking framework modules exists in the suite |

## Config Changes

- [ ] Schema / index changes — none
- [ ] Access rule changes — none (existing `requireTeamAccess` read intent)
- [ ] Environment variables — none
- [ ] Dependency changes — none (`motion` already installed and lazy-loaded)

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| RSVP state accidentally filters/reorders the chart | High — violates the core product rule | `buildChartView` takes RSVP state only to attach a label per entry; a dedicated test asserts identical order/membership across all-states-vary inputs |
| Game in progress (grace window) | Low | `nextGame` already owns this via `GAME_GRACE_MS` — page inherits correct behavior for free |
| Hand-entered chart (db:studio) is partial or weird | Med — this is the actual validation-weekend input | `hasChart` tolerates partial charts; open slots render visibly; uniques in the schema prevent duplicates at the source |
| `layout` prop sneaks onto future-draggable nodes | Med — #10/#11 drag jank, hard to bisect later | Decision 4; comment on `Reveal` stating the rule |
| Heavy page on a one-bar connection | Med — the stated usage context | Server-rendered SVG, one small client component, no images, no extra deps |
| Practices leak in as "next game" | Low | `nextGame` filters `type: "GAME"` in SQL and in `selectNextGame` — tested upstream |
