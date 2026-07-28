# Task Doc — Phase 3: Teams, `/t/[teamId]` scoping, and `requireTeamAccess` (#3)

## Prerequisites

- [x] #1 (App shell) merged — `PageContainer`, `Button`, `Card`, `TeamCard`, `TeamSelector`
      already exist
- [x] #2 (Auth) merged — `getCurrentUser()`, `isOwnerEmail()`, `OWNER_EMAIL` all in place

## Phase 1: Authorization — `requireTeamAccess`

- [ ] Add `requireTeamAccess(teamId: string, { intent, minRole }): Promise<{ role: Role;
      userId: string }>` to `src/lib/team-access.ts`, below the existing pure
      `checkTeamAccess`. It must:
  - Call `getCurrentUser()` (`src/lib/session.ts`); if `null`, throw
    `TeamAccessError("Not signed in", "no-membership")`
  - Run a single `db.team.findUnique({ where: { id: teamId }, select: { archivedAt: true,
    memberships: { where: { userId }, select: { role: true } } } })`
  - If the team is `null`, throw `TeamAccessError("Team not found", "no-membership")`
  - Otherwise call the existing `checkTeamAccess({ role: team.memberships[0]?.role ??
    null, archivedAt: team.archivedAt, intent, minRole })` and return `{ role, userId }`
  - **Do not modify `checkTeamAccess` itself** — see design-doc.md Decision 3 for why
    unarchiving must not route through `intent: "write"`
- [ ] Write `requireTeamAccess` tests in `src/lib/team-access.test.ts`, mocking `./db`
      and `./session` (follow the `vi.mock("./db", ...)` pattern in
      `src/lib/invitations.test.ts`): no session → `no-membership`; team not found →
      `no-membership`; no membership row → `no-membership`; role below `minRole` →
      `insufficient-role`; `intent: "write"` on an archived team → `archived`; success
      path returns `{ role, userId }`; confirm exactly one `db.team.findUnique` call

## Phase 2: Data layer — `src/lib/teams.ts`

- [ ] Replace `getPublicTeams` with `getAllTeams()` — every team, any archived state,
      ordered `createdAt: "desc"` (matches the existing ordering)
- [ ] Add `getMemberTeams(userId: string)` — every team with a `Membership` for `userId`,
      any archived state (drop the existing `archivedAt: null` filter from
      `getUserTeams` — archived teams must appear so they can render in the switcher's
      "Archived" section per AC10)
- [ ] Add `getTeamById(teamId: string): Promise<Team | null>` for the layout, team page,
      and settings page
- [ ] Extend the `Team` interface with `archivedAt: Date | null`
- [ ] Add `createTeam(input: { name: string; season: string | null; allPlay: boolean },
      ownerId: string): Promise<Team>` — `db.$transaction` inserting `Team` and
      `Membership(ownerId, team.id, "OWNER")`
- [ ] Add `updateTeam(teamId: string, input: { name: string; season: string | null;
      allPlay: boolean }): Promise<Team>`
- [ ] Add `archiveTeam(teamId: string, now?: Date): Promise<Team>` — sets `archivedAt`
- [ ] Add `unarchiveTeam(teamId: string): Promise<Team>` — clears `archivedAt`
- [ ] Update `src/lib/teams.test.ts`: remove the `getPublicTeams` test, add coverage for
      every new function following the mocked-`db` pattern already in that file and in
      `invitations.test.ts`

## Phase 3: Routes & UI

- [ ] Create `src/app/t/[teamId]/layout.tsx` — call `requireTeamAccess(teamId, { intent:
      "read" })`; on `TeamAccessError` call `notFound()` (design-doc.md Decision 6); on
      success render team chrome (reuse `PageContainer` or a thin wrapper) around
      `children`
- [ ] Create `src/app/t/[teamId]/page.tsx` — team home: name, season, `allPlay` status;
      a link to `/t/[teamId]/settings` shown only when the caller's role (returned by
      `requireTeamAccess`) is `OWNER`
- [ ] Create `src/app/t/[teamId]/settings/page.tsx` — call
      `requireTeamAccess(teamId, { intent: "read", minRole: "OWNER" })` to gate the page
      itself; render an edit form (name/season/allPlay) and an archive/unarchive button
      based on `getTeamById`'s `archivedAt`
- [ ] Create `src/app/t/[teamId]/settings/actions.ts`:
  - `updateTeamAction` — `requireTeamAccess(teamId, { intent: "write", minRole: "OWNER"
    })`, Zod-validate `{ name: z.string().min(1), season: z.string().optional(), allPlay:
    z.boolean() }`, call `updateTeam`
  - `archiveTeamAction` — `requireTeamAccess(teamId, { intent: "write", minRole: "OWNER"
    })`, call `archiveTeam`
  - `unarchiveTeamAction` — `requireTeamAccess(teamId, { intent: "read", minRole: "OWNER"
    })` (**not** `"write"` — design-doc.md Decision 3), call `unarchiveTeam`
- [ ] Create `src/app/t/new/page.tsx` — check `getCurrentUser()` +
      `isOwnerEmail(user.email, process.env.OWNER_EMAIL)` directly (no `teamId` exists
      yet); `notFound()` if not the owner; otherwise render a creation form matching the
      `Card` + hand-styled-`<input>` pattern in `src/app/signin/page.tsx`
- [ ] Create `src/app/t/new/actions.ts` — `createTeamAction`: re-check `isOwnerEmail`
      (never trust the page-level gate alone), Zod-validate, call `createTeam`, then
      `redirect` to `/t/[newTeamId]`
- [ ] Rewrite `src/app/page.tsx`: signed-out (`getCurrentUser()` is `null`) renders the
      existing welcome copy with a sign-in call to action and **no team query**;
      signed-in calls `getMemberTeams(user.id)` always, and additionally `getAllTeams()`
      when `isOwnerEmail(user.email, process.env.OWNER_EMAIL)` is true, passing
      `teams`/`userTeamIds` to `TeamSelector`; show a "Create a team" link to `/t/new`
      only for the owner
- [ ] Update `src/app/page.test.tsx` for the new signed-out/signed-in branches, mocking
      `@/lib/session`, `@/lib/teams`, and `process.env.OWNER_EMAIL`
- [ ] Extend `src/components/TeamCard.tsx`: accept `archivedAt: Date | null`; render an
      "Archived" badge when non-null; keep it clickable/linkable either way (archived
      teams are viewable, just read-only)
- [ ] Extend `src/components/TeamSelector.tsx`: split `teams` into active and archived
      before the existing My-Teams/All-Teams grouping; render a third "Archived Teams"
      section beneath the existing two when any archived team is present
- [ ] Update `TeamCard.test.tsx` and `TeamSelector.test.tsx` for the archived cases
- [ ] Add smoke tests for the three new pages (`t/new/page.test.tsx`,
      `t/[teamId]/page.test.tsx`, `t/[teamId]/settings/page.test.tsx`) following the
      "importable, exports a function" pattern in `src/app/page.test.tsx` /
      `src/app/signin/page.test.tsx`

## Pre-Commit Gate

Per `AGENTS.md`'s `## Commands` section:

- [ ] `pnpm lint` ✅
- [ ] `pnpm typecheck` ✅ — run `pnpm db:generate` first if `src/generated/prisma` is
      missing (gitignored; a fresh checkout won't typecheck without it)
- [ ] `pnpm test` ✅
- [ ] `pnpm build` ✅
- [ ] Manual verification against a running server (`pnpm dev`, with a real
      `DATABASE_URL`): sign in as `OWNER_EMAIL`, create a team at `/t/new`, confirm
      redirect to `/t/[id]`, edit it at `/t/[id]/settings`, archive it, confirm a write
      (e.g. re-submitting the edit form) is rejected, unarchive it, confirm a
      non-member's request to that `teamId` 404s

## Files Modified / Created

| File | Change |
|---|---|
| `src/lib/team-access.ts` | Add `requireTeamAccess`; `checkTeamAccess` untouched |
| `src/lib/team-access.test.ts` | Add `requireTeamAccess` test suite |
| `src/lib/teams.ts` | Replace `getPublicTeams`/`getUserTeams` with `getAllTeams`, `getMemberTeams`, `getTeamById`, `createTeam`, `updateTeam`, `archiveTeam`, `unarchiveTeam` |
| `src/lib/teams.test.ts` | Rewrite for the new function set |
| `src/app/t/[teamId]/layout.tsx` | New — `requireTeamAccess` gate + chrome |
| `src/app/t/[teamId]/page.tsx` | New — team home shell |
| `src/app/t/[teamId]/settings/page.tsx` | New — edit + archive/unarchive |
| `src/app/t/[teamId]/settings/actions.ts` | New — `updateTeamAction`, `archiveTeamAction`, `unarchiveTeamAction` |
| `src/app/t/new/page.tsx` | New — owner-gated creation form |
| `src/app/t/new/actions.ts` | New — `createTeamAction` |
| `src/app/page.tsx` | Rewrite — auth-gated switcher, no anonymous team data |
| `src/app/page.test.tsx` | Rewrite for signed-out/signed-in/owner branches |
| `src/components/TeamCard.tsx` | Add archived badge |
| `src/components/TeamCard.test.tsx` | Add archived case |
| `src/components/TeamSelector.tsx` | Add "Archived Teams" section |
| `src/components/TeamSelector.test.tsx` | Add archived section case |
