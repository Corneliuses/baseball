# Proposal — Phase 3: Teams, `/t/[teamId]` scoping, and `requireTeamAccess` (#3)

## Executive Summary

This issue stands up the authorization boundary every scoped route in the app will call
first — `requireTeamAccess` — and the team lifecycle around it: owner-only creation, a
switcher, and settings (edit + archive/unarchive). It also closes a gap left by #1: the
landing page currently shows every team's name and season to any anonymous visitor, which
directly contradicts this issue's own requirement that non-owners see only teams they
belong to. That gets fixed here rather than shipped and revisited later.

The approach leaves `checkTeamAccess` — the pure, already-tested role/archived decision —
completely untouched, and adds a thin `requireTeamAccess` wrapper beside it that resolves
the caller's session and membership in a single query, deduped per request with React
`cache()`. Three non-obvious constraints shape the design, each verified against the
installed packages rather than assumed:

1. **A layout is not an authorization boundary.** Next's own docs state that layouts don't
   re-render on client-side navigation, so a check living only there is evaluated once and
   then trusted. Every page loader beneath `/t/[teamId]` checks independently; the layout
   check is kept for fail-fast and chrome.
2. **Unarchiving cannot use the ordinary write check**, because that check unconditionally
   rejects every write to an archived team — including the one write whose purpose is
   leaving that state. It routes around it at a single documented call site rather than
   changing the shared decision function.
3. **Team creation is a nested write, not a `$transaction`.** The array-form transaction
   already in this repo cannot reference the not-yet-created team's ID, so copying that
   precedent would not work.

## Scope

### In Scope
- `requireTeamAccess(teamId, { intent, minRole })` in `src/lib/team-access.ts`
- `src/lib/teams.ts` as the data module for all team queries and writes
- `/t/[teamId]/` layout, team home, and settings (edit + archive/unarchive)
- `/t/new` owner-only team creation
- Team switcher — owner sees every team, everyone else only their memberships, archived
  teams in their own section — reachable from `/` and from inside a team
- Reworking `/` so it no longer exposes team data to signed-out visitors

### Out of Scope
- Roster, jersey numbers, guardians, invitations UI (#4)
- Schedule / events (#6)
- Any change to `checkTeamAccess`'s decision logic — it is load-bearing and already correct
- Per-field form error state (`useActionState`); this issue follows the existing
  redirect-with-error-param pattern from the sign-in flow

## Acceptance Criteria

1. `requireTeamAccess(teamId, { intent, minRole })` exists in `src/lib/team-access.ts`,
   resolves the caller's session and `Membership`, loads `archivedAt`, delegates to the
   unmodified `checkTeamAccess`; its underlying query is wrapped in React `cache()`, keyed
   on `(teamId, userId)`, so the repeated per-request checks share one round trip
2. The `/t/[teamId]/` layout **and every page loader beneath it** call `requireTeamAccess`
3. Team creation at `/t/new` is restricted to `OWNER_EMAIL` and grants the creator
   `Membership(OWNER)` on the new team in a single atomic write
4. Team settings supports editing `name`, `season`, and `allPlay`
5. The switcher shows the owner every team and everyone else only teams they hold a
   `Membership` on, and is reachable from inside a team as well as from `/`
6. Archive / unarchive sets and clears `Team.archivedAt`
7. `src/lib/teams.ts` is the data module for all team-scoped queries
8. Tests cover `requireTeamAccess`'s role and archived rejection paths
9. `/` shows no team names or seasons to a signed-out visitor, and a signed-in non-owner
   never sees a team they don't belong to
10. Archived teams appear in the switcher in a separate, labeled section
11. Editing team settings and archiving/unarchiving both require `minRole: OWNER`
12. Every mutation calls `revalidatePath`, so a saved change is visible on return
13. `pnpm check` passes
14. `pnpm build` succeeds

## Implementation Phases

| Phase | Description | Areas Affected |
|---|---|---|
| 1 | Authorization — `cache()`-wrapped `requireTeamAccess` + tests | `src/lib/team-access.ts` |
| 2 | Data layer — `src/lib/teams.ts` queries and writes | `src/lib/teams.ts` |
| 3 | Routes & UI — layout, team/settings/new pages, switcher, landing rework | `src/app/t/`, `src/app/page.tsx`, `src/components/` |

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Authorization checked only in the layout, silently skipped on client-side navigation | High | Every page loader checks independently; stated as the rule #4 and #6 inherit |
| `createTeam` copied from the repo's existing array `$transaction` and failing on the missing `team.id` | High | Nested `team.create` with `memberships.create`, verified against the generated client |
| Unarchive implemented with the ordinary write check, making it permanently unreachable | High | `intent: "read"` at that one call site, with an inline comment explaining why |
| Mutations appearing to do nothing because the route serves cached output | High | `revalidatePath` in every action |
| Landing page continuing to leak team data to anonymous visitors | High | Rewritten to gate on `getCurrentUser()` before any team query |
| A blanket `catch` turning a database outage into a 404 that reads as a permission denial | Med | Catch `instanceof TeamAccessError` only; a DB error propagates and fails closed |
| A non-member learning whether a guessed `teamId` exists | Med | Uniform `notFound()` for every failure reason |
| `/t/new` reachable by a signed-in non-owner | Med | Ownership checked in the page *and* re-checked in the action |

## Effort Estimate

**Overall:** Medium (4–5 days)

| Phase | Estimate |
|---|---|
| Phase 1 — Authorization | 0.5–1 day |
| Phase 2 — Data layer | 1 day |
| Phase 3 — Routes & UI | 2.5–3 days |

Phase 3 covers five new routes, two server-action files, a switcher component, the landing
rewrite, two component changes, and roughly six test files.

## Next Steps

1. Review and approve this proposal.
2. Follow `task-doc.md` to implement phase by phase.
3. After implementation, finalize with the `finalize-issue` skill (verify AC against the
   PR, archive `.agents/issue-planner/3/`, merge, and close the issue).

---

*This plan was revised after an audit against the installed packages. Its framework claims
are checked against `node_modules/next/dist/docs/` and the generated Prisma 7.9 client
rather than assumed — see the "Verified against the installed packages" table in
`design-doc.md`.*
