# Design Doc — Coach flow improvements: schedule entry, navigation labels, and form feedback (#51)

## Overview

The Aug 2026 UX audit (Dugout Report C1, C4, C5, C7) found the coach experience structurally
sound but full of friction: schedule entry costs ~60 interactions a season, the nav labels
invert meaning ("Lineup" is the viewer, "Chart" is the editor), no form in the app gives any
pending feedback, and admin flows punish mistakes by blanking everything typed. This design
fixes all four blocks — and, per the planning direction, does it as a **UX-designer pass,
not a patch pass**: expressive bespoke icons, real motion, and delight moments, all inside
the Pastoral Banana Ball design system (`docs/design/design-plan.md`) — one banana per
screen, calm admin surfaces, `LazyMotion`/`m` only, nothing animated that dnd-kit drags.

The fun is not decoration bolted on: §8 of the design plan ("Showtime") already specifies
micro-motion that was **never built** — the save-success tick among them. This issue is the
vehicle that finally ships that layer, because pending/success feedback is precisely where
those moments live.

## Direction decisions (from planning Q&A)

- **All four blocks** are planned, each landing as its own PR.
- **"Make it pop" is delivered within the design system** — motion, icons, and
  micro-interactions get loud; color stays on budget. No design-plan revision.
- **Repeat-weekly event creation is deferred** to a follow-up issue (the issue marked it
  "discuss first"; prefill + duplicate already remove most of the 60 interactions).

## Acceptance Criteria

### Block 1 — Schedule entry (C1)
- [ ] The create-event redirect preserves the current `view=` / `month=` / `past=` params
- [ ] After "Add", type / location / opponent stay prefilled ("add another like this")
- [ ] A "Duplicate event" button on the event detail page prefills the add form (everything
      but the date); the coach picks the new date
- [ ] The add form no longer scrolls to top / blanks on validation errors — submitted
      values are echoed back
- [ ] (Deferred, not in this plan: repeat-weekly on create)

### Block 2 — Navigation (C4)
- [ ] Tabs renamed so viewer and editor cannot be confused: `/view` → **Game Day**,
      `/chart` → **Edit Lineup**; `matchNavItem` section-highlighting stays correct
- [ ] Batting order and Positions become peer segments within the editor section
- [ ] Coach-only destinations visually separated from parent-visible ones
- [ ] Members reachable without knowing it lives under Settings
- [ ] Nav pills gain icons (bespoke set — see §Icons)

### Block 3 — Form feedback (C5)
- [ ] `useFormStatus`-based pending/disabled submit states on **all** mutating forms
      (bulk invite first), with an animated pending indicator
- [ ] Validation errors echo submitted values back instead of blanking the form
      (high-typing forms: add event, bulk invite, add player, invite member, compose message)
- [ ] Bulk invite validates per-row, names the offending row(s), and its result names
      which rows failed — not just a count
- [ ] Length-limit errors state the limit; inputs with server limits get matching
      `maxLength` attributes

### Block 4 — Roster & member admin polish (C7)
- [ ] Returning-player picker stays on the picker after each add (row flips to "Added ✓"),
      preserving the `q` filter
- [ ] Manual player add warns on an exact name match with an existing player ("same kid?")
      before creating a duplicate `Player`
- [ ] Members page: human role labels (Parent/Coach/Owner); success feedback on role
      change; pending invitations show expiry and gain revoke + resend
- [ ] Team switcher appends the season label so same-named teams are distinguishable
- [ ] Chart-conflict rejection (`chart-changed`) preserves the coach's losing draft on
      screen for manual re-application instead of discarding it

## Current-state facts the design builds on (verified in code)

- `createEventAction` redirects to bare URLs on every path — `?error=<code>` at
  `schedule/actions.ts:165` and `?added=1` at `actions.ts:180` — dropping `view`/`month`/
  `past` and every field value. `parseViewParam` (`calendar.ts:367`) defaults anything
  not exactly `"list"` to month, so the drop silently flips list-view coaches to the grid.
- **No `useFormStatus`, `useActionState`, `useTransition`, or `useOptimistic` exists
  anywhere in `src/`.** All ~27 mutating forms are plain server-component
  `<form action={…}>` with zero submit feedback; double-tap is unguarded everywhere.
- **No form echoes submitted values back.** The only input-preservation precedent is the
  GET filter at `roster/returning/page.tsx:92`. Redirect-with-`?error=` + DB re-read is
  the universal pattern (`src/lib/error-messages.ts`).
- Bulk invite (`roster/invite/actions.ts:105`) rejects the whole batch on one bad address
  with "One of the email addresses isn't valid. Nothing was sent." — the row is never
  named, every typed address is lost. Execution-time failures are only counters
  (`?sent=&linked=&failed=`, `actions.ts:198-202`).
- TeamNav (`TeamNav.tsx:54-85`): "Lineup"→`/view`, "Chart"→`/chart`; nothing points at
  `/chart/positions` (reached only via a `size="sm"` outline button at
  `chart/page.tsx:104-106`); Members only via a button on Settings
  (`settings/page.tsx:59-61`, `alsoMatch` at `TeamNav.tsx:74-80`); ten ungrouped pills.
- Members page prints raw enums (`OWNER`/`COACH`/`PARENT`) at `members/page.tsx:112-116`
  and `:145`; role change ends `redirect(/t/${teamId}/members)` with **no** success param
  (`members/actions.ts:123`); `expiresAt` is fetched but never rendered; **no revoke or
  team-invite resend action exists**. `ROLE_LABELS` exists only on the directory page
  (`directory/page.tsx:17-21`) — not shared.
- Returning-player add redirects **away** to `/roster?added=1`
  (`roster/returning/actions.ts:130`), dropping the `q` filter and forcing a Back-nav per
  player. `addPlayerToRoster` (`roster.ts:331-348`) always creates a new global `Player`
  — no duplicate-name check of any kind.
- `TeamSwitcher.tsx:32-34` renders only `{team.name}` (+ "(Archived)"); `Team.season` is
  already in `TEAM_SELECT` (`teams.ts:26-33`) and simply unused.
- Chart conflict: both editors post a `baseline`; on mismatch the action redirects with
  `?error=chart-changed` (`chart/actions.ts:94-96`, `positions/actions.ts:111-113`), the
  client unmounts, and the `useState` draft is discarded; the page re-keys the editor on
  fresh entries (`chart/page.tsx:166`).
- **No icon library.** All existing glyphs are bespoke `aria-hidden` inline SVG
  (`StitchDivider`, `TeamCard` pennant, `FieldArt`, `JerseyDot`); shadcn's button already
  carries unused icon-slot styling (`ui/button.tsx:8`).
- **Motion**: `LazyMotion` mounted app-wide (`app/layout.tsx:71`); exactly one Motion
  component (`view/Reveal.tsx`, translate-only, no SSR opacity); CSS utilities
  `animate-rise` / `animate-step-up` in `globals.css` with `prefers-reduced-motion`
  gates. §8's RSVP pop, save-success tick, pennant tilt, confetti: **not built**.

## Architecture & Data Model

### Data Layer

**No schema changes.** Every feature reads or writes existing columns:
`Event` fields for duplicate-prefill, `Invitation.expiresAt` (already selected by
`listTeamInvitations`), `Team.season` (already in `TEAM_SELECT`), `Player.name` for the
duplicate check. Invitation revoke is a `delete` on the existing model. No migration.

### API / Service Layer

| Endpoint / Function | Type | Auth | Purpose |
|---|---|---|---|
| `createEventAction` (`schedule/actions.ts`) | Server Action, converted to `useActionState` signature | COACH+ | Returns `{error, values}` on validation failure (no redirect, no blanking); on success `revalidatePath` + returns `{ok, keep}` so type/location/opponent persist client-side |
| `bulkInviteGuardiansAction` (`roster/invite/actions.ts`) | Server Action, converted to `useActionState` signature | COACH+ | Per-row validation returning `{rowErrors: Record<entryId, code>, values}`; result returns named rows per outcome (`sent`/`linked`/`failed` with player names + reasons) |
| `addPlayerAction` (`roster/actions.ts`) | Server Action + confirm step | COACH+ | Case-insensitive exact-name check against this team's roster and returning candidates; first submit on match returns `duplicate-name` state; resubmit with `force` proceeds |
| `addReturningPlayerAction` (`roster/returning/actions.ts`) | Server Action (redirect changes) | OWNER | Success redirects back to `/roster/returning?added=<playerId>&q=<q>` instead of away to the roster |
| `setMemberRoleAction` (`members/actions.ts`) | Server Action (redirect changes) | OWNER | Success redirect gains `?role-saved=1` |
| `revokeInvitationAction` (new, `members/actions.ts`) | Server Action | OWNER | Deletes a live invitation by id, team-scoped (`deleteMany({ id, teamId })`) |
| `resendInvitationAction` (new, `members/actions.ts`) | Server Action | OWNER | Re-issues via existing `createInvitation` (which deletes prior rows for `(teamId, email)`) |
| `saveBattingOrder` / `savePositions` actions | unchanged | COACH+ | Conflict handling stays server-side; draft preservation is client-side (see Decision 6) |

All converted actions keep the existing hard boundaries: `extractTeamId` → 
`requireTeamAccess` → work; `unstable_rethrow` first in every catch; `TeamAccessError`
still redirects to `?error=access` (access failures are not form state). The `?error=`
pages keep `messageTable`/`messageFor` — new codes are added to tables, never plain
object literals (AGENTS.md rule, enforced by `error-message-tables.test.ts`).

### UI Component Tree (new/changed)

```
src/components/
├── icons.tsx                 NEW — bespoke aria-hidden SVG icon set (see §Icons)
├── SubmitButton.tsx          NEW — "use client"; useFormStatus; wraps ui/Button;
│                                   pending → disabled + BaseballSpinner + pending label
├── BaseballSpinner.tsx       NEW — inline SVG baseball (circle + stitch arcs),
│                                   CSS `animate-spin-ball`, reduced-motion gated
├── StatusBanner.tsx          NEW — role="status"/role="alert" banner with animate-rise
│                                   and a stroke-draw ✓ tick (the unbuilt §8 "save tick")
├── TeamNav.tsx               CHANGED — icons, renames, coach group + seam divider,
│                                   Members item; matchNavItem untouched
└── TeamSwitcher.tsx          CHANGED — " · {season}" suffix in option labels

src/app/t/[teamId]/
├── schedule/
│   ├── AddEventForm.tsx      NEW — "use client"; useActionState; sticky fields;
│   │                               initialValues (duplicate-prefill); hidden view/month/past
│   ├── page.tsx              CHANGED — passes view/month/past + duplicate-source values in
│   └── [eventId]/page.tsx    CHANGED — "Duplicate event" link → /schedule?duplicate=<id>#add-event
├── chart/
│   ├── EditorTabs.tsx        NEW — server component; chunky two-segment control
│   │                               (Batting Order | Positions) on both editor pages
│   ├── DraftStash.tsx        NEW — "use client"; sessionStorage stash + read-only
│   │                               "Your unsaved draft" chalk-box panel on ?error=chart-changed
│   └── (both editors)        CHANGED — stash draft on submit; render DraftStash
├── roster/invite/
│   └── InviteForm.tsx        NEW — "use client"; useActionState; per-row errors inline;
│                                   named results; honest pending copy
├── roster/returning/page.tsx CHANGED — "Added ✓" row state, preserved q
└── members/page.tsx          CHANGED — ROLE_LABELS, expiry, revoke/resend, role-saved banner

src/lib/
└── roles.ts                  NEW — shared ROLE_LABELS (moved from directory/page.tsx:17-21)
```

## The design layer (the "make it pop" spec)

Everything below obeys: one banana per screen, calm admin (§7), CSS-first motion with
`prefers-reduced-motion` gates, Motion only via `m.` inside the mounted `LazyMotion`, and
**nothing dnd-kit touches animates** (both editor headers restate this; the DraftStash
panel and EditorTabs are static, outside the drag tree).

### Icons — a bespoke "dugout" set, not a library

No dependency. One new module `src/components/icons.tsx` of hand-drawn, stroke-based,
`aria-hidden focusable="false"` SVGs at a shared 24-unit viewBox, sized by the button's
existing `[&_svg]:size-4` slot. This matches the app's felt-and-cardstock language
(the pennant, the stitch divider, `FieldArt`) — a lucide import would look like the SaaS
dashboard §2 forbids. The set (~12 glyphs, each 3–6 paths):

| Icon | Used by |
|---|---|
| `PennantIcon` | Home tab (reuses `TeamCard`'s pennant geometry) |
| `TicketIcon` | Schedule tab, Duplicate button |
| `DiamondIcon` | Game Day tab (mini four-base diamond) |
| `JerseyIcon` | Roster tab |
| `MegaphoneIcon` | Messages tab |
| `ScoreboardIcon` | Readiness tab |
| `ClipboardIcon` | Edit Lineup tab (coach's lineup card on a clipboard) |
| `RolodexIcon` | Directory tab |
| `CapIcon` | Members tab (team cap) |
| `GearIcon` | Settings tab |
| `WhistleIcon` | Coach-group divider marker |
| `CheckIcon` | StatusBanner tick (stroke-draw animated) |

Nav pills keep their text labels — icons are additive, never color-alone or icon-alone
(§10 state-plus-label rule extended to wayfinding).

### Motion inventory (all new animation, one table)

| Moment | Mechanism | Spec |
|---|---|---|
| Submit pending | `BaseballSpinner` + CSS `@utility animate-spin-ball` | 360° rotate, 0.9s linear infinite while pending only (bounded by pending, so "nothing loops forever" is honored); reduced-motion → static ⚾ glyph, label still swaps ("Sending…") |
| Success banners | `StatusBanner` with existing `animate-rise` + new `@utility animate-tick` | ✓ drawn via `stroke-dashoffset` 0.4s ease-out — this ships §8's unbuilt "save-success tick"; translate-only rise (no SSR opacity, the `Reveal` rule) |
| "Added ✓" row flip (returning picker) | `animate-rise` on the flipped row | server-rendered state, CSS entrance |
| Duplicate-event landing | `#add-event` anchor + `animate-rise` on the prefilled form card; `scroll-margin-top` | the form visibly "arrives" instead of the coach hunting for it |
| Nav active pill | CSS `transition-colors` (already present) + icon `scale` on `:active` via `transition-transform` | tactile tap feedback, 120ms |
| Editor segmented control | static; active segment gets the Field Green fill like nav pills | restraint zone — no motion near the editors' drag tree |

Explicitly **not** in scope: confetti on chart save (§8 defers it pending a dependency —
noted as the follow-up flourish) and the RSVP ⚾ pop (§8, belongs to the RSVP surfaces,
not this issue).

### Banana budget audit (per changed screen)

| Screen | Its one banana | New elements' colors |
|---|---|---|
| Schedule | unchanged (none of the new elements is yellow) | pending spinner: navy stitches on cream; success banner: Field Green |
| Nav (every screen) | still none — §7 "deliberately no banana in the nav" | coach-group pills: `--secondary` clay tint + `WhistleIcon`; seam divider: `--destructive` stitch red at low emphasis, matching `StitchDivider` |
| Members / roster / invite | calm pages: stay banana-free (§7) | greens/clay only; "Added ✓" uses Field Green |
| Chart editors | drop-target `isOver` glow (existing) | DraftStash panel is a chalk box (dashed warm border), no yellow |

## Key Decisions

### Decision 1: How forms keep typed values — `useActionState`, not param echo

**Options considered:**
- A: Echo submitted values through redirect query params (`?error=…&location=…`)
- B: Convert high-typing forms to client components using React 19 `useActionState`;
  the action returns `{error, values}` instead of redirecting on validation failure
- C: Cookie/flash-message storage for rejected submissions

**Decision:** B for the five high-typing forms (add event, bulk invite, add player,
invite member, compose message); the rest of the app keeps redirect-`?error=` and gains
only pending states.
**Rationale:** Param echo breaks on `notes` (2000 chars → ~6KB URLs) and leaks typed
content into history/logs; cookies are used exactly once in the app (session minting) and
a flash layer is new machinery. `useActionState` is the platform's own answer: values
never leave the client on failure, there is no reload, no scroll-to-top, and pending
state falls out of the same hook. It also fixes Block 1's "resets all five fields" and
"scrolls to top" without any URL games — on success the action calls `revalidatePath` and
returns, so the list updates in place while the form keeps its sticky fields. Access
errors (`TeamAccessError`) still redirect — a person losing access mid-session is not
form state. DB-backed single-field forms (settings, profile, roster entry) keep their
current pattern: their `defaultValue` comes from the row being edited and the loss is
one field, not a page of typing.

### Decision 2: Param preservation for the redirects that remain — re-parse, never forward

Where the schedule action still redirects (access errors) and for the month/list context
generally, the form posts hidden `view`/`month`/`past` fields and the action rebuilds the
redirect with `URLSearchParams`, passing each value back through `parseViewParam` /
`parseMonthParam` before emitting it. This follows the two existing precedents — the
bulk-invite `URLSearchParams` accumulation (`invite/actions.ts:198-202`) and the
`rsvpAction` doctrine at `schedule/actions.ts:236-247`: context fields are validated
enums/formats, **never a `returnTo` URL** — a URL field would hand any form-crafter an
open redirect out of a signed-in POST.

### Decision 3: Duplicate event — a `?duplicate=<eventId>` prefill link, not a clone action

**Options considered:**
- A: One-tap server action that clones the event immediately (coach edits date after)
- B: "Duplicate event" is a `<Link>` to `/schedule?duplicate=<id>#add-event`; the page
  loads the source event (team-scoped `getEvent`), pre-fills the add form's initial
  values (type, location, opponent, notes — **not** the date), coach picks the date and
  submits normally

**Decision:** B.
**Rationale:** A creates a real event with a wrong/placeholder date — a lie on the
schedule that pushes RSVPs and the calendar feed until it's fixed, and it needs a new
mutation path. B reuses `createEventAction` unchanged, is inherently safe (a GET that
renders a form), and the anchor+rise makes the flow legible. The button lives in the
`canEdit` block of the event page (`[eventId]/page.tsx:269-409`), next to Edit.

### Decision 4: Navigation information architecture

**Options considered for labels:** "Game day"/"Edit lineup" (issue's suggestion) vs
"Lineup"/"Lineup editor" vs keeping "Chart".
**Decision:** `/view` → **Game Day** (with `DiamondIcon`), `/chart` → **Edit Lineup**
(with `ClipboardIcon`). "Game Day" is already the design plan's own slab-type rallying
cry (§4) and describes what parents open it for; "Edit Lineup" states the verb, so the
pair cannot be confused. Page-level `metadata.title`s and on-page headings follow
("Lineup — …" stays accurate for `/view`'s tab title as "Game Day — …" etc.).

**Grouping:** one scrolling pill row (the mobile constraint at `TeamNav.tsx:106` stays),
but items gain `group: "team" | "coach"`; between groups renders a small vertical seam
divider (two red stitch dashes, `WhistleIcon` capped) and coach pills sit on
`--secondary` clay stock instead of card stock — visually "the coach's rack" without a
second row or a banana. Structure: Home · Schedule · Game Day · Roster · Messages ‖
Readiness · Edit Lineup · Directory · Members (OWNER) · Settings (OWNER) · Profile.
`aria-label`s on the two `<li>` groups name them for screen readers.

**Members:** gets its own owner-gated pill (`base/members`, `CapIcon`); Settings drops
its `alsoMatch` (`TeamNav.tsx:74-80`) since Members now owns its section highlight. The
Settings-page button stays (two routes to admin surfaces is fine; zero was the bug).

**Editor peers:** new `EditorTabs` server component rendered at the top of both
`/chart` and `/chart/positions` — a two-segment control (Batting Order | Positions),
active segment filled Field Green like nav pills, replacing the small "Positions" /
"Batting order" outline buttons (`chart/page.tsx:104-106`, `positions/page.tsx:102-104`).
"View chart" link is retitled "See Game Day view". `matchNavItem` needs **no change**:
prefix matching already lights `/chart` for `/chart/positions`
(`TeamNav.test.tsx:74-138` pins it).

### Decision 5: Bulk invite — per-row validation with named outcomes

The action's pre-flight loop validates each row and, instead of the batch-killing
redirect (`invite/actions.ts:105`), returns `{rowErrors, values}`; the client form marks
the offending input(s) (`aria-invalid`, stitch-red border, message under the row naming
the player) and preserves every other row. Valid rows are **not** sent until all rows
pass — half-sending on first submit would make retry semantics ambiguous ("which of
these already went out?"); the coach fixes the named row and resubmits. Execution-time
results return named lists — "Sent to Maya R.'s parent ✓" / "Linked (already a member)" /
"Couldn't send for Jake M. — email bounced" — replacing the three blind counters. The
~9s pending window gets the spinner plus honest copy ("Sending 12 invitations — about
ten seconds…"), and the disabled submit closes the double-send hole. `maxDuration = 60`
(`invite/page.tsx:31`) and the `MAX_ROWS × MIN_SEND_INTERVAL_MS` coupling are untouched.

### Decision 6: Chart-conflict draft preservation — sessionStorage stash, not merge

**Options considered:**
- A: Convert chart saves to `useActionState` and render "their board vs your draft" with
  merge/re-apply tooling
- B: On submit, the editor stashes the draft (JSON it already serializes into the hidden
  field) to `sessionStorage` keyed `chart-draft:<teamId>:<editor>`; when the page returns
  with `?error=chart-changed`, a `DraftStash` client component renders the stash as a
  read-only chalk-box panel — "Your unsaved draft" — beside the fresh board, cleared on
  next successful save or explicit dismiss

**Decision:** B.
**Rationale:** The issue asks to preserve the draft "on screen for manual re-application"
— a reference panel is exactly that. A keeps the losing draft *interactive* against a
board that has changed underneath it, which reintroduces the lost-update problem the
baseline guard exists to prevent (`positions/actions.ts:89-110`), and it would rebuild
both editors' posting machinery. B touches neither the action nor the guard, respects the
re-key on fresh entries (`chart/page.tsx:166`), and stays out of dnd-kit's tree entirely.
sessionStorage (per-tab, ephemeral) fits a draft better than localStorage
(`InstallPrompt` precedent); reads/writes are try/catch-wrapped and absence degrades to
today's behavior.

### Decision 7: Duplicate-name warning — two-step confirm, in the returned form state

Exact-match check (trimmed, case-insensitive) against this team's rostered players and
the owner's returning candidates. On match, `addPlayerAction` returns a `duplicate-name`
state naming the match ("A player named **Jake Miller** is already on the roster /
played last season — same kid?") with two buttons: "Add anyway" (resubmits with hidden
`force=1`) and "Use returning-player picker" (link) when the match is a candidate. This
mirrors the delete-event `?confirm=` two-step (`[eventId]/page.tsx:372-407`) but lives in
form state since the form is being converted anyway (Decision 1). Fuzzy matching is
deliberately out — exact match only, per the issue.

## Security & Permissions

No new surfaces relax anything. All converted actions keep `requireTeamAccess` with the
same `minRole` as today (COACH+ for schedule/roster/invite writes, OWNER for members,
returning, revoke/resend). `revokeInvitationAction` deletes with
`deleteMany({ id, teamId })` so a forged id from another team is a no-op — the same
team-scoping-in-the-where rule as `src/lib/schedule.ts`. The `?duplicate=` param goes
through `getEvent(teamId, eventId)`, which is team-scoped; a foreign event id renders an
un-prefilled form. Hidden context fields are enums/formats re-validated server-side
(Decision 2) — never URLs. Archived teams still reject every write via the unchanged
access layer.

## Error Handling

- Converted forms: validation failures come back as typed state (`{error, values,
  rowErrors?}`) rendered inline with `role="alert"` and `aria-describedby` wiring
  (extending the pattern that today only signin/new-team/settings/roster-entry/profile
  have); access failures still redirect to `?error=access` and the pages' existing
  `messageTable`s render them.
- Unconverted forms keep the `?error=` + `messageFor` pattern; **new codes**
  (`role-saved` success param, `revoked=1`, `resent=1`, `added=<playerId>` on returning)
  are added to existing null-prototyped tables. `error-message-tables.test.ts` (AST-level)
  continues to enforce no hand-rolled lookups.
- Length-limit messages gain their numbers ("Location is too long — keep it under 200
  characters."), and the three schedule text fields gain matching `maxLength` attributes
  (closing the "reachable purely by typing" asymmetry).
- sessionStorage access is try/catch-wrapped; a throwing storage (private mode) degrades
  to the current discard behavior with the existing banner copy.

## Testing Strategy

| Layer | Test Type | File(s) | Notes |
|---|---|---|---|
| SubmitButton / BaseballSpinner | Component | `src/components/SubmitButton.test.tsx` | Mock `useFormStatus`; assert disabled + label swap + spinner when pending; static glyph under reduced motion is CSS (not asserted in jsdom) |
| StatusBanner | Component | `src/components/StatusBanner.test.tsx` | role="status" vs "alert"; tick present |
| Icons | Component | `src/components/icons.test.tsx` | every icon `aria-hidden` + `focusable="false"` (the repo-wide decorative-SVG rule) |
| TeamNav | Component | `src/components/TeamNav.test.tsx` | Update labels; new Members item (owner-only); group separation; keep "never lights two tabs" + `/chart/positions` → Edit Lineup section |
| AddEventForm | Component | `src/app/t/[teamId]/schedule/AddEventForm.test.tsx` | Sticky fields after success state; error state echoes values; duplicate initialValues; hidden view/month fields |
| Schedule actions | Unit | `schedule/actions.test.ts` | Param re-parse on redirects; state-return on validation failure; existing 123-217 block adapted |
| Event page | Unit | `[eventId]/page.test.tsx` | Duplicate link present for canEdit, absent for parents |
| Bulk invite | Unit + component | `invite/actions.test.ts`, `invite/InviteForm.test.tsx` | Per-row errors name the row; no send until all valid; named result lists; pacing/caps untouched |
| Add player dup-check | Unit | `roster/actions.test.ts` | Exact match → duplicate-name state; `force=1` proceeds; case/trim variants |
| Returning picker | Unit | `returning/actions.test.ts`, `returning/page.test.tsx` | Redirect back with `q` + `added`; "Added ✓" row render |
| Members | Unit | `members/actions.test.ts`, `members/page.test.tsx` | ROLE_LABELS rendering; role-saved banner; expiry text (via `calendar.ts` helpers); revoke scoping (foreign teamId no-op); resend |
| TeamSwitcher | Component | `TeamSwitcher.test.tsx` | Season suffix; absent when null |
| DraftStash | Component | `chart/DraftStash.test.tsx` | jsdom sessionStorage: stash on submit, panel renders on chart-changed, cleared on save/dismiss, storage-throw degrades silently |
| Drift guard | Existing | `src/design-plan-drift.test.ts` | New `@utility animate-spin-ball` / `animate-tick` blocks exist in `globals.css` only if design-plan.md names them — plan update in the docs step |

Static imports only in tests (AGENTS.md timing rule); co-located files.

## Config Changes

- [ ] Schema / index changes — **none**
- [ ] Access rule changes — **none** (two new owner-only actions use existing `requireTeamAccess`)
- [ ] Environment variables — **none**
- [ ] Dependency changes — **none** (icons are bespoke; confetti explicitly deferred to avoid a dep)

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| `useActionState` conversion breaks progressive enhancement (JS not yet hydrated at a field on one bar) | Med | React 19 server actions still submit pre-hydration; the no-JS fallback is today's behavior (full POST). Pending/echo are enhancements, never gates |
| Hidden `view`/`month` fields carry attacker values | Low | Re-parsed by `parseViewParam`/`parseMonthParam` (never throw, default safely) before entering any redirect — Decision 2 |
| Duplicate-prefill leaks another team's event | Low | `getEvent(teamId, eventId)` is team-scoped; miss renders an empty form |
| Bulk-invite double submit during the ~9s window | High (today) | `useFormStatus` disabled submit closes it; this is the "bulk invite first" AC |
| sessionStorage unavailable (private mode, storage-blocked) | Low | try/catch; degrades to current discard + existing banner copy |
| Nav renames break muscle memory / bookmarks | Low | URLs unchanged — only labels move; section matching pinned by updated tests |
| Settings `alsoMatch` removal orphans `/members` highlighting | Low | Members pill owns the section; TeamNav test asserts exactly one lit tab on `/members` |
| Named invite results expose family emails | Low | Results name **players/rows**, not addresses beyond what the coach just typed; page is already COACH+ (contact details are staff-facing per AGENTS.md) |
| Two coaches, one stashed draft, shared device | Low | sessionStorage is per-tab and cleared on save/dismiss; panel is read-only reference |
| `animate-spin-ball` loops "forever" vs §8's rule | Low | Bounded by pending state — it stops when the action settles; reduced-motion shows a static glyph |
