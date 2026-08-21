# Design Doc — Team home: parent dashboard with next event, one-tap RSVP, and kid chart summary (#48)

## Overview

After accepting an invite, a parent lands on `/t/[teamId]` and sees only the season label,
the allPlay setting, and coach contacts. The three questions the app exists to answer —
when, where, is my kid playing — live two or more taps deeper, and RSVPing takes 4 taps and
5 page loads. This issue turns team home into a glanceable dashboard: next event card,
one-tap RSVP per guarded kid, and a one-line chart summary per guarded kid.

## Acceptance Criteria

- [ ] A parent opening team home sees the next event (game **or** practice) with time,
      place, and a link to the event page
- [ ] They can RSVP each of their kids in one tap from this page, with the current state
      visible
- [ ] Each guarded kid shows jersey, batting slot, and position (or Bench/OF) in one line
- [ ] Archived teams show the summary but no RSVP buttons (the write-rejection copy
      problem must not reappear here)
- [ ] Coaches' view is unchanged apart from the next-event card (which we do show them —
      see Decision 4)

## Architecture & Data Model

**No schema changes.** Everything is composition over existing tables and mostly existing
queries, per the issue.

### Data Layer

| Function | Module | Status | Purpose |
|---|---|---|---|
| `selectNextEvent(events, now)` | `src/lib/calendar.ts` | **new, pure** | Soonest event of *any* type that hasn't finished (grace window). `selectNextGame` stays untouched — its games-only contract is load-bearing for readiness. |
| `nextEvent(teamId, now?)` | `src/lib/schedule.ts` | **new** | Thin data twin of `nextGame`: SQL prefilter (no `type` filter, `startsAt > now − GAME_GRACE_MS`), then `selectNextEvent` decides. Errors NOT swallowed — `null` means "no upcoming events", a real product state, same argument as `nextGame`. |
| `chartRole(entry, allPlay, opts?)` | `src/lib/chart-role.ts` | **lifted** | Moved out of `readiness/page.tsx` with `ordinal()`. New optional `benchLabel` so team home can print "Bench" for a selective-team null position without changing readiness output (which omits the label today). |
| `guardedRosteredPlayerIds` | `src/lib/rsvps.ts` | existing | Which kids the viewer may see/RSVP on this team. |
| `getChart(teamId)` | `src/lib/roster.ts` | existing | Returns `ChartViewEntry[]` incl. jersey/battingOrder/position — team home filters it to guarded playerIds. No new query needed. |
| `listEventRsvps` + `buildRsvpStateMap` | `src/lib/rsvps.ts` / `rsvp.ts` | existing | Current RSVP state for the next event. |
| `formatEventDateTime`, `mapsUrl` | `src/lib/calendar.ts`, `src/lib/maps.ts` | existing | Card rendering; never format `startsAt` directly (APP_TIMEZONE rule). |

### API / Service Layer

| Endpoint / Function | Type | Auth | Purpose |
|---|---|---|---|
| `rsvpAction` | Server Action (existing, `schedule/actions.ts`) | Any member + `requireGuardedEvent` | Gains an optional `from` form field, **enum-validated to the literal `"home"`** (Zod). When present, success and error redirects target `/t/${teamId}?…` instead of the event page, and `revalidatePath("/t/[teamId]", "page")` is added. All authorization checks unchanged. |
| `TeamHomePage` | Page loader | `requireTeamAccess({ intent: "read" })` | Composes the dashboard; reads `searchParams` for `saved` / `error` feedback. |

### UI Component Tree (team home)

```
TeamHomePage (src/app/t/[teamId]/page.tsx)
├─ team facts (season, allPlay, archived banner)        — unchanged
├─ feedback line (?saved / ?error, event-page copy)      — new
├─ Next event Card                                       — new, all roles
│   ├─ heading: "Game vs X" / "Game" / "Practice"        (event page's heading logic)
│   ├─ formatEventDateTime, location via mapsUrl link, notes
│   └─ Link → /t/[teamId]/schedule/[eventId]  ("Details")
│   └─ quiet empty state when nextEvent is null ("Nothing on the schedule yet")
├─ "Your kids" section                                   — new, only when guarding ≥1 rostered kid
│   └─ per kid: Card / row
│       ├─ summary line: Name · #12 · Bats 3rd · SS      (chartRole + benchLabel "Bench" / OF)
│       ├─ RSVP state badge (RSVP_STYLE)                 — only when a next event exists
│       └─ Going / Not going forms → rsvpAction          — hidden when team.archivedAt ≠ null
│                                                          or no next event
├─ Coaches contact card (parents only)                   — unchanged
└─ InstallPrompt                                         — unchanged, stays last
```

## Key Decisions

### Decision 1: New `nextEvent` instead of loosening `nextGame`

**Options considered:**
- A: Add a flag to `nextGame` / `selectNextGame` to include practices.
- B: New `selectNextEvent` (pure) + `nextEvent` (data), leaving the game-only pair alone.

**Decision:** B.
**Rationale:** `selectNextGame`'s docstring says its whole point is being the single home
of the games-only rule for readiness (#12) and the view page (#8). A flag invites callers
to pick the wrong mode. `selectNextGame` can delegate to `selectNextEvent` internally
(filter `type === "GAME"` first) so "hasn't finished yet" is defined exactly once — the
grace-window constant `GAME_GRACE_MS` is reused as-is.

### Decision 2: RSVP redirect-back via an enum `from` field on the existing action

**Options considered:**
- A: New separate `rsvpFromHomeAction` wrapper.
- B: Optional `from` hidden field on `rsvpAction`, Zod-validated to `z.enum(["home"])`,
  falling back to current behavior when absent/invalid.
- C: Free-form `returnTo` URL field.

**Decision:** B.
**Rationale:** One action keeps `requireGuardedEvent` (the security core) in one place —
a wrapper duplicates the catch/redirect scaffolding for no gain. C is an open-redirect
footgun and validating it costs more than an enum. On failure with `from=home`, error
redirects also target `/t/${teamId}?error=…` so the parent isn't teleported to a page they
never visited; team home gets the same `ERROR_MESSAGES` copy the event page uses
(`not-your-player`, `access`, `invalid-rsvp`).

### Decision 3: Lift `chartRole` to `src/lib/chart-role.ts` with an opt-in bench label

**Options considered:**
- A: Copy the logic into the home page.
- B: Lift `chartRole` + `ordinal` into a pure `src/lib/chart-role.ts`; readiness imports it
  with today's exact behavior; team home passes `{ benchLabel: "Bench" }`.
- C: Lift and make "Bench" unconditional, changing readiness output too.

**Decision:** B.
**Rationale:** The issue explicitly suggests lifting if feasible; it is — the function is
already pure over `ChartViewEntry`. C would silently change readiness rendering (today a
selective-team benched player shows only "Bats 3rd"); that page's copy is deliberate and
out of scope. A violates the repo's "one place to fix a rule" pattern (`diamond-names` was
the cautionary tale). The allPlay `OF` behavior is already correct in the lifted code via
`fieldedPositions` + `OUTFIELD_ZONE_LABEL`. A new module (not `chart-view.ts`) because
this is labeling, not the view-page render model, and `readiness/page.tsx` importing from
`chart-view.ts` would blur that module's "never filter by RSVP" contract boundary.

### Decision 4: The next-event card shows for every role; kid sections key on guardianship, not role

The AC leaves the coach card optional ("any next-event card we choose to show them too") —
we show it: it is informational and coaches drive to the same field. The RSVP and summary
sections render for anyone who guards a rostered kid (`guardedRosteredPlayerIds`), which is
role-independent — a coach who is also a parent RSVPs their own kid here, exactly as the
event page already allows. Members guarding no kids get no section at all (empty-quietly,
per the issue).

### Decision 5: The "no navigation links of its own" test gets consciously revised

`page.test.tsx` currently pins `expect(html).not.toContain('href="/t/team-1/')` to keep
the old nav-button wall from creeping back. The next-event card's Details link legitimately
breaks that. The assertion narrows to "no nav-wall links" (e.g. asserts the absence of the
old destinations — `/roster`, `/chart`, `/directory`, `/settings` — rather than all team
links), keeping the original intent on record in its comment.

## Security & Permissions

- Page: `requireTeamAccess(teamId, { intent: "read" })` — its own check, per the
  layout-independence rule already commented in the file.
- The guarded-kid filter is `guardedRosteredPlayerIds` — the same intersection of global
  guardianship and this team's roster that the event page and `rsvpAction` use. No other
  family's data appears: summaries and RSVP controls render only for guarded kids.
- `rsvpAction`'s authorization (`requireGuardedEvent`: team write access → event on this
  team → caller guards the player) is untouched. The `from` field affects redirects only
  and is enum-validated.
- Archived teams: buttons hidden at render (`team.archivedAt !== null`); the action's
  existing archived write-rejection stays the backstop for the load/POST race, and its
  error now lands on team home with honest copy instead of stranding the parent.

## Error Handling

- `nextEvent` does **not** swallow database errors — `null` must mean "no upcoming
  events", never "database down" (same contract as `nextGame`; a swallowed outage renders
  a calm, wrong page).
- `getChart` / `listEventRsvps` follow their existing contracts (readiness page's comment
  documents the reasoning); the page does not add try/catch around them.
- RSVP failures redirect to `/t/${teamId}?error=<code>`; the page maps codes with the
  event page's copy and renders a `role="alert"` line. Success renders a quiet
  `role="status"` "Saved." line, matching the event page.

## Testing Strategy

All pure logic tests need no database; page tests mock `src/lib/` wrappers, matching the
readiness suite. **Static imports of the module under test** (per AGENTS.md) — while
touching `page.test.tsx`, its `await import("./page")` helper is converted to the static
pattern the readiness suite already uses.

| Layer | Test Type | File(s) | Notes |
|---|---|---|---|
| `selectNextEvent` | Unit (pure) | `src/lib/calendar.test.ts` | Practice beats later game; grace window; empty list → null; `selectNextGame` still ignores practices (regression). |
| `nextEvent` | Unit (mock db) | `src/lib/schedule.test.ts` | Follows the existing `nextGame` test pattern: where-clause shape, no swallow, delegates to pure select. |
| `chartRole` | Unit (pure) | `src/lib/chart-role.test.ts` | Cases: batting+position, allPlay null→OF, allPlay stale CF→OF, selective null → "" (default) / "Bench" (opt), teens ordinals (11th–13th). |
| Readiness page | Regression | `src/app/t/[teamId]/readiness/page.test.tsx` | Unchanged output after the lift — existing suite is the guard. |
| `rsvpAction` | Unit | `src/app/t/[teamId]/schedule/actions.test.ts` | `from=home` → success and error redirects target team home + revalidate `/t/[teamId]`; absent/garbage `from` → current behavior. |
| Team home | Component | `src/app/t/[teamId]/page.test.tsx` | Next-event card (game + practice headings, empty state), kid summary lines (Bench/OF), RSVP forms posting `from=home` with state visible, archived hides forms but keeps summaries, guarding-nothing renders no section, coach still skips contact card, revised nav assertion. |

## Config Changes

- [ ] Schema / index changes — **none required**
- [ ] Access rule changes — none (existing `requireTeamAccess` / `requireGuardedEvent`)
- [ ] Environment variables — none
- [ ] Dependency changes — none

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| No upcoming events | Low | Quiet empty state in the card slot; RSVP controls simply absent (nothing to RSVP to); summaries still render. |
| Guarded kid rostered, team archived | Med | Summary + state badge render, forms don't (`archivedAt` gate); action backstop covers the race with honest copy on team home. |
| Team archived between page load and POST | Low | `rsvpAction` rejects (`intent: "write"`); `from=home` routes `?error=access` back to team home. |
| Kid on chart with stale position on allPlay team | Low | `chartRole` routes through `fieldedPositions` → prints OF, agreeing with both diamonds. |
| Coach who also guards a kid | Low | Gets card + kid sections by guardianship — consistent with event page. AC "coaches' view unchanged" read as role-driven UI, which is. |
| Two guarded kids, one RSVP'd | Low | Per-kid state from `buildRsvpStateMap`; each row independent. |
| Event deleted between render and RSVP POST | Low | `requireGuardedEvent` redirects to schedule (existing behavior, unchanged). |
| DB outage renders "nothing scheduled" | Med | `nextEvent` propagates errors — same no-swallow contract as `nextGame`. |
