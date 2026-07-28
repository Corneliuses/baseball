# Design Doc — Phase 3: Teams, `/t/[teamId]` scoping, and `requireTeamAccess` (#3)

## Overview

Stand up URL-based team scoping and the single authorization helper every scoped page
loader and server action calls first. Adds owner-only team creation, team settings
(edit + archive/unarchive), and a team switcher. Everything downstream — Roster (#4) and
Schedule (#6) — is blocked on this landing.

## Acceptance Criteria

From the issue, plus clarifications agreed during planning (marked ✚).

- [ ] AC1 — `requireTeamAccess(teamId, { intent, minRole })` added to
      `src/lib/team-access.ts`: resolves the caller's session and `Membership` for that
      team, loads `archivedAt`, and delegates the decision to the existing pure
      `checkTeamAccess`. `checkTeamAccess` itself is unmodified. Wrapped in React
      `cache()` (Decision 4).
- [ ] AC2 — `/t/[teamId]/` layout **and every page loader beneath it** call
      `requireTeamAccess`. The layout check alone is not the boundary (Decision 6).
- [ ] AC3 — Team creation at `/t/new`, restricted to `OWNER_EMAIL`; creates `Team` and
      grants the creator `Membership(OWNER)` in a single atomic write (Decision 8)
- [ ] AC4 — Team settings page supports editing `name`, `season`, and `allPlay`
- [ ] AC5 — Team switcher: the owner sees every team, everyone else sees only teams they
      hold a `Membership` on. Reachable both from `/` and from inside a team.
- [ ] AC6 — Archive / unarchive by setting and clearing `Team.archivedAt`
- [ ] AC7 — `src/lib/teams.ts` is the data module for all team-scoped queries and writes
- [ ] AC8 — Tests cover `requireTeamAccess` role and archived rejection paths
- [ ] AC9 ✚ — The landing page (`/`) no longer shows team names to anyone who isn't
      signed in, and a signed-in non-owner never sees a team they don't belong to —
      resolves a conflict with the public "All Teams" directory #1 shipped
- [ ] AC10 ✚ — Archived teams appear in the switcher in a separate, clearly labeled
      section rather than being hidden entirely
- [ ] AC11 ✚ — Editing team settings and archiving/unarchiving both require `minRole:
      OWNER`; roster and schedule mutations (#4, #6) are COACH+ and are out of scope here
- [ ] AC12 ✚ — Every mutation calls `revalidatePath` so the change is actually visible
      after the action returns (Decision 9)
- [ ] AC13 — `pnpm check` (lint → typecheck → test) passes
- [ ] AC14 — `pnpm build` succeeds

## Architecture & Data Model

### Data Layer

**No schema change.** `Team` (`prisma/schema.prisma:114-132`) and `Membership`
(`:135-147`) already exist and are migrated — verified directly in
`prisma/migrations/20260728053521_001/migration.sql:42` (`Team`) and `:54`
(`Membership`), with `Membership_userId_teamId_key` at `:184`. This issue is entirely
queries and writes against existing tables.

| Operation | Table(s) | When |
|---|---|---|
| Resolve caller's role + team's archived status | `Team`, `Membership` (single query) | Every `requireTeamAccess` call — deduped per request by React `cache()` |
| List every team | `Team` | Switcher, owner only |
| List a user's teams | `Team` via `Membership` | Switcher, non-owner; also the owner's own membership set |
| Load one team | `Team` | Layout, team page, settings page |
| Create team + grant owner membership | `Team` + nested `Membership` | `/t/new`, one atomic statement |
| Update name/season/allPlay | `Team` | Settings page |
| Set/clear `archivedAt` | `Team` | Settings page |

### API / Service Layer

| Module / Function | Type | Auth | Purpose |
|---|---|---|---|
| `checkTeamAccess(input)` | Pure (existing, unchanged) | — | Role + archived decision, tested exhaustively without a database |
| `requireTeamAccess(teamId, { intent, minRole })` | DB read + session, React-`cache()`d | — | Thin wrapper: resolves caller + team, delegates to `checkTeamAccess` |
| `getCurrentUser()` | DB read via `auth()` (existing) | — | Identity source `requireTeamAccess` calls |
| `getAllTeams()` | DB read | Caller-gated (owner only, enforced by the page) | Every team, any archived state |
| `getMemberTeams(userId)` | DB read | — | Every team the user holds a `Membership` on, any archived state |
| `getTeamById(teamId)` | DB read | — | One team's display fields |
| `createTeam(input, ownerId)` | DB write (nested create) | Caller-gated (`isOwnerEmail`) | `Team` + `Membership(OWNER)` in one statement |
| `updateTeam(teamId, input)` | DB write | `requireTeamAccess`, `intent: "write"`, `minRole: OWNER` | Name/season/allPlay |
| `archiveTeam(teamId)` | DB write | `requireTeamAccess`, `intent: "write"`, `minRole: OWNER` | Sets `archivedAt` |
| `unarchiveTeam(teamId)` | DB write | `requireTeamAccess`, `intent: "read"`, `minRole: OWNER` — see Decision 3 | Clears `archivedAt` |

### Route tree

```
src/app/t/
├── new/
│   ├── page.tsx            Team creation form — owner-gated directly, no teamId to scope against
│   └── actions.ts          createTeamAction
└── [teamId]/
    ├── layout.tsx           requireTeamAccess (chrome + switcher; NOT the boundary — Decision 6)
    ├── not-found.tsx        Boundary for the notFound() the layout and pages throw
    ├── page.tsx             requireTeamAccess again; team home
    └── settings/
        ├── page.tsx         requireTeamAccess({ intent: "read", minRole: "OWNER" })
        └── actions.ts       updateTeamAction, archiveTeamAction, unarchiveTeamAction
```

`src/app/t/new/` and `src/app/t/[teamId]/` are siblings; Next.js matches the static `new`
segment before the dynamic `[teamId]` segment, so `/t/new` never reaches the `[teamId]`
layout and needs its own guard. `src/proxy.ts`'s matcher is `/t/:path*`, which already
covers `/t/new` — an unauthenticated request is redirected to `/signin` before either
guard runs.

### Module tree

```
src/lib/team-access.ts        checkTeamAccess (existing, pure) + requireTeamAccess (new, cache()d)
src/lib/teams.ts               getAllTeams, getMemberTeams, getTeamById, createTeam,
                                updateTeam, archiveTeam, unarchiveTeam
src/lib/session.ts             getCurrentUser (existing, unchanged)
src/lib/owner.ts               isOwnerEmail (existing, unchanged) — gates /t/new and the
                                switcher's data source on /
```

### UI Component tree

```
src/app/page.tsx                          (rewritten) signed-out → CTA only; signed-in → TeamSelector
src/components/TeamSelector.tsx           (extended) + archived section
src/components/TeamCard.tsx               (extended) + archived badge
src/components/TeamSwitcher.tsx           (new) compact switcher for the team-page chrome
src/app/t/new/page.tsx                    Create-team form
src/app/t/[teamId]/page.tsx               Team home shell
src/app/t/[teamId]/settings/page.tsx      Edit form + archive/unarchive
```

## Key Decisions

### Decision 1: Landing page becomes membership-scoped, not a public directory

**Options considered:**
- Option A: Keep `/` as the public, unauthenticated directory of every non-archived team
  that #1 shipped (`getPublicTeams()`, no auth check), and build the strictly
  membership-scoped switcher as separate new UI.
- Option B: Rework `/` itself so a signed-out visitor sees no team data, and a signed-in
  caller sees exactly the teams this issue's ACs describe.

**Decision:** Option B (user-confirmed).

**Rationale:** The issue's own text — "the owner sees every team, everyone else sees
only teams they hold a `Membership` on" — directly contradicts what `getPublicTeams()`
already does (`src/lib/teams.ts:11-33`: every non-archived team, to anyone, no session
check). Leaving it would ship a page that leaks every team's name and season to anonymous
visitors of an app whose premise is invite-only and which holds children's names beside
guardian contact details. `TeamSelector`/`TeamCard` already have the right shape, so the
fix is what data feeds them, not a component rewrite.

**This overturns a stated assumption from #2, deliberately.** #2's design doc risk table
records: *"`getCurrentUser()` called in a static route causing a dynamic bailout | Low |
Only `/t/*` and the sign-in flow use it; **the landing page stays static**."* Adding
`getCurrentUser()` to `/` makes it dynamic. That trade is accepted here: a static page is
worth nothing if what it statically renders is a directory of every team to the public
internet. One consequence is a net positive — `/` no longer prerenders at build time, so
the build-hang scenario that `src/lib/db.ts:20-26` added a 5-second connect timeout to
defend against no longer applies to this route.

### Decision 2: The owner's "All Teams" section stays in the component but will rarely render

Because only `OWNER_EMAIL` can create a team (AC3) and creation always grants the creator
`Membership(OWNER)` (Decision 15 of `stack-decisions.md`), the owner holds a `Membership`
on every team that exists. `TeamSelector`'s existing "All Teams" (non-member) bucket was
built for the old public-directory case and will be empty for the owner in practice. It is
left in place rather than removed: it is pre-existing, tested behavior from #1, costs
nothing, and stops being dormant the moment `Revisit Triggers` → "Single-owner scope" in
`stack-decisions.md` is revisited. Removing it would be an unrequested refactor of
working, tested code.

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
`intent: "write"` passes. But *unarchiving* an archived team hits exactly that condition:
`archivedAt !== null` at check time, so a naive `requireTeamAccess(teamId, { intent:
"write", minRole: "OWNER" })` in the unarchive action would always throw. The one action
whose entire purpose is leaving the archived state could never run.

**Options considered:**
- Option A: In the unarchive action, call `requireTeamAccess(teamId, { intent: "read",
  minRole: "OWNER" })` — which asks only "does this caller hold OWNER on this team," a
  question archived status never affects — then perform the `archivedAt: null` write.
- Option B: Add a third `intent` value (e.g. `"unarchive"`) to `checkTeamAccess`.
- Option C: Thread an extra `isUnarchiving` parameter through the archived check.

**Decision:** Option A.

**Rationale:** The issue is explicit: *"Archived rejection is already implemented… Do not
add scattered per-action archived guards — one check beside the role check is the
design."* That check guards ordinary content mutations — protecting a frozen team from
edits. Unarchiving is not a content mutation; it is the single designed exit from that
state, and by construction can never satisfy `intent === "write" && archivedAt === null`.
Options B and C both modify the pure, already-tested `checkTeamAccess` — the function
AGENTS.md and the issue single out as complete and load-bearing — to carve out an
exception for one caller. Keeping it untouched and doing the role check at the one call
site is the better trade. This needs an inline comment at the call site precisely because
it looks like it should be `intent: "write"`, and that instinct is what the decision
exists to head off.

### Decision 4: One query per check, deduped across the request with React `cache()`

**Options considered:**
- Option A: Two queries — `db.team.findUnique` for `archivedAt`, `db.membership.findUnique`
  for the caller's role.
- Option B: One `db.team.findUnique` with a filtered `memberships` select, reading
  `archivedAt` and the caller's role off the same row.
- Option C: Option B, additionally wrapped in React `cache()`.

**Decision:** Option C.

**Rationale:** Option B halves the query count on the hottest authorization path — a team
either exists with the caller's membership attached, or `findUnique` returns `null` and
the wrapper throws before `checkTeamAccess` is reached. Verified to typecheck clean
against the generated Prisma 7.9 client:

```ts
db.team.findUnique({
  where: { id: teamId },
  select: { archivedAt: true, memberships: { where: { userId }, select: { role: true } } },
})
```

`cache()` is what makes that saving real rather than notional. Because Decision 6 requires
the layout *and* each page loader to check independently — and a server action checks
again on submit — the same lookup fires two to three times per request. Prisma calls are
not deduped the way `fetch` is. The Next.js authentication guide's own DAL pattern wraps
`verifySession` and `getUser` in `cache(...)` for exactly this reason
(`node_modules/next/dist/docs/01-app/02-guides/authentication.md:1143,1176`). Wrapping
`requireTeamAccess` the same way collapses the repeat checks back to a single query while
leaving each call site independently safe.

### Decision 5: A missing team and a missing membership produce the same error

**Options considered:**
- Option A: A `teamId` that doesn't exist throws a distinct reason (e.g. `"not-found"`).
- Option B: Both a nonexistent team and an existing team the caller has no `Membership`
  on throw the existing `"no-membership"` reason.

**Decision:** Option B.

**Rationale:** From the caller's perspective these are indistinguishable and *should be* —
both become `notFound()` (Decision 7). Adding a fourth member to `TeamAccessError`'s
reason union for a difference no caller acts on is needless surface area on a type the
issue describes as already correct.

### Decision 6: Every page loader checks; the layout is chrome, not the boundary

**Options considered:**
- Option A: `requireTeamAccess` in `src/app/t/[teamId]/layout.tsx` only, as the issue's
  task list literally describes ("calling `requireTeamAccess` in the layout loader"), with
  pages beneath it trusting the layout ran.
- Option B: The layout checks *and* every page loader beneath it checks independently.

**Decision:** Option B.

**Rationale:** **A layout is not a reliable authorization boundary in the App Router.**
`node_modules/next/dist/docs/01-app/02-guides/authentication.md:1350` states it directly:

> Due to Partial Rendering, be cautious when doing checks in Layouts as these **don't
> re-render on navigation**, meaning the user session won't be checked on every route
> change. Instead, you should do the checks close to your data source or the component
> that'll be conditionally rendered.

On a client-side transition between two routes sharing the `[teamId]` layout, the layout
does not re-run — so a check that lives only there is evaluated once per full page load
and then trusted indefinitely. The same doc adds that returning `null` from a layout for
unauthorized users is "**not recommended** since Next.js applications have multiple entry
points, which will not prevent nested route segments and Server Actions from being
accessed" (`:1454`).

AGENTS.md already says the right thing — "Every scoped **page loader** and server action
resolves access first" — and so does the issue's own Context section ("`requireTeamAccess`
runs inside it," of server actions). Only the issue's *task* wording says "layout," and
that is the wording to treat as shorthand rather than as the design. The layout check is
kept because it is genuinely useful — it fails fast on a hard navigation and gives the
chrome the team's name and the caller's role — but it is not load-bearing, and Decision 4's
`cache()` makes the redundancy free. This is the single most important rule for #4 and #6
to inherit: **adding a page under `/t/[teamId]/` means adding a `requireTeamAccess` call
to it.**

### Decision 7: `TeamAccessError` becomes `notFound()`, not a redirect

**Options considered:**
- Option A: Catch `TeamAccessError` and `redirect("/signin?callbackUrl=…")` regardless of
  reason.
- Option B: Catch it and call `notFound()`, rendering the route's not-found boundary.

**Decision:** Option B.

**Rationale:** `src/proxy.ts` already redirects unauthenticated requests to `/signin`
(matcher `/t/:path*`), so by the time `requireTeamAccess` runs the caller is virtually
always signed in. The case left to handle is a signed-in caller with no `Membership` on
*this* team, or a stale cookie that passed the proxy's optimistic check. A `404` avoids a
confusing redirect loop for a signed-in user and does not confirm whether a given `teamId`
exists to someone who isn't a member — team IDs are guessable-shaped `cuid()`s that travel
in URLs. `notFound()` throws `NEXT_HTTP_ERROR_FALLBACK;404` and needs no `return`
(`03-api-reference/04-functions/not-found.md:10,33`); a `not-found.tsx` under
`/t/[teamId]/` gives it a scoped boundary instead of the global default.

**The catch must be `instanceof TeamAccessError`, never blanket.** A bare `catch { notFound() }`
would swallow `notFound()`'s own control-flow throw and, worse, would turn a database
outage into a 404 that looks like a routine permission denial.

### Decision 8: `createTeam` is a nested write, not a `$transaction`

**Options considered:**
- Option A: `db.$transaction([...])` array form, matching the existing precedent in
  `src/lib/invitations.ts:74-88`.
- Option B: `db.$transaction(async (tx) => …)` interactive/callback form.
- Option C: A single nested create.

**Decision:** Option C.

**Rationale:** **Option A cannot work here, and it is the form an implementer would reach
for**, because it is the one already in this repo. The array form builds every operation
*before* any executes, so `Membership`'s `teamId` cannot reference the `Team` row being
created in the same array — there is no `team.id` yet. (It works in `invitations.ts`
because every `teamId` there comes from a prior `findMany`.) Option B works but spends an
interactive transaction on something Prisma expresses atomically in one statement. Option
C, verified to typecheck clean against the generated Prisma 7.9 client:

```ts
db.team.create({
  data: {
    name, season, allPlay,
    memberships: { create: { userId: ownerId, role: "OWNER" } },
  },
})
```

### Decision 9: Mutations redirect with an error param and call `revalidatePath`

**Options considered:**
- Option A: `useActionState` + a `"use client"` form component, rendering field errors
  from returned action state.
- Option B: Plain `(formData: FormData)` server actions that `redirect("…?error=…")` on
  validation failure, with the page reading `searchParams` — the pattern already in
  `src/app/signin/actions.ts:20-47` and `src/app/signin/page.tsx:25-47`.

**Decision:** Option B.

**Rationale:** It is the established in-repo pattern, keeps the forms as Server Components
(no `"use client"` boundary, no hydration), and this issue's forms are small enough that
per-field error state buys little. Option A is the better fit once a form has several
independently-invalid fields — a reasonable upgrade for the roster forms in #4, not
something to introduce here for a name and a season.

Separately, **every mutation must call `revalidatePath`** before returning or redirecting.
Server Functions do not invalidate cached route output on their own; the documented
pattern is an explicit `revalidatePath`/`revalidateTag` inside the function
(`01-getting-started/07-mutating-data.md:421-436`). Without it the settings form saves
successfully and re-renders the old values, which reads as a silent failure. Concretely:
`updateTeam`/`archiveTeam`/`unarchiveTeam` revalidate `/t/[teamId]` and `/`; `createTeam`
revalidates `/` before redirecting to the new team.

## Security & Permissions

| Surface | Who can reach it | Enforced by |
|---|---|---|
| `/` (signed out) | Anyone | No team data rendered at all |
| `/` (signed in) | Any member | `getCurrentUser()` + `isOwnerEmail` choose `getAllTeams()` vs `getMemberTeams()` |
| `/t/new` | `OWNER_EMAIL` only | `isOwnerEmail` in the page **and** re-checked in the action |
| `/t/[teamId]` (view) | Any member of that team | `requireTeamAccess(teamId, { intent: "read" })` in the layout **and** in the page |
| `/t/[teamId]/settings` (view) | `OWNER` role on that team | `requireTeamAccess(teamId, { intent: "read", minRole: "OWNER" })` |
| Update name/season/allPlay | `OWNER` role, active team | `requireTeamAccess(teamId, { intent: "write", minRole: "OWNER" })` |
| Archive | `OWNER` role, active team | `requireTeamAccess(teamId, { intent: "write", minRole: "OWNER" })` |
| Unarchive | `OWNER` role (archived status irrelevant) | `requireTeamAccess(teamId, { intent: "read", minRole: "OWNER" })` — Decision 3 |

Notes:

- **Every server action re-checks.** Next's guidance is to "treat Server Actions with the
  same security considerations as public-facing API endpoints"
  (`authentication.md:1459`); a page-level gate never covers the action, because the action
  is independently reachable.
- **Role is checked before archived status** inside `checkTeamAccess`, unchanged, per its
  existing test at `team-access.test.ts:53-65`.
- **`requireTeamAccess` never widens who can act.** It resolves facts and hands them to the
  unmodified `checkTeamAccess`. The one exception (Decision 3) is scoped to a single call
  site.
- No database-level policy layer exists (Decision 2 of `stack-decisions.md` rejected RLS),
  so `requireTeamAccess` is the entire authorization boundary for team-scoped routes.

## Error Handling

| Layer | Failure | Behavior |
|---|---|---|
| `requireTeamAccess` | Not signed in | `TeamAccessError("no-membership")` |
| `requireTeamAccess` | `teamId` does not exist | `TeamAccessError("no-membership")` (Decision 5) |
| `requireTeamAccess` | Signed in, no `Membership` on this team | `TeamAccessError("no-membership")` |
| `requireTeamAccess` | Role below `minRole` | `TeamAccessError("insufficient-role")` |
| `requireTeamAccess` | Write attempted on an archived team | `TeamAccessError("archived")` |
| `requireTeamAccess` | **Database unreachable** | **Let it propagate.** Fail closed and loud — see below |
| Layout / page | `TeamAccessError` specifically | `notFound()` (Decision 7) |
| `/t/new` page + action | Caller is not `OWNER_EMAIL` | `notFound()` |
| `createTeamAction` / settings actions | Zod validation fails | `redirect("…?error=…")`, page renders the message (Decision 9) |
| Settings actions | `TeamAccessError` (role changed between load and submit) | `redirect("…?error=access")` with generic copy |

**`requireTeamAccess` must not adopt the swallow-and-return-empty pattern used by
`getPublicTeams`/`getUserTeams` (`src/lib/teams.ts:28-32`).** That pattern exists so a
dead database renders an empty landing page instead of failing a build, and it is correct
*there*. In an authorization helper, converting an unknown into a value silently turns
"we could not determine access" into a definite answer — today that answer would be a 404,
which is harmless, but it is one inverted conditional away from being an "allow." A
connection error is not a `TeamAccessError`, so with an `instanceof` catch (Decision 7) it
propagates to the error boundary, which is the desired fail-closed outcome. This mirrors
#2's rule for the sign-in gate: *"Fail closed. A database outage must not open the gate."*

## Testing Strategy

| Layer | Test Type | File(s) | Notes |
|---|---|---|---|
| `checkTeamAccess` | Unit (pure) | `src/lib/team-access.test.ts` | Existing — unchanged |
| `requireTeamAccess` | Unit (mocked db + session) | `src/lib/team-access.test.ts` | No session → `no-membership`; team not found → `no-membership`; no membership row → `no-membership`; role below `minRole` → `insufficient-role`; write on archived → `archived`; read on archived succeeds; unarchive shape (`intent: "read"`, `minRole: "OWNER"`) succeeds on an archived team; success returns `{ role, userId }`; a DB error propagates rather than being converted to a denial |
| `teams.ts` | Unit (mocked db) | `src/lib/teams.test.ts` | Query shapes for `getAllTeams`/`getMemberTeams`/`getTeamById`; `createTeam` issues **one** `team.create` with the nested `memberships.create` and `role: "OWNER"` (not a `$transaction`); `updateTeam` touches only name/season/allPlay; `archiveTeam` sets a timestamp; `unarchiveTeam` sets `null` |
| `TeamCard` | Component | `src/components/TeamCard.test.tsx` | Existing cases + archived badge |
| `TeamSelector` | Component | `src/components/TeamSelector.test.tsx` | Existing cases + "Archived Teams" section |
| Landing page | Component (smoke) | `src/app/page.test.tsx` | Signed-out renders no team data and calls no team query; owner path calls `getAllTeams`; non-owner calls `getMemberTeams` |
| New pages | Component (smoke) | co-located `page.test.tsx` | Importable / exports a function, per `src/app/page.test.tsx`; authorization depth is covered by the `requireTeamAccess` unit tests |

**Mock specifiers must match the import specifiers exactly.** `invitations.test.ts` mocks
`"./db"` because the module imports `"./db"`. Mocking `src/lib/session.ts` is required,
not optional — it imports `@/auth`, which pulls the whole Auth.js config graph into the
test run.

**Manual verification against a running server**, mirroring how #2 verified `proxy.ts`
empirically rather than by assumption: sign in as `OWNER_EMAIL`; create a team at `/t/new`
and confirm the redirect; edit it; archive it; confirm a subsequent edit is rejected;
unarchive it; confirm `/t/<some-other-cuid>` 404s; and confirm a client-side navigation
between two `/t/[teamId]` pages still enforces access (the Decision 6 case).

## Config Changes

- [ ] Schema / index changes — **none required**; verified present in migration `…_001`
- [ ] Access rule changes — none beyond `requireTeamAccess` (no RLS layer exists)
- [ ] Environment variables — **none new**; `OWNER_EMAIL` added in #2
- [ ] Dependency changes — **none**; new forms follow the hand-styled `<input>` + `Card` +
      `Button` pattern in `src/app/signin/page.tsx`, so no new shadcn components

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| Authorization checked only in the layout, silently skipped on client-side navigation | **High** | Decision 6 — every page loader checks; stated as the rule #4 and #6 inherit |
| `createTeam` written as an array `$transaction`, copying `invitations.ts`, and failing on the missing `team.id` | **High** | Decision 8 — nested create, verified against the generated client |
| Unarchive implemented with `intent: "write"`, silently unreachable forever | High | Decision 3, with an inline comment at the call site |
| Mutations appearing to do nothing because the route serves cached output | High | Decision 9 — `revalidatePath` in every action |
| `/` leaking team names and seasons to anonymous visitors, as #1 shipped it | High | Decision 1 — gated on `getCurrentUser()` before any team query |
| A blanket `catch` turning a database outage into a 404 that looks like a permission denial | Med | Decision 7 + Error Handling — catch `instanceof TeamAccessError` only |
| A non-member probing `/t/<guessed-cuid>` learning whether that team exists | Med | Decision 7 — uniform `notFound()` for every reason |
| `/t/new` reachable by a signed-in non-owner | Med | `isOwnerEmail` in the page *and* re-checked in the action |
| Repeated `requireTeamAccess` calls multiplying queries per request | Med | Decision 4 — React `cache()` |
| Static `/t/new` colliding with dynamic `/t/[teamId]` | Low | Static segments match first; confirmed against a running server, not assumed |
| Owner archives a team in one tab while editing it in another | Low | The write check re-reads `archivedAt` on submit; the stale form is rejected on save |
| `TeamSelector`'s dormant "All Teams" bucket bit-rotting | Low | Decision 2 — deliberately retained, documented as dormant |

## Corrections made during implementation

Two claims above turned out to be wrong once actually built, caught by testing rather
than review. Recorded here rather than silently edited away.

**`not-found.tsx` belongs at `src/app/not-found.tsx`, not
`src/app/t/[teamId]/not-found.tsx`.** The route tree and Decision 7 originally called for
the latter. `node_modules/next/dist/docs/.../file-conventions/layout.md:24` states
`layout.js` "is the outermost component in a route segment. It wraps... `not-found.js`...
and `page.js`." A `not-found.tsx` inside `[teamId]/` would therefore itself be wrapped by
`[teamId]/layout.tsx` — so it can only catch a `notFound()` thrown by something the
layout successfully rendered (a page beneath it, e.g. `settings/page.tsx` failing its
OWNER check). It cannot catch a `notFound()` thrown by the layout's *own* access check —
the single most common failure path, an ordinary member hitting a team they don't belong
to — because at that point the layout never finished rendering, so nothing inside it,
not-found.tsx included, ever mounts. That case bubbles to the nearest ancestor boundary
instead. The fix is a single boundary at `src/app/not-found.tsx`, above `/t`, which
catches both cases correctly. `pnpm build`'s route table confirms it: `○ /_not-found`
compiles as its own static route.

**`revalidatePath` needs the bracketed pattern plus `type: "layout"`, not the resolved
`` `/t/${teamId}` `` literal.** `03-api-reference/04-functions/revalidatePath.md:26-27`:
a literal path only invalidates that specific page; a dynamic-segment pattern requires
the `type` parameter and additionally invalidates "the layout... all nested layouts
beneath it, and all pages beneath them." Since editing a team's name needs the
`[teamId]/layout.tsx` chrome (which renders the name) to refresh, and settings is nested
beneath that same layout, the actions in `settings/actions.ts` call
`revalidatePath("/t/[teamId]", "layout")` — the literal bracket string, not an
interpolated value.

Separately, a nuance worth recording rather than a bug: **React `cache()` only memoizes
inside an active render.** Verified directly — calling a `cache()`-wrapped function three
times outside of any render (as a plain unit test does) runs the underlying function three
times, not once. `requireTeamAccess`'s tests were written to assert query *shape*, not
call-count deduplication, because the latter isn't observable outside a real request.
Decision 4 remains correct for production traffic (layout, page, and action calls all
happen inside one render), it just cannot be unit-tested the way a first read of the
decision might suggest.

## Verified against the installed packages

Recorded because this plan's first draft was written without `node_modules` present, and
AGENTS.md requires reading `node_modules/next/dist/docs/` before writing code. Every row
below was checked after `pnpm install` and `pnpm db:generate`.

| Claim | Evidence |
|---|---|
| Layout checks don't re-run on client-side navigation | `01-app/02-guides/authentication.md:1350` |
| Returning `null`/guarding in a layout is explicitly not recommended | `authentication.md:1454` |
| Server Actions must do their own authorization | `authentication.md:1459` |
| The DAL pattern wraps session/user lookups in React `cache()` | `authentication.md:1143,1176` |
| `notFound()` throws `NEXT_HTTP_ERROR_FALLBACK;404`, needs no `return` | `03-api-reference/04-functions/not-found.md:10,33` |
| Mutations require an explicit `revalidatePath` to refresh cached output | `01-getting-started/07-mutating-data.md:421-436` |
| Single-query `findUnique` + filtered `memberships` select typechecks | Probe file + `pnpm typecheck` — clean |
| Nested `team.create` with `memberships.create` typechecks | Probe file + `pnpm typecheck` — clean |
| `Role` is a const-object union, so `minRole: "OWNER"` string literals are valid | `src/generated/prisma/enums.ts:12-18` |
| `Team` and `Membership` already migrated | `prisma/migrations/20260728053521_001/migration.sql:42,54,184` |
