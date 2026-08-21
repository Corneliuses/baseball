# Design Doc — Lineup view: highlight the signed-in parent's kids with an animation (#49)

## Overview

`/t/[teamId]/view` is the parent-facing payoff page, but it never resolves *who* is
reading it — `view/page.tsx` calls `requireTeamAccess` and throws the result away. A
parent therefore scans a 12–15 name diamond and batting list by eye to answer the one
question the page exists to answer: *where is my kid playing?* This makes the page do the
finding: the viewer's guarded, rostered players are marked on the diamond, in the batting
order, and (new) on a bench list, with a one-time reveal and a plain-text label.

Origin: finding P3 in the Aug 2026 UX audit (the Dugout Report).

## Acceptance Criteria

Five from the issue, plus one added by clarification (AC6).

- [ ] **AC1** — A signed-in guardian's kids are visually distinct on both the diamond and
      the batting list without reading every name.
- [ ] **AC2** — The highlight animates once on load, is disabled under
      `prefers-reduced-motion`, and the page stays legible pre-hydration.
- [ ] **AC3** — Duplicate first names get disambiguating last initials on the diamond.
- [ ] **AC4** — The `sr-only` diamond mirror announces the viewer's players.
- [ ] **AC5** — No change for viewers guarding no players on this team.
- [ ] **AC6** *(clarified, Q2)* — A non-allPlay team's unassigned players are rendered as a
      labelled bench list under the diamond, with the viewer's guarded kids marked the same
      way. Today they are drawn nowhere at all, so a benched kid's parent gets a page that
      silently says nothing about their child.

## Architecture & Data Model

**No schema change. No migration. No new query.** Every input already exists:

- `guardedRosteredPlayerIds(teamId, userId)` in `src/lib/rsvps.ts` already returns exactly
  the set this needs — `GuardianPlayer` intersected with *this* team's `RosterEntry`. The
  event page (`schedule/[eventId]/page.tsx:76`) already calls it in a `Promise.all` next to
  its other loads; `/view` copies that shape.
- `userId` already comes back from `requireTeamAccess` — `view/page.tsx` just discards it.
- Last names are already loaded: `ChartViewEntry.playerName` is the player's full name
  (`getChart`, `roster.ts:167`).

Structurally this is a **read-only presentation change**. Nothing here writes, and nothing
here touches the standing-chart rule (AGENTS.md rule 2): the highlight is a property of the
*viewer*, not of the roster spot, so it is computed per request and stored nowhere.

### Data Layer

Unchanged. `getChart` keeps its current `select`.

### Domain Layer (pure, DB-free — `src/lib/`)

`ChartViewPlayer` gains one derived field:

| Field | Type | Meaning |
|---|---|---|
| `diamondName` | `string` | The name as it should appear *on the field*: the first name, or `First L.` when another rostered player in the same chart shares that first name. |

Computed inside `buildChartView`, which is the only function that already sees every
rostered player at once — which is what disambiguation requires. This deletes the
context-free `shortName` helper currently private to `Diamond.tsx:35`.

### Shared vocabulary (`src/components/guarded-style.ts`, new)

A small constants module in the shape of the existing `rsvp-style.ts`: the emphasis appears
in **three** places (diamond marker, batting row, bench row) and drifted-apart styling on
one page is a mistake this repo has already made once (see the comment at the top of
`rsvp-style.ts`).

```ts
export const YOUR_PLAYER_TEXT = "Your player";
export const GUARDED_STYLE = {
  haloClassName,       // the diamond marker's banana ring
  markerNameClassName, // the name under a guarded marker
  rowClassName,        // the batting/bench row's border + background
  badgeClassName,      // the "Your player" chip
};
```

### UI Component Tree

```
view/page.tsx  (server)
├── resolves { userId } from requireTeamAccess  ← currently discarded
├── guardedRosteredPlayerIds(teamId, userId)    ← new, into the existing Promise.all
└── Reveal (client, unchanged)
    ├── Card "Positions"
    │   └── Diamond  guardedPlayerIds={Set<string>}          ← new prop
    │       ├── FieldArt fence="chalk"                       ← new prop (see Decision 1)
    │       ├── Marker  isGuarded  → halo + animate-step-up
    │       └── <ul class="sr-only">  … "(your player)"      ← AC4
    ├── Card "Batting order"   → guarded row: ring + badge   ← AC1
    └── Card "Bench" (only when !allPlay && unassigned)      ← AC6, new
```

## Key Decisions

### Decision 1: The banana moves from the fence to the kid

**The conflict:** the issue asks for a Banana Yellow halo, but `/view` already spends its
one banana — `FieldArt` draws the fence arc with `stroke-banana`
(`FieldArt.tsx:74`), and both `design-plan.md` §6.3 and the `FIELD_ART` comment in
`diamond-geometry.ts:61` call the fence *"that screen's one banana."* A yellow ring would
be banana #2, violating design principle §2.

**Options considered:**
- **A.** Fence stays banana; the halo uses navy + weight + a star glyph.
- **B.** `/view` draws a chalk-white fence and spends its banana on the guarded marker.
- **C.** Accept two bananas on `/view` as a documented exception.

**Decision:** **B** *(user-confirmed)*.

**Rationale:** the one-banana rule exists so the loudest thing on a screen is the thing that
matters most. On `/view` that is unambiguously the parent's own kid, not the outfield wall —
the fence is decoration that `FieldArt`'s own docblock calls "pure background." Moving the
banana obeys the principle rather than excepting it.

**Mechanism:** `FieldArt` takes `fence?: "banana" | "chalk"`, defaulting to `"banana"`.
`/view`'s `Diamond` passes `fence="chalk"`; `PositionsEditor` is untouched and renders
byte-identically.

**Note on the editor's own budget (out of scope):** `PositionsEditor` draws the banana fence
*and* a `border-banana bg-banana/25` drop glow on `isOver`
(`PositionsEditor.tsx:305`). That is defensible as-is — the fence is the resting banana and
the glow exists only while a drag is in flight — and this issue deliberately does not
relitigate it. Flagging it because the `fence` prop makes the question easy to ask later.

### Decision 2: Disambiguation lives in `buildChartView`, not in `Diamond`

**Options considered:**
- **A.** Keep `shortName` in `Diamond.tsx` and pass it a precomputed collision set.
- **B.** Compute `diamondName` for every player inside `buildChartView`.

**Decision:** **B**.

**Rationale:** AGENTS.md — *"Keep domain logic pure and DB-free … the decision belongs in a
pure function."* "Which name is unambiguous on this roster" is a decision over the whole
player set, and `buildChartView` is already the function that holds the whole player set and
already has a co-located pure test (`chart-view.test.ts`). Option A would make `Diamond`
compute a roster-wide fact from props, and would need the same set threaded to the bench
list too.

**Tie-break rule:** if two players share a first name *and* a last initial, both render
`First L.` and stay identical on the diamond. Deliberately not escalated to a full surname —
that overruns a marker sitting 64px from its neighbour, which is why only first names are
drawn in the first place. The full names remain in the batting order, the bench list and the
`sr-only` mirror, and for the one case a parent actually cares about, the banana halo is
itself the disambiguator. Recorded as an accepted limitation, not an oversight.

### Decision 3: CSS `@utility`, not Motion — and translate-only

**Options considered:**
- **A.** Wrap the guarded marker in a Motion `m.g`.
- **B.** A new `animate-step-up` CSS `@utility` in `globals.css`.

**Decision:** **B**.

**Rationale:** three reasons, in order of weight.
1. `Diamond` is a **server component** rendering inline SVG. Motion would make it a client
   component and ship the whole diamond as JS to a phone on one bar of signal — the exact
   cost `Diamond`'s own docblock says it avoids ("no client JS, crisp on any phone").
2. `Reveal.tsx` documents at length that Motion serializes `initial` into the SSR markup, so
   any Motion `initial` risks reintroducing the blank-until-hydrated failure the file exists
   to prevent.
3. `animate-rise` already establishes the pattern in this exact page: a CSS `@utility`
   carrying its own `prefers-reduced-motion` block (`globals.css:179`).

**Translate-only, no scale.** `animate-step-up` animates `translateY` alone (the marker
steps up ~4px and settles), matching `animate-rise`'s translate-only rule and the
raw-HTML-legibility argument in `Reveal.tsx`. A `scale` would also push the halo outward
into the warning track at the animation's peak — see Edge Cases.

**SVG gotcha (must be handled in implementation):** a CSS `transform` on an SVG element
*overrides* its `transform` attribute. `Marker` positions itself with
`<g transform="translate(x y)">`, so putting `animate-step-up` on that same `<g>` would
teleport the marker to the origin. The animation goes on an **inner** `<g>`, with the outer
one keeping the positioning transform.

### Decision 4: Static emphasis on the rows, no second animation

**Decision:** the batting and bench rows get ring + weight + a `Your player` badge and keep
the `animate-rise` stagger they already have. No additional row animation. *(User-confirmed,
Q3.)*

**Rationale:** the list has already finished rising by the time a second animation would
fire; a row that moves again afterwards reads as a glitch, not as emphasis. It is also one
fewer thing to gate on `prefers-reduced-motion`. The diamond marker keeps its step-up
because it has no reveal of its own today.

### Decision 5: The bench becomes visible (AC6)

**Decision:** when `!allPlay && chart.unassigned.length > 0`, render a "Bench" card under the
diamond listing those players, guarded kids marked. *(User-confirmed, Q2.)*

**Rationale:** `buildChartView` pools unassigned players into `unassigned`, and `Diamond`
only draws that pool for **allPlay** teams (as the outfield zone). On a non-allPlay team a
benched player is rendered nowhere — not on the diamond, not in the batting order if they
also lack a slot. Highlighting a kid who is never drawn satisfies AC1's letter and fails its
intent. The bench list is shown to **every** viewer (it is chart information, not
viewer-specific); only the highlight within it is viewer-specific.

## Security & Permissions

| Concern | Answer |
|---|---|
| Who can read `/view`? | Any team member. Unchanged — the page's `requireTeamAccess(teamId, { intent: "read" })` call is untouched. |
| Does this widen anyone's data access? | **No.** Every name rendered is already rendered today. The only new *information* is which of those names belong to the viewer's own children — a fact the viewer supplied. |
| Does it leak contact details? | No. AGENTS.md's staff-facing-contacts rule is untouched: no phone, no email, no guardian names. |
| Cross-team leakage? | `guardedRosteredPlayerIds` intersects guardianship with **this team's** roster, which is precisely why it exists (see its docblock). A kid the viewer guards on another team produces no highlight here. |
| New writes? | None. The page remains read-only; archived teams are unaffected. |

## Error Handling

- `guardedRosteredPlayerIds` joins the existing `Promise.all`. It is **not** wrapped in
  try/catch, matching the page's established stance (`nextGame` comment, `view/page.tsx:57`):
  a database outage propagates rather than rendering a page that quietly claims the parent
  guards nobody.
- Empty set is a normal state, not an error: a coach guarding no players renders exactly
  today's page (AC5).
- A guarded player who is not on this team's chart at all simply produces no match — the set
  is intersected server-side, so `Set.has` on a chart player id is total.

## Testing Strategy

| Layer | Test type | File | Notes |
|---|---|---|---|
| Domain | Unit | `src/lib/chart-view.test.ts` | `diamondName`: first name only when unique; `First L.` for both on collision; three-way collisions; single-token names; same-first-and-last-initial tie-break; unchanged `playerName`. |
| Vocabulary | Unit | `src/components/guarded-style.test.ts` | Mirrors `rsvp-style.test.ts`: every class token is non-empty, the badge text is present. |
| Geometry | Unit | `src/app/t/[teamId]/view/Diamond.test.tsx` | **New pinned assertions** for the halo radius — clears the nearest neighbour (SS↔2B, 64px apart), stays inside the viewBox, and keeps CENTER_FIELD's halo off the warning track. |
| Field art | Unit | `src/components/FieldArt.test.tsx` *(new, or folded into the diamond suites)* | `fence="banana"` emits `stroke-banana`; `fence="chalk"` emits `stroke-chalk` and no `stroke-banana`. |
| Page | Unit | `src/app/t/[teamId]/view/page.test.tsx` | Guarded marker gets the halo class; guarded row gets the badge; `sr-only` mirror carries the suffix; a viewer guarding nobody produces markup identical to today (AC5); bench card appears for non-allPlay unassigned players and not for allPlay ones; `guardedRosteredPlayerIds` is called with `(teamId, userId)`. |
| Doc drift | Unit | `src/design-plan-drift.test.ts` | Add `animate-step-up` to the `utilities` array so the plan and `globals.css` cannot drift. |

Existing tests that **will** need updating, not just extending:
- `page.test.tsx:211` (`"shortens to a first name on the diamond…"`) still passes — one
  player, no collision — but its sibling assertions should gain a collision case.
- `page.test.tsx` mocks `@/lib/rsvps`; the new `guardedRosteredPlayerIds` mock must default
  to `new Set()` so every existing test keeps describing an unguarded viewer. This is exactly
  the shape `schedule/[eventId]/page.test.tsx:78` already uses — copy it.

Follow AGENTS.md: **static** imports of the module under test, never `await import()` inside
a test.

## Config Changes

- [ ] Schema / migration — **none required.**
- [ ] Access rules — **none required.**
- [ ] Environment variables — **none required.**
- [ ] Dependencies — **none required** (no Motion addition; `animate-step-up` is CSS).
- [x] `src/app/globals.css` — one new `@utility animate-step-up` + `@keyframes step-up`.
- [x] `docs/design/design-plan.md` — §6.3 (the fence is no longer `/view`'s banana), §7
      (Lineup view gains the highlight and the bench), §8 (Motion gains `animate-step-up`).
      **This is mandatory:** `src/design-plan-drift.test.ts` fails `pnpm check` if the plan
      and the code disagree, and §6.3's "the fence is that screen's one banana" becomes false
      for `/view` the moment Decision 1 lands.
- [x] `src/components/diamond-geometry.ts` — add `haloRadius` to `DIAMOND_GEOMETRY` so the
      geometry test can pin it, alongside `markerRadius`.

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| **Halo collides with the warning track.** CENTER_FIELD sits at `(200,75)`, home circle at `(200,420)` → 345px out. The track band spans 374–410. A halo of radius *r* with stroke *w* reaches `345 + r + w/2`, so anything past ~29 straddles the track the geometry comments explicitly protect against. | Med | Set `haloRadius: 25` (outer edge ≈ 371.5 with a 3px stroke) and **pin it with a test** in `Diamond.test.tsx`, in the same style as the existing viewBox assertions. This is also why Decision 3 forbids `scale`. |
| **Halo overlaps a neighbouring marker.** SHORTSTOP `(168,252)` and SECOND_BASE `(232,252)` are 64px apart — 32px of budget each. | Med | Same pinned test. `haloRadius: 25` leaves 7px of clear air. |
| **CSS transform overrides the SVG `transform` attribute**, teleporting an animated marker to the origin. | High | Animate an **inner** `<g>`; outer keeps `translate(x y)`. Decision 3. Caught by any snapshot of marker coordinates. |
| **The page stops being legible before hydration.** | High | Nothing new is client-side; the halo is a plain SVG `<circle>` in the SSR markup and `animate-step-up` is translate-only, so with no JS and no CSS animation the highlight is still fully present. AC2. |
| **A parent guards a kid who is rostered but wholly unassigned.** | Med | Decision 5 / AC6 — the bench card. |
| **Two kids share a first name *and* a last initial.** | Low | Both show `First L.`; full names remain in the list, the bench and the `sr-only` mirror, and the halo distinguishes the viewer's own. Accepted, documented in code. |
| **A coach who is also a parent on the same team.** | Low | Falls out correctly: `guardedRosteredPlayerIds` is role-blind, so a coach-parent sees their own kid highlighted. AC5 says only "guarding *no* players" sees no change. |
| **Colour-only signalling** (design-plan §10: "state = colour **+** label, always"). | Med | The `Your player` badge on rows and the `(your player)` suffix in the `sr-only` mirror are the text carriers. On the diamond itself the halo is reinforced by the `sr-only` suffix. |
| **`prefers-reduced-motion`.** | Med | `animate-step-up` carries its own `@media (prefers-reduced-motion: reduce) { animation: none }` block, exactly like `animate-rise`. Pinned by the drift test's utility check plus a direct assertion on `globals.css`. |
| **Design-plan drift test goes red mid-implementation.** | Low | Expected — do the `design-plan.md` edit in the same phase as the code (Phase 3), not as a trailing cleanup. |
