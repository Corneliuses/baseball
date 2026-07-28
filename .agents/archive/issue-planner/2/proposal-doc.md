# Proposal — Phase 2: Auth — magic link, session, proxy, and owner bootstrap (#2)

## Executive Summary

This issue gives the app an identity: Auth.js v5 with the Prisma adapter and Resend magic
links, gated by the `Invitation` table so no self-serve signup path exists anywhere.
`OWNER_EMAIL` names the single global owner, who can always sign in and who will be the
only account permitted to create teams (enforced in #3). Every table this needs already
exists and is migrated, and every package is already installed — the work is wiring,
decisions, and the pure functions that hold them.

The approach keeps `src/auth.ts` thin and pushes every assertable decision into pure,
database-free modules, matching how `readiness.ts` and `team-access.ts` are already built:
`isOwnerEmail` and `decideSignIn` are exhaustively unit-tested, while the Auth.js config
merely calls them. Two things fall out of that shape. Rejection happens on the
*verification-request* call of the `signIn` callback, so an uninvited address never
receives mail at all rather than receiving a link that fails later. And the proxy stays
what the architecture note demands — a cookie read and a redirect, importing nothing from
`src/auth.ts`, because pulling Prisma into a bundle that runs on every prefetch is the
exact failure the "optimistic-only" rule exists to prevent.

## Scope

### In Scope

- `src/auth.ts` — Auth.js v5 config: Prisma adapter, Resend provider, database sessions
- Catch-all route handler at `src/app/api/auth/[...nextauth]/route.ts`
- Invitation-gated `signIn` callback, with `OWNER_EMAIL` as the sole exception
- Invitation consumption on first successful sign-in — `acceptedAt` plus a `Membership`
  upsert that never modifies an existing membership
- `src/proxy.ts` — cookie-presence redirect for `/t/:path*`
- Sign-in page and a confirmation page that is identical for invited and uninvited addresses
- `getCurrentUser()` — the single seam through which identity is resolved
- Pure modules `src/lib/owner.ts` and `src/lib/signin-gate.ts` with co-located tests
- `OWNER_EMAIL` documented in `.env.example`

### Out of Scope

- **`requireTeamAccess`, `/t/[teamId]` routing, and team creation** — #3. This issue
  establishes *who may sign in*; that one establishes *what they may touch*
- **Sending invitation emails and any invite-management UI** — a coach-facing feature; the
  gate here reads `Invitation` rows, it does not create them
- **A branded React Email template** — the Auth.js default HTML is used; a branded
  template lands with team messaging (decided during planning)
- **Sign-out UI, header auth state, "sign out everywhere"** — presentational follow-ups
- **The service worker and push subscriptions** — Decision 8 defers push post-MVP. The
  cookie configuration and caching constraints it will need are recorded in the design
  doc so that issue inherits them
- **An MCP token model for v2 AI agent integration** — no schema change here; the
  `getCurrentUser()` seam and pure authorization functions are what keep it cheap later
- **Schema changes or migrations** — none are required

## Acceptance Criteria

1. `src/auth.ts` exports the Auth.js v5 config using `@auth/prisma-adapter` over the
   shared client in `src/lib/db.ts`
2. Resend provider configured with an explicit `apiKey` and `from` from `EMAIL_FROM`;
   startup fails loudly if either is missing
3. Catch-all route handler at `src/app/api/auth/[...nextauth]/route.ts`
4. The `signIn` callback rejects any address holding neither an unexpired `Invitation` nor
   an existing `Membership`, with `OWNER_EMAIL` as the sole exception
5. Session `maxAge` of 90 days, sliding, so parents are not re-authenticating on a phone
   at a ballfield
6. Proxy exports `proxy(request: NextRequest)` with `config.matcher = "/t/:path*"`, reads
   only the session cookie, and imports nothing from `src/auth.ts`
7. Pure `src/lib/owner.ts` exports `isOwnerEmail(email, ownerEmail)` with co-located tests
   covering case-insensitivity and the unset-env case
8. Sign-in page at `src/app/signin/`
9. `OWNER_EMAIL` documented in `.env.example`, with the `!.env.example` negation intact
10. First successful sign-in from an invitation sets `acceptedAt` and upserts
    `Membership(user, team, invitation.role)`, never modifying an existing membership
11. The sign-in form's response is identical for invited and uninvited addresses, and no
    email is sent to an uninvited address
12. Identity is resolved in exactly one place, `getCurrentUser()`; cookie options stay at
    the Auth.js defaults (`httpOnly`, `sameSite: "lax"`)
13. `pnpm check` passes
14. `pnpm build` succeeds

## Implementation Phases

| Phase | Description | Areas Affected |
|---|---|---|
| 1 | Pure domain modules — `isOwnerEmail`, `decideSignIn`, exhaustive tests | `src/lib/` |
| 2 | Auth wiring — `src/auth.ts`, route handler, invitation acceptance, `getCurrentUser`, `src/proxy.ts` | `src/`, `src/lib/`, `src/app/api/auth/` |
| 3 | Sign-in UI and `.env.example` | `src/app/signin/`, `.env.example` |
| 4 | Verification — automated gate plus a manual magic-link round trip | — |

Phases 1 and 2 are ordered by dependency: the config calls the pure functions. Phase 3 is
separable and could be reviewed independently. Phase 4 is not optional — a misplaced proxy
file and a wrong `from` address both fail silently, and only a live round trip catches them.

## Key Decisions

Full rationale in `design-doc.md`; the three worth surfacing:

- **The issue says `proxy.ts` goes at the project root. It does not — it goes at
  `src/proxy.ts`.** The convention is "project root, or inside `src` if applicable, so
  that it is located at the same level as `pages` or `app`"
  (`next/dist/docs/.../proxy.md:23`); this project's router is `src/app`. A root
  `proxy.ts` would never run and would fail silently, leaving `/t/*` rendering for
  signed-out visitors.
- **Database sessions, not JWT** — the `Session` table is already migrated, revocation
  actually matters in an invite-only app with 90-day sessions, and the proxy never decodes
  the cookie so the usual edge-middleware argument for JWT does not apply. This is also
  the better substrate for the planned v2 MCP server: an MCP client carries no browser
  cookie under any strategy, and database sessions let an agent's access be revoked from
  the same Postgres it already queries.
- **Uninvited addresses get the same page and no email** — the sign-in form is the only
  unauthenticated POST surface in the app, and an explicit rejection would turn it into a
  way to test which families are on a team.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `proxy.ts` at the repo root — never runs, no error | High | `src/proxy.ts`; Phase 4 smoke test with a real unauthenticated request |
| `EMAIL_FROM` unset → mail sent from `authjs.dev` and filtered as spam | High | Fail-fast module-scope assertion; Phase 4 confirms the actual sender |
| Sign-in form used to enumerate team families | Med | Identical response, no send, no timing-revealing branch before the gate |
| Invitation acceptance re-roling an existing member | Med | `upsert` with an empty `update`; only unexpired, unaccepted invitations selected |
| Cookie `sameSite` "hardened" to `strict`, silently breaking magic links from email clients | Med | No `cookies` block; defaults documented as load-bearing |
| Auth.js beta churn (`5.0.0-beta.32`) | Med | Version pinned exactly; not widened in this issue |
| A future service worker caching the `/t/*` → `/signin` redirect | Med | Network-only constraint for `/t/*` and `/api/auth/*` recorded now for the SW issue |
| `OWNER_EMAIL` unset in a deployment | Low | `isOwnerEmail` returns `false` — fails closed, invited users unaffected; documented in `.env.example` |
| DB unavailable during the gate | Low | Callback catches and returns `false` — fails closed |

## Effort Estimate

**Overall:** Medium (3–4 days)

| Phase | Estimate |
|---|---|
| Phase 1 — pure modules and tests | 0.5 day |
| Phase 2 — auth wiring, invitation acceptance, proxy | 1.5 days |
| Phase 3 — sign-in UI and env docs | 0.5–1 day |
| Phase 4 — verification, live round trip, review cycles | 0.5–1 day |

The estimate is dominated by Phase 4 rather than Phase 2: the code is small, but the first
real magic-link round trip needs a Neon dev branch and a verified Resend sender domain,
and domain verification is the step most likely to consume an unplanned afternoon.

## Next Steps

1. Review and approve this proposal.
2. Follow `task-doc.md` phase by phase.
3. After implementation, finalize with the `finalize-issue` skill (verify AC against the
   PR, archive `.agents/issue-planner/2/`, merge, and close the issue).
