# Design Doc — Phase 2: Auth — magic link, session, proxy, and owner bootstrap (#2)

## Overview

Wire Auth.js v5 (magic link via Resend, Prisma adapter) so that authentication exists at
all, and gate it on the `Invitation` table so there is no self-serve signup path anywhere.
`OWNER_EMAIL` names the single global owner who can always sign in and who — in #3 — is
the only account allowed to create teams. Nothing in the app is truly private until this
lands, and #3 (`/t/[teamId]` scoping, `requireTeamAccess`) is blocked on it.

## Acceptance Criteria

From the issue, plus clarifications agreed during planning (marked ✚).

- [ ] AC1 — `src/auth.ts` exports the Auth.js v5 config using `@auth/prisma-adapter` over
      the shared client in `src/lib/db.ts`
- [ ] AC2 — Resend provider configured with an explicit `apiKey` and `from` set from
      `EMAIL_FROM`; startup fails loudly if either is missing
- [ ] AC3 — Catch-all route handler at `src/app/api/auth/[...nextauth]/route.ts`
- [ ] AC4 — `signIn` callback rejects any address holding neither an unexpired
      `Invitation` nor an existing `Membership`, with `OWNER_EMAIL` as the sole exception
- [ ] AC5 — Long session `maxAge` (90 days, sliding) so parents are not re-authenticating
      on a phone at a ballfield
- [ ] AC6 — Proxy with `export function proxy(request: NextRequest)` and
      `config.matcher = "/t/:path*"` — cookie read and redirect only, no database access
- [ ] AC7 — Pure `src/lib/owner.ts` exporting `isOwnerEmail(email, ownerEmail)` with
      co-located tests covering case-insensitivity and the unset-env case
- [ ] AC8 — Sign-in page at `src/app/signin/`
- [ ] AC9 — `OWNER_EMAIL` documented in `.env.example` alongside the existing variables
- [ ] AC10 ✚ — First successful sign-in from an invitation marks `acceptedAt` and upserts
      `Membership(user, team, invitation.role)`, never modifying an existing membership
- [ ] AC11 ✚ — The sign-in form's response is identical for invited and uninvited
      addresses; no email is sent to an uninvited address
- [ ] AC12 ✚ — Identity is resolved in exactly one place, `getCurrentUser()` in
      `src/lib/session.ts`; cookie options stay at the Auth.js defaults (`httpOnly`,
      `sameSite: "lax"`) so magic links and a future service worker both keep working
- [ ] AC13 — `pnpm check` (lint → typecheck → test) passes
- [ ] AC14 — `pnpm build` succeeds

## Architecture & Data Model

### Data Layer

**No schema change and no migration.** `User`, `Account`, `Session`, `VerificationToken`,
`Invitation`, and `Membership` all exist in `prisma/schema.prisma` and are all present in
`prisma/migrations/20260728053521_001/migration.sql` (verified — all fourteen tables are
in that migration). `OWNER_EMAIL` is an environment variable precisely so that "who owns
this instance" needs no column.

Two queries and one write are introduced:

| Operation | Table(s) | When |
|---|---|---|
| Load sign-in context for an email | `Invitation`, `Membership` (via `User`) | `signIn` callback, once per magic-link request |
| Accept invitations for a user | `Invitation` (update), `Membership` (upsert) | `events.signIn`, after a successful link click |
| Read session user | `Session`, `User` (by the adapter) | Every authenticated request |

### API / Service Layer

| Module / Function | Type | Auth | Purpose |
|---|---|---|---|
| `src/auth.ts` → `{ handlers, auth, signIn, signOut }` | Auth.js config | — | The whole auth surface |
| `src/app/api/auth/[...nextauth]/route.ts` | Route Handler | Public | `export const { GET, POST } = handlers` |
| `isOwnerEmail(email, ownerEmail)` | Pure | — | Case-insensitive owner comparison |
| `decideSignIn(input)` | Pure | — | Allow/deny decision with a reason |
| `loadSignInContext(email)` | DB read | — | Pending invitations + membership existence for an address |
| `acceptInvitations(userId, email, now)` | DB write | — | Mark `acceptedAt`, upsert `Membership` |
| `getCurrentUser()` | DB read via `auth()` | Authenticated | One place the app asks "who is calling" |
| `requestSignInLink(formData)` | Server Action | Public | Sign-in form submit |
| `proxy(request)` | Proxy | — | Cookie-presence redirect for `/t/:path*` |

### Module tree

```
src/auth.ts                       NextAuth({ adapter, providers, session, pages, callbacks, events })
├── src/lib/db.ts                 (existing) shared Prisma client
├── src/lib/owner.ts              PURE  isOwnerEmail
├── src/lib/signin-gate.ts        PURE  decideSignIn
└── src/lib/invitations.ts        DB    loadSignInContext, acceptInvitations

src/lib/session.ts                getCurrentUser() — thin wrapper over auth()
src/app/api/auth/[...nextauth]/route.ts
src/app/signin/page.tsx           form → requestSignInLink server action
src/app/signin/actions.ts         requestSignInLink
src/app/signin/check-email/page.tsx
src/proxy.ts                      cookie read + redirect, matcher /t/:path*
```

The pure/impure split follows the existing `readiness.ts` and `team-access.ts` pattern:
the decision is a pure function tested exhaustively without a database, and the loader is
a thin wrapper around it.

## Key Decisions

### Decision 1: Reject at the verification-request step, not after the click

**Options considered:**
- Option A: Let Auth.js send the link, then reject in the `signIn` callback when the user
  clicks it.
- Option B: Reject inside the same `signIn` callback on its *first* invocation, which for
  the email provider carries `email.verificationRequest === true` — before any mail is sent.

**Decision:** Option B (which also covers the click, since the callback runs again then).

**Rationale:** Verified against the installed types
(`node_modules/next-auth/index.d.ts:177-197`): the `signIn` callback receives
`email?: { verificationRequest?: boolean }`, true on the send path only. Rejecting there
means an uninvited address never receives mail — the app cannot be turned into a mailer,
and there is no half-created state. The callback runs a second time on the click, so the
same gate covers a link that was valid when sent and whose invitation expired before it
was used.

### Decision 2: Database sessions

**Options considered:**
- Option A: `strategy: "database"` — the Prisma adapter's default; a `Session` row per login.
- Option B: `strategy: "jwt"` — no session read per request, decodable at the edge.

**Decision:** Option A, `maxAge: 90 days`, `updateAge: 24 hours`.

**Rationale:** The `Session` table already exists and is migrated, and with a 90-day
window revocation matters: an invite-only app where removing someone does not actually
kick them is a broken promise. `proxy.ts` only checks whether the cookie is *present* —
it never decodes it — so the usual "JWT for edge middleware" argument does not apply
here. The extra `Session` read per request is one indexed primary-key lookup against a
database this app already hits on every scoped page.

#### Compatibility with the planned MCP server and the PWA service worker

Both were raised during planning as things the auth strategy must not paint into a corner.
Neither changes the choice — database sessions are the better fit for both — but each
imposes constraints that are free to honor now and expensive to retrofit.

**MCP server (v2, AI agent integration).** An MCP server never carries a browser cookie
under *any* session strategy: it is not a browser, it has no cookie jar, and it is not
subject to the same-origin rules the cookie relies on. It authenticates out of band with a
token that maps to a `User`, so the session strategy is orthogonal to whether MCP works at
all. Where the strategy *does* matter, database sessions win — an agent's access is
revoked by deleting rows in the same Postgres the MCP server already queries, which a JWT
cannot offer before its expiry. Two things in this issue keep that future cheap:

- Every "who is calling" question goes through one `getCurrentUser()` in
  `src/lib/session.ts` rather than `auth()` scattered across call sites, so a second
  identity source is a change in one file.
- Authorization stays in pure functions taking a role and a team (`checkTeamAccess`
  already; `decideSignIn` now), not in anything that reads a request object. An MCP tool
  call can reach the same decision functions with an identity it resolved its own way.

No schema change now — a token model is the v2 addition and is out of scope here.

**PWA service worker.** The app is a PWA and will register a service worker (push
subscriptions are Decision 8, deferred post-MVP; an offline shell is likely). A service
worker is same-origin JavaScript that cannot read `httpOnly` cookies — which is the
correct security posture and is preserved here — and its `fetch` calls to same-origin URLs
carry the session cookie automatically. Concretely, four constraints this issue satisfies:

1. **`sameSite` stays `lax`, never `strict`.** Auth.js's default is `lax`
   (`@auth/core/lib/utils/cookie.js`), which is load-bearing twice: a magic link clicked
   from an email client is a cross-site top-level navigation, and `strict` would drop the
   cookie and silently break every sign-in. `lax` also covers same-origin service-worker
   fetches. Do not "harden" this to `strict`.
2. **Session state is never mirrored into the service worker.** No token in
   `localStorage`, IndexedDB, or a SW cache for the worker to read — the cookie stays
   `httpOnly` and the server remains the only place identity is resolved. A worker that
   needs to know whether the user is signed in should call an endpoint, not inspect storage.
3. **Push delivery does not depend on a live session.** `PushSubscription` carries
   `userId`, so server-initiated push works while the user's session is long expired. Only
   subscription *registration* needs a session — and that is a Route Handler precisely
   because it needs a real HTTP endpoint the worker can POST to (per the architecture note
   on Route Handlers). A 90-day sliding `maxAge` means a phone that opens the app during a
   season effectively never re-authenticates.
4. **The worker must not cache authenticated navigations or the sign-in redirect.** When
   the cookie is absent, `/t/*` returns a 302 to `/signin`; a naive navigation-fallback
   cache would serve that redirect to a *signed-in* user later, or serve stale team data
   to a signed-out device. The eventual SW must scope precaching to static assets and the
   app shell, and treat `/t/*` and `/api/auth/*` as network-only. Called out here so the
   issue that adds the worker inherits the constraint rather than discovering it.

A sliding `updateAge` interacts well with a worker: background fetches count as session
reads and keep the session warm, so a parent who has the app installed stays signed in.

### Decision 3: Invitation → Membership conversion lives in `events.signIn`

**Options considered:**
- Option A: Convert inside the `signIn` callback.
- Option B: Convert in `events.signIn`, which fires after a successful sign-in.
- Option C: Defer conversion to #3.

**Decision:** Option B.

**Rationale:** The `signIn` callback is an authorization predicate and runs on the
send path too — writing memberships there would grant team access to someone who merely
typed an address into the form. `events.signIn` fires only after the link is actually
clicked and the session is established (`node_modules/next-auth/index.d.ts:350-355`).
Option C was rejected during planning: without conversion, an invited parent gets an
account and zero team access, because #3's team creation only grants `Membership(OWNER)`.

The write must respect the schema's third rule — roles never inherit and an existing
membership is never modified:

```ts
db.membership.upsert({
  where: { userId_teamId: { userId, teamId } },
  update: {},                       // deliberately empty — never re-role an existing member
  create: { userId, teamId, role: invitation.role },
})
```

`events.signIn` fires on *every* sign-in, so the whole operation must be idempotent:
select only invitations with `acceptedAt: null` and `expiresAt > now`, and on a repeat
sign-in the set is empty and nothing happens.

### Decision 4: `src/proxy.ts`, not root `proxy.ts` — correcting the issue text

**Options considered:**
- Option A: `/proxy.ts` at the repository root, as the issue body states.
- Option B: `/src/proxy.ts`.

**Decision:** Option B.

**Rationale:** The convention is that the file sits *at the same level as `app` or
`pages`* — "in the project root, or inside `src` if applicable"
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:23`,
same wording at `01-getting-started/16-proxy.md:33`). This project's router is at
`src/app`, so the correct location is `src/proxy.ts`; a root `proxy.ts` would simply never
run, and it would fail *silently* — unauthenticated requests to `/t/...` would render
instead of redirecting. The issue's "at the project root" is the generic phrasing for a
repo without a `src` directory. Implementation must confirm empirically: request
`/t/anything` with no cookie and assert the redirect.

### Decision 5: The proxy reads the cookie by name and imports nothing from `src/auth.ts`

**Options considered:**
- Option A: `export { auth as proxy } from "@/auth"` — the Auth.js documented shortcut.
- Option B: A hand-written `proxy` that checks `request.cookies` for the session cookie name.

**Decision:** Option B.

**Rationale:** Option A pulls the full Auth.js config — and therefore the Prisma adapter
and `src/lib/db.ts` — into the proxy bundle, which runs on every request including
prefetches. That is exactly the database-lookup-on-link-hover the architecture note
forbids, and the Next.js docs say Proxy "should not be used as a full session management
or authorization solution" (`16-proxy.md:27`). Cookie names are fixed by Auth.js:
`authjs.session-token`, prefixed `__Secure-` when cookies are secure
(`@auth/core/lib/utils/cookie.js` → `defaultCookies`). The proxy checks for either and
redirects to `/signin?callbackUrl=…` when neither is present. Presence is not validity —
that is the point of "optimistic", and the real check is `requireTeamAccess` in #3.

### Decision 6: Identical response for invited and uninvited addresses

**Options considered:**
- Option A: Show "that address hasn't been invited".
- Option B: Always show "if that address is invited, a link is on its way".

**Decision:** Option B.

**Rationale:** The sign-in form is the one unauthenticated POST surface in the app. An
explicit rejection turns it into a membership oracle — anyone could test addresses to
learn which parents are on a team, which for a youth sports app is a roster of children's
families. The cost is a confused parent who typo'd their email; the mitigation is a line
on the confirmation page telling them to check the address and contact their coach.

Mechanically: the server action calls `signIn("resend", { email, redirect: false })`
inside a `try`, swallows `AuthError` (Auth.js surfaces a denied `signIn` callback as
`AccessDenied`), and redirects to `/signin/check-email` on every path. Next.js implements
`redirect()` by throwing, so the `catch` must rethrow anything matching the Next redirect
error rather than swallowing it — call `redirect()` after the try/catch, not inside it.

### Decision 7: Fail fast on missing `RESEND_API_KEY` / `EMAIL_FROM`

**Options considered:**
- Option A: Pass `process.env.X` straight through; Auth.js tolerates `undefined`.
- Option B: Assert both at module scope in `src/auth.ts` and throw with a message
  pointing at `.env.example`.

**Decision:** Option B.

**Rationale:** The provider's default `from` is `"Auth.js <no-reply@authjs.dev>"`
(verified in `@auth/core/providers/resend.js`), so an unset `EMAIL_FROM` does not error —
it sends from a domain this project does not control, and per Decision 7 of
`stack-decisions.md` unverified-domain mail is the difference between parents seeing
invitations and never finding them. A missing `apiKey` fails at the Resend API with an
opaque error at the worst moment. `src/lib/db.ts` already sets the precedent of throwing
with a "see `.env.example`" message.

## Security & Permissions

| Surface | Who can reach it | Enforced by |
|---|---|---|
| `/` landing page | Anyone | Unchanged (#1) |
| `/signin`, `/signin/check-email` | Anyone | Public by design |
| `/api/auth/*` | Anyone | Auth.js; the `signIn` callback is the gate |
| Magic link delivery | Owner, invitee with an unexpired `Invitation`, existing member | `decideSignIn` |
| `/t/:path*` | Cookie holders (optimistically) | `src/proxy.ts` |
| Team data and mutations | Members, by role | **#3** — `requireTeamAccess`, not this issue |

The gate's decision table, all of it in `decideSignIn`:

| Address | Outcome |
|---|---|
| Matches `OWNER_EMAIL` (case-insensitively) | Allow — always, even with no `User` row yet |
| Holds an `Invitation` with `acceptedAt: null` and `expiresAt > now` | Allow |
| Holds a `Membership` on any team | Allow — a returning parent whose invitation was consumed seasons ago |
| Holds only expired or already-accepted invitations | Deny |
| Anything else | Deny |

Notes:

- **Archived teams are not a factor here.** Signing in is not a write; `requireTeamAccess`
  in #3 is where archived teams reject mutations. Do not add an archive check to the gate.
- **`OWNER_EMAIL` unset fails closed for ownership but not for everyone.** `isOwnerEmail`
  returns `false` for an unset, empty, or whitespace-only `ownerEmail`, so no address gets
  the exception; invited users still sign in normally. The consequence — nobody can
  bootstrap the first team — is correct behavior for a misconfigured deployment and is
  documented in `.env.example`.
- **Membership is never elevated by signing in.** Only `create` sets a role; the upsert's
  `update` is empty (Decision 3).
- The gate is keyed on the email address, lowercased and trimmed on both sides.
  `Invitation.email` and `User.email` are stored as entered, so normalize at comparison
  time rather than assuming stored casing.

## Error Handling

| Layer | Failure | Behavior |
|---|---|---|
| `src/auth.ts` module load | `RESEND_API_KEY` / `EMAIL_FROM` unset | Throw with a "see `.env.example`" message (Decision 7) |
| `signIn` callback | `loadSignInContext` throws (DB down) | Return `false` — fail closed; log server-side |
| `signIn` callback | Address not permitted | Return `false`; Auth.js redirects with `AccessDenied` |
| Server action | `AuthError` of any kind | Swallow, log server-side, land on `/signin/check-email` (Decision 6) |
| Server action | Malformed email | Zod `z.email()` — re-render the form with a field error; no lookup performed |
| `events.signIn` | Acceptance write throws | Log and swallow. The user is already signed in; throwing here would break a successful login over a membership row that the next sign-in retries |
| `src/proxy.ts` | — | No failure mode; it reads a cookie |

## Testing Strategy

| Layer | Test Type | File | Notes |
|---|---|---|---|
| Owner check | Unit (pure) | `src/lib/owner.test.ts` | Exact match, case differences, surrounding whitespace, `undefined`/`""`/whitespace `ownerEmail`, empty `email` |
| Sign-in gate | Unit (pure) | `src/lib/signin-gate.test.ts` | Every row of the decision table above, plus expiry exactly at `now` and an invitation that is expired *and* accepted |
| Invitation acceptance | Unit (mocked `db`) | `src/lib/invitations.test.ts` | `vi.mock("./db", …)` as in `src/lib/teams.test.ts`; assert `update: {}` on the upsert, assert no-op when the pending set is empty |
| Proxy | Unit | `src/proxy.test.ts` | Redirect with no cookie; pass-through with `authjs.session-token`; pass-through with `__Secure-authjs.session-token`; `callbackUrl` preserved |
| Sign-in page | Component | `src/app/signin/page.test.tsx` | Renders the form and the email field; Testing Library, as in `src/app/page.test.tsx` |

`src/auth.ts` itself is not unit-tested — it is configuration, and every decision worth
asserting has been extracted into a pure module. `pnpm build` plus a manual magic-link
round trip against a Neon dev branch is the check that the wiring is right.

Vitest runs in `jsdom` with `globals: true` (`vitest.config.ts`) and picks up
`src/**/*.test.{ts,tsx}`, so `src/proxy.test.ts` is collected without config changes.

## Config Changes

- [ ] Schema / index changes — **none required**; every table exists and is migrated
- [ ] Migration — **none**
- [ ] Access rule changes — none at this layer; `requireTeamAccess` is #3
- [ ] Environment variables — **`OWNER_EMAIL` added**. `RESEND_API_KEY` and `EMAIL_FROM`
      must be confirmed present in `.env.example` and added if not. (This session cannot
      read `.env*` — a tool permission rule denies it — so the implementer must verify
      rather than assume.) Keep the `!.env.example` negation in `.gitignore`
- [ ] Dependency changes — **none**; `next-auth@5.0.0-beta.32`, `@auth/prisma-adapter`,
      `resend`, and `zod` are all already in `package.json`

## Verified against the installed packages

Recorded because the framework versions here diverge from common training data:

| Claim | Evidence |
|---|---|
| `PrismaAdapter(db)` typechecks against the Prisma 7 generated client | Probe file + `pnpm typecheck` — clean, no cast needed |
| `NextAuth({...})` returns `{ handlers, auth, signIn, signOut }` | `node_modules/next-auth/index.d.ts` |
| `signIn` callback receives `email.verificationRequest` | `node_modules/next-auth/index.d.ts:177-197` |
| `events.signIn` receives `{ user, account, isNewUser }` | `node_modules/next-auth/index.d.ts:350-355` |
| Resend provider takes `EmailUserConfig`; default `from` is `Auth.js <no-reply@authjs.dev>` | `@auth/core@0.41.3/providers/resend.js` |
| Session cookie is `authjs.session-token` / `__Secure-authjs.session-token` | `@auth/core@0.41.3/lib/utils/cookie.js` → `defaultCookies` |
| Proxy file belongs beside `app` — i.e. `src/proxy.ts` here | `next/dist/docs/.../proxy.md:23` |
| All auth tables already migrated | `prisma/migrations/20260728053521_001/migration.sql` |

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| `proxy.ts` placed at the repo root — never runs, fails silently | High | Decision 4; implementation verifies with an actual unauthenticated request to `/t/x` |
| `EMAIL_FROM` unset → mail sent from `authjs.dev`, lands in spam | High | Decision 7 fail-fast assertion |
| Sign-in form used to enumerate which families are on a team | Med | Decision 6 identical responses |
| `events.signIn` re-running and re-roling an existing member | Med | `update: {}` upsert; only unaccepted, unexpired invitations selected |
| Invitation expires between send and click | Med | Gate re-runs on the click path; link fails closed |
| Owner's `User` row does not exist on first sign-in | Med | Adapter creates it; `isOwnerEmail` is checked before any `User` lookup, so the gate never depends on the row existing |
| Auth.js beta churn (`5.0.0-beta.32`) | Med | Version is pinned exactly in `package.json`; do not widen it in this issue |
| A parent has two invitations to different teams pending | Low | `acceptInvitations` iterates all pending invitations for the address, one upsert each |
| Long-lived sessions outliving a season | Low | Database sessions are deletable; a "sign out everywhere" action is a later issue, not this one |
| `getCurrentUser()` called in a static route causing a dynamic bailout | Low | Only `/t/*` and the sign-in flow use it; the landing page stays static |
| Cookie `sameSite` "hardened" to `strict`, silently breaking every magic link from an email client | Med | Decision 2; leave cookie options at the Auth.js defaults and do not add a `cookies` block |
| A later service worker caches the `/t/*` → `/signin` redirect and serves it to a signed-in user | Med | Constraint recorded in Decision 2 for the issue that adds the worker: `/t/*` and `/api/auth/*` are network-only |
| MCP server (v2) needs an identity path that is not a cookie | Low | `getCurrentUser()` seam plus pure authorization functions; a token model is a v2 schema addition, out of scope |
