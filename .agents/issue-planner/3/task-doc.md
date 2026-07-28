# Task Doc — Phase 3: Teams, `/t/[teamId]` scoping, and `requireTeamAccess` (#3)

## Prerequisites

- [x] #1 (App shell) merged — `PageContainer`, `Button`, `Card`, `TeamCard`, `TeamSelector`
      exist
- [x] #2 (Auth) merged — `getCurrentUser()`, `isOwnerEmail()`, `OWNER_EMAIL` in place
- [x] `pnpm install && pnpm db:generate` — `node_modules` and `src/generated/prisma` are
      both gitignored, and nothing typechecks without them

## Phase 1: Authorization — `requireTeamAccess`

- [x] Add `requireTeamAccess` to `src/lib/team-access.ts`, below the existing pure
      `checkTeamAccess`. **`cache()` wraps the query, not `requireTeamAccess` itself** —
      React keys on argument identity, so caching a function that takes an options object
      misses on every call (measured: 3 calls → 3 queries). See design-doc Decision 4 and
      "Corrections made during implementation".

  ```ts
  import { cache } from "react";

  // cached: two string args, so the key is stable across call sites
  const loadTeamAccessFacts = cache(async (teamId: string, userId: string) => { … });

  export async function requireTeamAccess(
    teamId: string,
    { intent, minRole }: { intent: "read" | "write"; minRole?: Role },
  ): Promise<{ role: Role; userId: string }> { … }
  ```

  It must:
  - Call `getCurrentUser()`; if `null`, throw `TeamAccessError("Not signed in", "no-membership")`
  - Run one `db.team.findUnique({ where: { id: teamId }, select: { archivedAt: true,
    memberships: { where: { userId }, select: { role: true } } } })`
  - If the team is `null`, throw `TeamAccessError("Team not found", "no-membership")`
  - Call the existing `checkTeamAccess({ role: team.memberships[0]?.role ?? null,
    archivedAt: team.archivedAt, intent, minRole })` and return `{ role, userId }`
  - **Not** wrap the query in try/catch. A database error must propagate, not be converted
    into a denial — see design-doc "Error Handling"
  - **Not modify `checkTeamAccess`** — Decision 3 explains why unarchiving routes around
    `intent: "write"` instead
- [x] Write `requireTeamAccess` tests in `src/lib/team-access.test.ts`, mocking `./db` and
      `./session` (follow `vi.mock("./db", …)` in `src/lib/invitations.test.ts`; mock
      specifiers must match the import specifiers, and mocking session is required because
      it imports `@/auth`): no session; team not found; no membership row; role below
      `minRole`; `intent: "write"` on archived → `archived`; `intent: "read"` on archived
      succeeds; the unarchive shape (`intent: "read"`, `minRole: "OWNER"`) succeeds on an
      archived team; success returns `{ role, userId }`; a thrown DB error propagates

## Phase 2: Data layer — `src/lib/teams.ts`

- [x] Extend the `Team` interface with `archivedAt: Date | null`
- [x] Replace `getPublicTeams` with `getAllTeams()` — every team, any archived state,
      ordered `createdAt: "desc"`
- [x] Add `getMemberTeams(userId)` — teams with a `Membership` for `userId`, any archived
      state (drop `getUserTeams`'s `archivedAt: null` filter so archived teams can render
      in the switcher's archived section, per AC10)
- [x] Add `getTeamById(teamId): Promise<Team | null>`
- [x] Add `createTeam(input, ownerId)` as a **single nested create — not a
      `$transaction`** (design-doc Decision 8; the array form used in `invitations.ts`
      cannot reference the not-yet-created `team.id`):

  ```ts
  db.team.create({
    data: { name, season, allPlay, memberships: { create: { userId: ownerId, role: "OWNER" } } },
  })
  ```
- [x] Add `updateTeam(teamId, { name, season, allPlay })`
- [x] Add `archiveTeam(teamId, now?)` — sets `archivedAt`
- [x] Add `unarchiveTeam(teamId)` — clears `archivedAt`
- [x] Decide error handling per function: the read helpers may keep the existing
      `try/catch → []` shape from `getPublicTeams`, but **the four mutations must not
      swallow errors** — a silent failure that reports success is worse than a thrown one
- [x] Rewrite `src/lib/teams.test.ts` for the new function set, asserting `createTeam`
      issues exactly one `team.create` carrying the nested membership with `role: "OWNER"`

## Phase 3: Routes & UI

### Authorization plumbing

- [x] `src/app/t/[teamId]/layout.tsx` — call `requireTeamAccess(teamId, { intent: "read" })`;
      catch **`instanceof TeamAccessError` only** and call `notFound()`; render chrome
      (team name + `TeamSwitcher`) around `children`
- [x] `src/app/not-found.tsx` — root-level boundary, **not** nested under
      `[teamId]/`. A layout wraps its own segment's `not-found.tsx`, so a `notFound()`
      thrown by `[teamId]/layout.tsx` itself never reaches a boundary placed inside that
      same segment — see design-doc.md "Corrections made during implementation"
- [x] `src/app/t/[teamId]/page.tsx` — **call `requireTeamAccess` again** (design-doc
      Decision 6: the layout does not re-run on client-side navigation, so it is not the
      boundary); render name, season, `allPlay`, and a settings link only when the returned
      role is `OWNER`

### Team settings

- [x] `src/app/t/[teamId]/settings/page.tsx` — `requireTeamAccess(teamId, { intent:
      "read", minRole: "OWNER" })` (read, so the owner can reach this page on an archived
      team to unarchive it); render the edit form and an archive/unarchive button chosen by
      `archivedAt`; surface `searchParams.error` the way `src/app/signin/page.tsx:25-47` does
- [x] `src/app/t/[teamId]/settings/actions.ts` — all three actions `revalidatePath` and
      redirect on validation failure (Decision 9):
  - `updateTeamAction` — `requireTeamAccess(teamId, { intent: "write", minRole: "OWNER" })`,
    Zod-validate, `updateTeam`, `revalidatePath("/t/[teamId]", "layout")` (the bracketed
    pattern + `"layout"`, not the resolved path — see design-doc.md "Corrections made
    during implementation") + `revalidatePath("/")`
  - `archiveTeamAction` — same gate, `archiveTeam`, same revalidation
  - `unarchiveTeamAction` — **`intent: "read"`, not `"write"`** (Decision 3 — an archived
    team rejects every write, including this one; leave a comment saying so), `unarchiveTeam`,
    same revalidation

### Team creation

- [x] `src/app/t/new/page.tsx` — `getCurrentUser()` +
      `isOwnerEmail(user?.email, process.env.OWNER_EMAIL)`; `notFound()` if not the owner;
      render a creation form matching the `Card` + hand-styled-`<input>` pattern in
      `src/app/signin/page.tsx`
- [x] `src/app/t/new/actions.ts` — `createTeamAction`: **re-check `isOwnerEmail`** (the
      page gate never covers the action), Zod-validate `{ name: z.string().min(1), season:
      z.string().optional(), allPlay: z.boolean() }`, `createTeam`, `revalidatePath("/")`,
      then `redirect(\`/t/${team.id}\`)`

### Switcher and landing page

- [x] `src/components/TeamSwitcher.tsx` — compact switcher for the team-page chrome, so a
      team is reachable from inside another team and not only from `/` (AC5). Takes the
      already-loaded team list as props; does not query
- [x] Rewrite `src/app/page.tsx`: signed-out (`getCurrentUser()` returns `null`) renders
      the welcome copy and a sign-in CTA with **no team query at all**; signed-in calls
      `getMemberTeams(user.id)`, and additionally `getAllTeams()` when the caller is the
      owner, passing `teams` + `userTeamIds` to `TeamSelector`; show a "Create a team" link
      to `/t/new` only for the owner
- [x] Extend `src/components/TeamCard.tsx` — accept `archivedAt: Date | null`, render an
      "Archived" badge when non-null, stay linkable either way (archived teams are
      viewable, just read-only)
- [x] Extend `src/components/TeamSelector.tsx` — split `teams` into active and archived
      before the existing My-Teams/All-Teams grouping; render a third "Archived Teams"
      section when any archived team is present

### Tests

- [x] Update `TeamCard.test.tsx` and `TeamSelector.test.tsx` for the archived cases (note
      the existing `mockTeams` fixtures need `archivedAt` once the `Team` interface gains it)
- [x] Rewrite `src/app/page.test.tsx` for the signed-out / member / owner branches, mocking
      `@/lib/session`, `@/lib/teams`, and `process.env.OWNER_EMAIL`; assert the signed-out
      branch performs no team query
- [x] Add smoke tests for the three new pages, following the "importable, exports a
      function" pattern in `src/app/page.test.tsx`

## Pre-Commit Gate

Per `AGENTS.md`'s `## Commands` section:

- [x] `pnpm lint` ✅
- [x] `pnpm typecheck` ✅
- [x] `pnpm test` ✅ — 125 tests, 14 files
- [x] `pnpm build` ✅ — route table confirms `/` is now dynamic (`ƒ`, Decision 1's accepted
      trade), `/t/new` and `/t/[teamId]` resolve as distinct routes with no collision, and
      `/_not-found` compiles as its own route
- [x] Manual verification, **partial** — the configured `DATABASE_URL` (Neon) was not
      reachable from this session (`P1001`, confirmed via `prisma migrate status`), so the
      authenticated, database-backed round trip (sign in, create/edit/archive/unarchive a
      team) could **not** be executed here. What was verified live against `pnpm dev`:
  - `GET /` with no session cookie → `200`, renders the signed-out CTA, and triggers
    **no database query at all** (confirmed no query attempted in the dev server log,
    and the response was fast on a second hit) — Auth.js's `auth()` returns `null` on a
    missing session cookie without touching the adapter, so Decision 1 does not add a
    hard database dependency to the site's front door for anonymous visitors
  - `GET /t/new` and `GET /t/<fake-id>` with no session cookie → both `307` to
    `/signin?callbackUrl=…`, confirming the proxy's `/t/:path*` matcher covers the new
    static route the same as the dynamic one
  - A first attempt without `EMAIL_FROM`/`RESEND_API_KEY` set 500'd `/` even for a
    signed-out visitor, because `getCurrentUser()` now runs unconditionally on `/` and
    `auth()`'s lazy config evaluates the full provider setup (including the Resend
    provider's `requireEnv` calls) on every call, not just ones that end up sending mail.
    This is pre-existing behavior from #2's fail-fast design, newly exposed on `/`
    because `/` never called `getCurrentUser()` before. Not fixed here — a correctly
    configured deployment already requires these vars for `/signin` and `/t/*` to work
    at all, so this is a dev-environment-only gap, not a production regression — but
    worth a maintainer's awareness if `/` 500s locally
  - The authenticated flow (owner sign-in, `/t/new` submission, settings edit,
    archive/unarchive, and the Decision 6 client-side-navigation check) still needs a
    human — or a session with real database access — to run before merge

## Files Modified / Created

| File | Change |
|---|---|
| `src/lib/team-access.ts` | Add `requireTeamAccess` + `cache()`d `loadTeamAccessFacts`; `checkTeamAccess` untouched |
| `src/lib/session.ts` | Wrap `getCurrentUser` in `cache()` — now called several times per render |
| `src/lib/team-access.test.ts` | Add `requireTeamAccess` suite |
| `src/lib/teams.ts` | Replace `getPublicTeams`/`getUserTeams` with `getAllTeams`, `getMemberTeams`, `getTeamById`, `createTeam`, `updateTeam`, `archiveTeam`, `unarchiveTeam` |
| `src/lib/teams.test.ts` | Rewrite for the new function set |
| `src/app/t/[teamId]/layout.tsx` | New — chrome + switcher + fail-fast check |
| `src/app/not-found.tsx` | New — root-level 404 boundary (not nested — see corrections) |
| `src/app/t/[teamId]/page.tsx` | New — team home, checks access itself |
| `src/app/t/[teamId]/settings/page.tsx` | New — edit + archive/unarchive |
| `src/app/t/[teamId]/settings/actions.ts` | New — three actions, each gated and revalidating |
| `src/app/t/new/page.tsx` | New — owner-gated creation form |
| `src/app/t/new/actions.ts` | New — `createTeamAction`, re-checks ownership |
| `src/components/TeamSwitcher.tsx` | New — switcher for team-page chrome |
| `src/app/page.tsx` | Rewrite — auth-gated, no anonymous team data |
| `src/app/page.test.tsx` | Rewrite for signed-out / member / owner branches |
| `src/components/TeamCard.tsx` | Add archived badge |
| `src/components/TeamCard.test.tsx` | Add archived case |
| `src/components/TeamSelector.tsx` | Add "Archived Teams" section |
| `src/components/TeamSelector.test.tsx` | Add archived section case |
