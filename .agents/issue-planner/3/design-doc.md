# Design Doc — Phase 3: Teams, `/t/[teamId]` scoping, and `requireTeamAccess` (#3)

## Overview

Stand up URL-based team scoping and the single authorization helper every scoped page
loader and server action will call first. Adds owner-only team creation, team settings
(edit + archive/unarchive), and a team switcher. Everything downstream — Roster (#4) and
Schedule (#6) — is blocked on this landing.

## Acceptance Criteria

From the issue, plus clarifications agreed during planning (marked ✚).

- [ ] AC1 — `requireTeamAccess(teamId, { intent, minRole })` added to
      `src/lib/team-access.ts`: resolves the caller's session and `Membership` for that
      team, loads `archivedAt`, and delegates the decision to the existing pure
      `checkTeamAccess`. `checkTeamAccess` itself is unmodified.
- [ ] AC2 — `/t/[teamId]/` route group and layout exist; the layout calls
      `requireTeamAccess` (`intent: "read"`) before rendering anything
- [ ] AC3 — Team creation at `/t/new`, restricted to `OWNER_EMAIL`; creates `Team` and
      grants the creator `Membership(OWNER)` on it, in one transaction
- [ ] AC4 — Team settings page supports editing `name`, `season`, and `allPlay`
- [ ] AC5 — Team switcher: the owner sees every team; everyone else sees only teams they
      hold a `Membership` on
- [ ] AC6 — Archive / unarchive by setting and clearing `Team.archivedAt`
- [ ] AC7 — `src/lib/teams.ts` is the data module for all team-scoped queries and writes
- [ ] AC8 — Tests cover `requireTeamAccess` role and archived rejection paths
- [ ] AC9 ✚ — The landing page (`/`) no longer shows team names to anyone who isn't
      signed in, and a signed-in non-owner never sees a team they don't belong to —
      resolves a conflict with the public "All Teams" directory #1 shipped
- [ ] AC10 ✚ — Archived teams appear in the switcher in a separate, clearly labeled
      section (for whichever caller can already see that team) rather than being hidden
      entirely
- [ ] AC11 ✚ — Editing team settings and archiving/unarchiving both require `minRole:
      OWNER`; roster and schedule mutations (#4, #6) are COACH+ and are out of scope here
- [ ] AC12 — `pnpm check` (lint → typecheck → test) passes
- [ ] AC13 — `pnpm build` succeeds

## Architecture & Data Model

### Data Layer

**No schema change.** `Team` (`prisma/schema.prisma:114-132`) and `Membership`
(`:135-147`) already exist and are migrated (`prisma/migrations/20260728053521_001`).
This issue is entirely queries and one transactional write against existing tables.

| Operation | Table(s) | When |
|---|---|---|
| Resolve caller's role + team's archived status | `Team`, `Membership` (single query) | Every `requireTeamAccess` call |
| List every team | `Team` | Switcher, owner only |
| List a user's teams | `Team` via `Membership` | Switcher, non-owner; also used to compute the owner's own membership set |
| Load one team | `Team` | Layout, team page, settings page |
| Create team + grant owner membership | `Team` (insert), `Membership` (insert) | `/t/new`, one transaction |
| Update name/season/allPlay | `Team` | Settings page |
| Set/clear `archivedAt` | `Team` | Settings page |

### API / Service Layer

| Module / Function | Type | Auth | Purpose |
|---|---|---|---|
| `checkTeamAccess(input)` | Pure (existing, unchanged) | — | Role + archived decision, tested exhaustively without a database |
| `requireTeamAccess(teamId, { intent, minRole })` | DB read + session | — | Thin wrapper: resolves caller + team, delegates to `checkTeamAccess` |
| `getCurrentUser()` | DB read via `auth()` (existing) | — | Identity source `requireTeamAccess` calls |
| `getAllTeams()` | DB read | Caller-gated (owner only, enforced by the page) | Every team, any archived state |
| `getMemberTeams(userId)` | DB read | — | Every team the user holds a `Membership` on, any archived state |
| `getTeamById(teamId)` | DB read | — | One team's display fields |
| `createTeam(input, ownerId)` | DB write (transaction) | Caller-gated (`isOwnerEmail`, enforced by the page/action) | `Team` insert + `Membership(OWNER)` insert |
| `updateTeam(teamId, input)` | DB write | Caller-gated (`requireTeamAccess`, `minRole: OWNER`) | Name/season/allPlay |
| `archiveTeam(teamId)` | DB write | Caller-gated (`requireTeamAccess`, `minRole: OWNER`, `intent: "write"`) | Sets `archivedAt` |
| `unarchiveTeam(teamId)` | DB write | Caller-gated (`requireTeamAccess`, `minRole: OWNER`, `intent: "read"` — see Decision 3) | Clears `archivedAt` |

### Route tree

```
src/app/t/
├── new/
│   ├── page.tsx            Team creation form — owner-gated directly, no teamId to scope against
│   └── actions.ts          createTeamAction
└── [teamId]/
    ├── layout.tsx           requireTeamAccess(teamId, { intent: "read" }); renders team chrome
    ├── page.tsx             Team home: name/season/allPlay + settings entry (owner)
    └── settings/
        ├── page.tsx         Edit form + archive/unarchive — requireTeamAccess minRole OWNER
        └── actions.ts       updateTeamAction, archiveTeamAction, unarchiveTeamAction
```

`src/app/t/new/` and `src/app/t/[teamId]/` are siblings; Next.js resolves the static
`new` segment before the dynamic `[teamId]` segment, so `/t/new` never reaches the
`[teamId]` layout and needs its own guard.

### Module tree

```
src/lib/team-access.ts        checkTeamAccess (existing, pure) + requireTeamAccess (new)
src/lib/teams.ts               getAllTeams, getMemberTeams, getTeamById, createTeam,
                                updateTeam, archiveTeam, unarchiveTeam
src/lib/session.ts             getCurrentUser (existing, unchanged)
src/lib/owner.ts               isOwnerEmail (existing, unchanged) — used to gate /t/new
                                and to decide the switcher's data source on /
```

### UI Component tree

```
src/app/page.tsx                          (rewritten) signed-out → CTA only; signed-in → TeamSelector
src/components/TeamSelector.tsx           (extended) + archived section
src/components/TeamCard.tsx               (extended) + archived badge
src/app/t/new/page.tsx                    Create-team form (Card + hand-styled inputs, matching signin/page.tsx)
src/app/t/[teamId]/page.tsx               Team home shell
src/app/t/[teamId]/settings/page.tsx      Edit form + archive/unarchive button
```

## Key Decisions

### Decision 1: Landing page becomes membership-scoped, not a public directory

**Options considered:**
- Option A: Keep `/` as the public, unauthenticated directory of every non-archived team
  that #1 shipped (`getPublicTeams()`, no auth check), and build the strictly
  membership-scoped switcher as separate new UI.
- Option B: Rework `/` itself so a signed-out visitor sees no team data, and a signed-in
  caller sees exactly the teams this issue's ACs describe (owner: all; others: their own).

**Decision:** Option B (user-confirmed).

**Rationale:** The issue's own text — "the owner sees every team, everyone else sees
only teams they hold a `Membership` on" — directly contradicts what `getPublicTeams()`
already does (return every non-archived team to anyone, no session check). Leaving it in
place would mean shipping a page that leaks every team's name and season to anonymous
visitors of an app whose entire premise is invite-only and holds children's guardian
contact details. `TeamSelector`/`TeamCard` (built ahead of this issue in #1) already have
the right shape for this — a "My Teams" / "All Teams" split driven by `userTeamIds` — so
the fix is what data feeds them, not a rewrite of the components. `getPublicTeams` is
replaced by `getAllTeams` (owner path) and `getMemberTeams` (everyone else), and `/`
gates on `getCurrentUser()` first.

### Decision 2: The owner's "All Teams" section stays in the component but will rarely render

Because only `OWNER_EMAIL` can create a team (AC3) and creation always grants the
creator `Membership(OWNER)` on it (Decision 15 of `stack-decisions.md`), the owner holds
a `Membership` on every team that exists. `TeamSelector`'s existing "All Teams" (non-member)
bucket was built for the old public-directory case and will be empty for the owner in
practice today. It is left in place rather than removed: it is pre-existing, tested
behavior from #1, costs nothing to keep, and stops being dead code the moment `Revisit
Triggers` → "Single-owner scope" in `stack-decisions.md` is ever revisited (a second
account holding team-level `OWNER` without being the instance owner). Removing it would
be an unrequested refactor of working, tested code.

### Decision 3: Unarchiving must not go through the ordinary `intent: "write"` check

**The conflict:** `checkTeamAccess` — already implemented and tested at
`src/lib/team-access.test.ts:42-51` — rejects **every** write to an archived team,
unconditionally, owner included:

```ts
if (intent === "write" && archivedAt !== null) {
  throw new TeamAccessError("Team is archived and is read-only", "archived");
}
```

*Archiving* an active team is fine — `archivedAt` is still `null` at check time, so
`intent: "write"` passes normally. But *unarchiving* an archived team hits exactly the
condition above: `archivedAt !== null` at the moment of the check, so a naive
`requireTeamAccess(teamId, { intent: "write", minRole: "OWNER" })` in the unarchive
action would always throw — the action whose entire purpose is to leave the archived
state can never run.

**Options considered:**
- Option A: Special-case `unarchiveTeam` in the settings action: call
  `requireTeamAccess(teamId, { intent: "read", minRole: "OWNER" })` — which only asks
  "does this caller hold OWNER on this team," a question archived status never affects —
  then perform the `archivedAt: null` write directly, outside the intent-based gate.
- Option B: Add a third `intent` value (e.g. `"unarchive"`) to `checkTeamAccess` that
  skips the archived check.
- Option C: Change the archived check to `intent === "write" && archivedAt !== null &&
  !isUnarchiving` (an extra parameter threaded through).

**Decision:** Option A.

**Rationale:** The issue's own context is explicit: *"Archived rejection is already
implemented... Do not add scattered per-action archived guards — one check beside the
role check is the design."* That check is meant to guard ordinary content mutations
(roster, chart, schedule, team settings) — protecting a frozen team from being edited.
Unarchiving is not a content mutation; it is the single, designed exit from that frozen
state, and by construction it can never satisfy `intent === "write" && archivedAt ===
null`. Options B and C both modify the pure, already-tested `checkTeamAccess` — the exact
function AGENTS.md and the issue single out as complete and load-bearing — to carve out
an exception for one caller, which is a worse trade than keeping it untouched and doing
the one-line role check directly in `unarchiveTeam`'s call site. This is documented
inline at the call site precisely because "an implementer will get it wrong by being
helpful" (the same phrase `stack-decisions.md` uses for a structurally similar trap) —
it looks like it should be `intent: "write"` and that instinct is what this decision
exists to head off.

### Decision 4: `requireTeamAccess` resolves role and archived status in one query

**Options considered:**
- Option A: Two queries — `db.team.findUnique` for `archivedAt`, `db.membership.findUnique`
  for the caller's role.
- Option B: One `db.team.findUnique` with a filtered `memberships` include
  (`where: { userId }`), reading `archivedAt` and the caller's role off the same row.

**Decision:** Option B.

**Rationale:** Every scoped page loader and every scoped server action calls this —
per the issue, "first." Halving the query count on the hottest authorization path in the
app is free: a team either exists with the caller's membership already attached, or a
`findUnique` on `id` returns `null` and the wrapper throws before touching
`checkTeamAccess` at all.

### Decision 5: A missing team and a missing membership produce the same error

**Options considered:**
- Option A: A `teamId` that doesn't exist throws a distinct `TeamAccessError` reason
  (e.g. `"not-found"`).
- Option B: Both a nonexistent team and an existing team the caller has no `Membership`
  on throw the existing `"no-membership"` reason.

**Decision:** Option B.

**Rationale:** From the caller's perspective these are indistinguishable and *should be*
indistinguishable — a `TeamAccessError` with reason `"no-membership"` is caught in the
layout and turned into `notFound()` either way (Decision 6). Adding a fourth reason to
`TeamAccessError`'s reason union for a difference no caller acts on differently is
needless surface area on a type the issue describes as already correct.

### Decision 6: The `[teamId]` layout turns `TeamAccessError` into `notFound()`, not a redirect

**Options considered:**
- Option A: Catch `TeamAccessError` in the layout and `redirect("/signin?callbackUrl=…")`
  regardless of reason.
- Option B: Catch it and call Next's `notFound()`, rendering the route's 404 boundary.

**Decision:** Option B.

**Rationale:** `src/proxy.ts` already redirects an unauthenticated request to `/signin`
before it reaches the layout (matcher `/t/:path*`) — by the time `requireTeamAccess` runs
inside the layout, the caller is virtually always signed in. The remaining case
`requireTeamAccess` actually has to handle is a signed-in caller with no `Membership` on
*this specific team* (or a stale/invalid session cookie that slipped past the proxy's
optimistic check). Responding `404` rather than bouncing to `/signin` avoids a confusing
redirect loop for a signed-in user, and — more importantly — does not confirm or deny
that a given `teamId` exists to someone who isn't a member of it, which matters because
team IDs are guessable `cuid()`s shared in URLs (Decision 13 of `stack-decisions.md`).

## Security & Permissions

| Surface | Who can reach it | Enforced by |
|---|---|---|
| `/` (signed out) | Anyone | No team data rendered at all |
| `/` (signed in) | Any member | `getCurrentUser()` + `isOwnerEmail` decide `getAllTeams()` vs `getMemberTeams()` |
| `/t/new` | `OWNER_EMAIL` only | Direct `isOwnerEmail` check in the page, before rendering the form |
| `/t/[teamId]` (view) | Any member of that team | `requireTeamAccess(teamId, { intent: "read" })` in the layout |
| `/t/[teamId]/settings` (view + edit) | `OWNER` role on that team | `requireTeamAccess(teamId, { intent: "read", minRole: "OWNER" })` |
| Update name/season/allPlay | `OWNER` role, active team | `requireTeamAccess(teamId, { intent: "write", minRole: "OWNER" })` |
| Archive | `OWNER` role, active team | `requireTeamAccess(teamId, { intent: "write", minRole: "OWNER" })` |
| Unarchive | `OWNER` role (archived status irrelevant) | `requireTeamAccess(teamId, { intent: "read", minRole: "OWNER" })` — see Decision 3 |

Notes:

- **Role is checked before archived status** inside `checkTeamAccess`, unchanged from the
  existing implementation and its test at `team-access.test.ts:53-65` — a `PARENT` hitting
  a `COACH`-level action on an archived team sees "insufficient role," not "archived,"
  because that's the real problem.
- **`requireTeamAccess` never widens who can act.** It only resolves facts (role,
  archived status) and hands them to the unmodified `checkTeamAccess`. The one deliberate
  exception (Decision 3) is scoped to a single call site, not a change to the shared
  decision function.
- No data-level access control beyond `requireTeamAccess` is needed for this issue —
  there is no separate database-level policy layer (Decision 2 of `stack-decisions.md`
  rejected RLS), so this is the entire authorization boundary for team-scoped routes.

## Error Handling

| Layer | Failure | Behavior |
|---|---|---|
| `requireTeamAccess` | Not signed in | `TeamAccessError("no-membership")` (Decision 5) |
| `requireTeamAccess` | `teamId` does not exist | `TeamAccessError("no-membership")` (Decision 5) |
| `requireTeamAccess` | Signed in, no `Membership` on this team | `TeamAccessError("no-membership")` |
| `requireTeamAccess` | Role below `minRole` | `TeamAccessError("insufficient-role")` |
| `requireTeamAccess` | Write attempted on an archived team | `TeamAccessError("archived")` |
| `[teamId]` layout | Any `TeamAccessError` | `notFound()` (Decision 6) |
| `/t/new` page | Caller is not `OWNER_EMAIL` | `notFound()` — mirrors the layout's "don't confirm what exists" posture |
| `createTeamAction` | Zod validation fails (blank name) | Re-render form with a field error |
| Settings actions | Zod validation fails | Re-render form with a field error |
| Settings actions | `TeamAccessError` (role dropped between page load and submit) | Re-render with a generic "you no longer have access" message |

## Testing Strategy

| Layer | Test Type | File(s) | Notes |
|---|---|---|---|
| `checkTeamAccess` | Unit (pure) | `src/lib/team-access.test.ts` | Existing — unchanged |
| `requireTeamAccess` | Unit (mocked `./db`, `./session`) | `src/lib/team-access.test.ts` | No session → `no-membership`; team not found → `no-membership`; no membership row → `no-membership`; role below `minRole` → `insufficient-role`; write on archived → `archived`; success returns `{ role, userId }`; single-query shape (`db.team.findUnique` called once with a `memberships` filter, not two separate calls) |
| `teams.ts` data functions | Unit (mocked `./db`) | `src/lib/teams.test.ts` | `getAllTeams`/`getMemberTeams` query shape; `createTeam` performs `Team` insert + `Membership(OWNER)` insert in one transaction; `updateTeam` only touches name/season/allPlay; `archiveTeam` sets `archivedAt` to a timestamp; `unarchiveTeam` sets it to `null` |
| `TeamCard` | Component | `src/components/TeamCard.test.tsx` | Existing cases plus an archived badge case |
| `TeamSelector` | Component | `src/components/TeamSelector.test.tsx` | Existing cases plus an "Archived Teams" section case |
| Landing page | Component (smoke) | `src/app/page.test.tsx` | Signed-out renders no team data; signed-in owner path calls `getAllTeams`; signed-in non-owner calls `getMemberTeams` — mocking `@/lib/session`, `@/lib/owner` inputs, and `@/lib/teams`, following the existing mock-`getPublicTeams` pattern |
| New pages (`/t/new`, `/t/[teamId]`, `/t/[teamId]/settings`) | Component (smoke) | co-located `page.test.tsx` per the existing `src/app/page.test.tsx` / `src/app/signin/page.test.tsx` pattern | Importable, exports a function; deep authorization behavior is covered by the `requireTeamAccess` unit tests, not re-tested per page |
| Manual verification | — | — | `pnpm build` plus a real request cycle against a running server: sign in as owner, create a team, edit it, archive it, confirm a write 403s (via `notFound`/redirect as designed), unarchive it — mirroring how #2 verified the proxy against a live server |

## Config Changes

- [ ] Schema / index changes — **none required**; `Team` and `Membership` already migrated
- [ ] Access rule changes — none beyond `requireTeamAccess` itself (no RLS layer exists)
- [ ] Environment variables — **none new**; `OWNER_EMAIL` already added in #2
- [ ] Dependency changes — **none**; no new shadcn components needed — new forms follow
      the hand-styled `<input>` + `Card` + `Button` pattern already established in
      `src/app/signin/page.tsx`

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| Unarchive naively implemented with `intent: "write"`, silently no-ops forever | High | Decision 3, called out explicitly with an inline comment at the call site |
| `/` leaking team names/seasons to anonymous visitors (as #1 shipped it) | High | Decision 1 — gated on `getCurrentUser()` before any team query runs |
| A non-member probing `/t/<guessed-cuid>` learns whether that team exists | Med | Decision 6 — `notFound()` for every `TeamAccessError` reason, uniformly |
| `/t/new` reachable by a non-owner who is signed in | Med | Direct `isOwnerEmail` check before rendering the form or accepting the action; mirrors the existing `OWNER_EMAIL` exception in `decideSignIn` |
| Static `/t/new` route shadowed by, or colliding with, the dynamic `/t/[teamId]` segment | Low | Next.js resolves the static segment first; verified against a running server per the testing strategy, the same way #2 verified `proxy.ts` empirically rather than by assumption |
| Owner archives the team they're currently editing mid-session in another tab | Low | `requireTeamAccess`'s write check re-validates `archivedAt` on every submit; a stale form simply gets rejected on save, not silently accepted |
| `TeamSelector`'s unused "All Teams" (non-member) bucket bit-rotting since only the owner ever sees it and they're a member of everything | Low | Decision 2 — left in place deliberately, not deleted; documented as intentionally dormant rather than removed as dead code |
