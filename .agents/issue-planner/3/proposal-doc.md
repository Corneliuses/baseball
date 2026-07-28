# Proposal — Phase 3: Teams, `/t/[teamId]` scoping, and `requireTeamAccess` (#3)

## Executive Summary

This issue stands up the authorization boundary every scoped route in the app will call
first — `requireTeamAccess` — and the team lifecycle around it: owner-only creation, a
switcher, and settings (edit + archive/unarchive). It also closes a gap left by #1: the
landing page currently shows every team's name and season to any anonymous visitor,
which directly contradicts this issue's own requirement that non-owners see only teams
they belong to. That gets fixed here rather than shipped and revisited later.

The approach keeps `checkTeamAccess` (the pure, already-tested role/archived decision)
completely untouched and adds a thin `requireTeamAccess` wrapper beside it that resolves
the caller's session and membership in a single query. The one subtlety worth flagging
up front: unarchiving a team cannot go through the ordinary `intent: "write"` check,
because that check unconditionally rejects every write to an archived team — including
the one write whose entire purpose is leaving that state. The fix is a one-line,
explicitly-documented exception at that single call site rather than any change to the
shared decision function (full rationale in design-doc.md, Decision 3).

## Scope

### In Scope
- `requireTeamAccess(teamId, { intent, minRole })` in `src/lib/team-access.ts`
- `src/lib/teams.ts` as the data module for all team queries and writes
- `/t/[teamId]/` layout, team home page, and settings page (edit + archive/unarchive)
- `/t/new` owner-only team creation
- Team switcher: owner sees every team, everyone else sees only their own memberships,
  archived teams shown separately
- Reworking `/` so it no longer exposes team data to signed-out visitors

### Out of Scope
- Roster, jersey numbers, guardians, invitations UI (#4)
- Schedule / events (#6)
- Any actual authorization *decision* changes to `checkTeamAccess` — it is load-bearing
  and already correct per its own tests
- A dedicated "access denied" page distinct from Next's default 404 (the layout uses
  `notFound()`; a nicer boundary can follow later if wanted)

## Acceptance Criteria

1. `requireTeamAccess(teamId, { intent, minRole })` exists in `src/lib/team-access.ts`,
   resolves the caller's session and `Membership`, loads `archivedAt`, and delegates to
   the unmodified `checkTeamAccess`
2. `/t/[teamId]/` route group and layout exist; the layout calls `requireTeamAccess`
   (`intent: "read"`) before rendering
3. Team creation at `/t/new` is restricted to `OWNER_EMAIL` and grants the creator
   `Membership(OWNER)` on the new team
4. Team settings supports editing `name`, `season`, and `allPlay`
5. The switcher shows the owner every team; everyone else sees only teams they hold a
   `Membership` on
6. Archive / unarchive sets and clears `Team.archivedAt`
7. `src/lib/teams.ts` is the data module for all team-scoped queries
8. Tests cover `requireTeamAccess`'s role and archived rejection paths
9. `/` shows no team names or seasons to a signed-out visitor, and a signed-in non-owner
   never sees a team they don't belong to
10. Archived teams appear in the switcher in a separate, labeled section rather than
    being hidden
11. Editing team settings and archiving/unarchiving both require `minRole: OWNER`
12. `pnpm check` passes
13. `pnpm build` succeeds

## Implementation Phases

| Phase | Description | Areas Affected |
|---|---|---|
| 1 | Authorization — `requireTeamAccess` + tests | `src/lib/team-access.ts` |
| 2 | Data layer — `src/lib/teams.ts` CRUD + queries | `src/lib/teams.ts` |
| 3 | Routes & UI — layout, team/settings/new pages, switcher rework | `src/app/t/`, `src/app/page.tsx`, `src/components/` |

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Unarchive implemented naively with `intent: "write"`, silently never works | High | Decision 3 in design-doc.md; explicit inline comment at the call site |
| Landing page continuing to leak team data to anonymous visitors | High | Landing page rewritten to gate on `getCurrentUser()` before any team query |
| A non-member learning whether a guessed `teamId` exists | Med | Every `TeamAccessError` reason turns into a uniform `notFound()` in the layout |
| `/t/new` reachable by a signed-in non-owner | Med | Direct `isOwnerEmail` check in both the page and the action (never trust the page-level gate alone) |
| Static `/t/new` route colliding with dynamic `/t/[teamId]` | Low | Next.js resolves the static segment first; verified against a running server, not assumed |

## Effort Estimate

**Overall:** Medium (3–4 days)

| Phase | Estimate |
|---|---|
| Phase 1 — Authorization | 0.5 day |
| Phase 2 — Data layer | 0.5–1 day |
| Phase 3 — Routes & UI | 2 days |

## Next Steps

1. Review and approve this proposal.
2. Follow `task-doc.md` to implement phase by phase.
3. After implementation, finalize with the `finalize-issue` skill (verify AC against the
   PR, archive `.agents/issue-planner/3/`, merge, and close the issue).
