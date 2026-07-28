# Design Doc — Phase 2: Auth — magic link, session, proxy, and owner bootstrap (#2)

> **STATUS: DRAFT — NOT APPROVED, CONTAINS VERIFIED DEFECTS. DO NOT IMPLEMENT FROM THIS DOC.**
>
> This draft was written without `node_modules` installed, so every Auth.js and Next.js
> claim below is from memory rather than from the installed packages. A later audit against
> the installed sources found six substantive defects, listed here so nobody implements the
> broken version:
>
> 1. **`proxy.ts` location is wrong.** Next resolves the proxy file relative to
>    `path.join(pagesDir || appDir, '..')` (`next/dist/build/index.js:615`) and only accepts
>    `/` or `/src` (`:628`). This repo's appDir is `src/app`, so the file must be
>    `src/proxy.ts`. A root-level `proxy.ts` is silently never loaded.
> 2. **The `signIn` callback fires twice.** `@auth/core/lib/actions/signin/send-token.js:23`
>    invokes it with `email.verificationRequest === true` *before* the mail is sent;
>    `lib/actions/callback/index.js:397` invokes it again on link click. Marking
>    `acceptedAt` on the first pass consumes the invitation and locks the user out on the
>    second.
> 3. **Wrong cookie name in production.** `@auth/core/lib/utils/cookie.js:44-49` prefixes
>    `__Secure-` when secure cookies are enabled, so a bare `authjs.session-token` lookup
>    redirect-loops on HTTPS.
> 4. **30-day `maxAge` is already the default** (`@auth/core/lib/init.js:38`), so it does not
>    satisfy the "long session" criterion.
> 5. **Invitation acceptance is lossy** — `teamId` and `role` are discarded and no
>    `Membership` is created, so an invited coach signs in and then fails
>    `requireTeamAccess` with `no-membership`. Open question, not a settled decision.
> 6. **Deviates from the repo's pure-decision-function convention** (`team-access.ts:44`,
>    `readiness.ts`) by inlining queries and the decision into `src/auth.ts`.
>
> The `.env.example` claims below are also unverified — the file is unreadable in the
> session that wrote this.

## Overview

This issue implements the authentication system using Auth.js v5 with Resend magic-link provider and Prisma adapter. It gates account creation via the `Invitation` table so no self-serve signup exists, and introduces `OWNER_EMAIL` as the sole bootstrap account that can create teams. The middleware (`proxy.ts`) stays optimistic-only: it checks for a session cookie and redirects to sign-in without database lookups.

## Acceptance Criteria

- [ ] Create `src/auth.ts` with the Auth.js v5 config: `@auth/prisma-adapter` over the shared client in `src/lib/db.ts`
- [ ] Configure the Resend provider, passing `apiKey` explicitly and setting `from` to `EMAIL_FROM`
- [ ] Add the catch-all route handler at `src/app/api/auth/[...nextauth]/route.ts`
- [ ] Implement the `signIn` callback: reject any address holding neither an unexpired `Invitation` nor an existing `Membership`, with `OWNER_EMAIL` as the sole exception
- [ ] Set a long session `maxAge` so parents are not re-authenticating on a phone at a ballfield
- [ ] Create `proxy.ts` **at the project root** with `export function proxy(request: NextRequest)` and `config.matcher = '/t/:path*'` — cookie read and redirect only
- [ ] Add pure `src/lib/owner.ts` exporting `isOwnerEmail(email, ownerEmail)` with co-located tests, including case-insensitive comparison and the unset-env case
- [ ] Build the sign-in page at `src/app/signin/`
- [ ] Document `OWNER_EMAIL` in `.env.example` alongside the existing variables
- [ ] Verify: `pnpm check` (lint → typecheck → test)
- [ ] Verify: `pnpm build`

## Architecture & Data Model

### Data Layer

**No new models required.** Uses existing Prisma schema:
- `User` — person record, created when owner enters email (before first sign-in)
- `Invitation` — gates account creation, scoped to team, carries `token`, `expiresAt`, `acceptedAt`, `role`
- `Membership` — person's access to a team (upserted when adding a returning player)
- `Account`, `Session`, `VerificationToken` — Auth.js adapter tables

**Key semantic:**
- User rows are created by the owner (via team creation flow in #3), before the person ever signs in
- An unexpired, unaccepted `Invitation` allows an email to sign up
- An existing `Membership` allows the person to sign in again
- `OWNER_EMAIL` bypasses both checks (bootstrap path)

### API / Service Layer

| Function | Type | Auth | Purpose |
|---|---|---|---|
| `signIn` callback in `src/auth.ts` | Internal | None (auth middleware) | Validates sign-in against Invitation + Membership, with OWNER_EMAIL exception |
| `GET/POST /api/auth/[...nextauth]` | HTTP | N/A | Auth.js catch-all handler; delegates to configured providers |
| `proxy` in `proxy.ts` | Middleware | Cookie-based | Redirects to `/signin` if no session cookie present for `/t/*` routes |
| `isOwnerEmail` in `src/lib/owner.ts` | Internal | N/A | Case-insensitive email comparison; safe on undefined env var |

### UI Component Tree

```
/signin
  └─ SignInForm
      ├─ Email input field
      ├─ Submit button (disabled until email valid)
      └─ "Check your email" confirmation state
         └─ Resend button
```

## Key Decisions

### Decision 1: Proxy stays optimistic-only

**Options considered:**
- Option A: Move membership/role check into `proxy.ts` for centralized protection
- Option B: Keep `proxy.ts` thin (cookie-only); move all authz into server actions and loaders

**Decision:** Option B (thin proxy)

**Rationale:** 
- Proxy runs on every request including prefetches, so a database lookup fires on link hover (Next.js docs explicitly forbid this)
- Proxy cannot see which resource a server action mutates (action POSTs to current page URL; proxy only sees `/t/team-A/roster` but not which record gets modified)
- This aligns with the existing pattern where `requireTeamAccess` lives in server actions (#3), not middleware
- Avoids duplicating authz logic across proxy + actions

### Decision 2: signIn callback handles Invitation lifecycle

**Options considered:**
- Option A: Accept invitation in the sign-in callback (mark `acceptedAt`)
- Option B: Defer invitation acceptance to a post-sign-in confirmation page

**Decision:** Option A (callback)

**Rationale:**
- Simplifies the flow: user clicks link → signed in immediately
- No extra page needed
- Invitation acceptance is atomic with account creation

### Decision 3: OWNER_EMAIL is env-only, not in database

**Options considered:**
- Option A: Store owner email in database as a flag on `User` or as a new model
- Option B: Use only environment variable for owner identity

**Decision:** Option B (env-only)

**Rationale:**
- Single-owner instance; owner identity is infrastructure config, not a domain fact
- Simpler: no need to migrate owner status across environments or instances
- Aligns with the scope (invite-only PWA for one coach)

### Decision 4: 30-day session maxAge

**Options considered:**
- Option A: Default 24-hour session (more secure, requires daily re-auth)
- Option B: 30-day session (less friction for parents at a ballfield)

**Decision:** Option B (30-day)

**Rationale:**
- Parents use the app on a phone at a ballfield; re-authenticating daily is user-hostile
- Risk is low: invite-only signup + magic-link only (no stored password)
- Aligns with the MVP constraint (single-owner, trusted group)

## Security & Permissions

### Access Control

| Layer | Mechanism | Rules |
|---|---|---|
| Middleware (`proxy.ts`) | Cookie presence | Redirects unauthenticated requests to `/signin` for `/t/*` routes |
| Sign-in callback | Invitation + Membership | Allows sign-in if: (1) unexpired, unaccepted Invitation for this email, OR (2) existing Membership, OR (3) email matches `OWNER_EMAIL` |
| Server actions (Phase #3) | `requireTeamAccess` | Validates membership, role, and archived status before mutations |

### Magic-Link Flow

1. User enters email on `/signin`
2. Resend sends a magic link to that email (token generated by Auth.js)
3. User clicks link → validates token, invokes `signIn` callback
4. Callback checks: Invitation OR Membership OR OWNER_EMAIL
5. If valid, `Invitation.acceptedAt` is marked; session is created
6. User is redirected to callbackUrl (default `/`) with session cookie

### No Self-Serve Signup

- Sign-up is impossible without an `Invitation` (unless email matches `OWNER_EMAIL`)
- Owner creates teams in #3, which generates `Invitation` rows for parents
- This enforces the single-owner, invite-only scope

## Error Handling

| Scenario | Handler | Behavior |
|---|---|---|
| Invalid email on sign-in form | Client validation | Input type="email" + disabled submit until valid |
| Resend API fails | Auth.js error callback (implicit) | Shown as error message on sign-in page; user can retry |
| Email has no Invitation/Membership and is not OWNER_EMAIL | `signIn` callback returns `false` | Auth.js redirects to sign-in error page (default) |
| Invitation expired | `signIn` callback query filters by `expiresAt > now()` | Treated as "no valid Invitation"; sign-in denied |
| Email is already in a Membership (returning player) | `signIn` callback query finds Membership | Sign-in allowed immediately |
| `OWNER_EMAIL` undefined or empty | `isOwnerEmail` checks `if (!ownerEmail) return false` | Treated as no OWNER_EMAIL set; owner must have an Invitation |

## Testing Strategy

| Layer | Test Type | File(s) | Notes |
|---|---|---|---|
| `isOwnerEmail` function | Unit | `src/lib/owner.test.ts` | Case-insensitive, unset-env, exact match |
| `signIn` callback | Integration | (via `pnpm test`) | Mocked `Invitation` and `Membership` queries |
| Sign-in form | Component | `src/app/signin/page.test.tsx` (optional, not required by AC) | User interaction, error states, confirmation UX |

**Note:** Full auth integration testing (magic-link email delivery, session persistence) is typically E2E and deferred to later; unit tests verify the core decision logic.

## Config Changes

- [ ] Schema / index changes — **None required** (existing schema has all needed models)
- [ ] Access rule changes — **None required** (Proxy is optimistic; authz is in actions)
- [ ] Environment variables — **New vars required:**
  - `AUTH_SECRET` — Random string for Auth.js (generate with `openssl rand -base64 32`)
  - `AUTH_URL` — URL of the app (e.g., `http://localhost:3000` in dev, `https://example.com` in prod)
  - `AUTH_TRUST_HOST` — Set to `true` in dev if AUTH_URL doesn't match request origin
  - `AUTH_RESEND_KEY` — API key from Resend
  - `EMAIL_FROM` — Sender email (e.g., `noreply@example.com`)
  - `OWNER_EMAIL` — Bootstrap account email (e.g., `coach@example.com`)
- [ ] Dependency changes — **None required** (all installed: `next-auth@5.0.0-beta.32`, `@auth/prisma-adapter`, `resend`)

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| Two sign-in tabs open, user clicks link in both | Duplicate session tokens possible | Auth.js handles this; only one session is active per user |
| `OWNER_EMAIL` env var typo (e.g., `owner@example.COM` vs schema using `owner@example.com`) | Owner cannot sign in | `isOwnerEmail` uses case-insensitive comparison |
| Invitation expires while user is composing sign-in form | Form still works, but callback rejects | User sees error; they must request a new invitation or owner must re-invite |
| `Invitation.acceptedAt` set but user never clicks the link | Orphaned record | Acceptable; invitation is one-time-use (acceptedAt gates re-use). Ideally cleaned up by owner, not user-facing |
| Resend API key leaked in .env | High | Never commit `.env` to git (it's in `.gitignore`); .env.example documents the var but not the value |
| Session cookie stolen (e.g., via XSS) | High | Mitigated by: (a) magic-link only (no password), (b) 30-day limit, (c) HTTPS in production, (d) framework defaults (httpOnly, secure flags) |

