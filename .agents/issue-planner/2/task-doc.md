# Task Doc — Phase 2: Auth — magic link, session, proxy, and owner bootstrap (#2)

> **STATUS: DRAFT — NOT APPROVED. See the defect list at the top of `design-doc.md` before
> following any step here.** Steps 1.2, 1.4 and 2.1 encode verified-wrong behavior (proxy
> file location, double-fired `signIn` callback, production cookie name).

## Prerequisites

- [ ] Phase 1 (app shell) is complete
- [ ] Prisma schema exists with User, Invitation, Account, Session, VerificationToken models
- [ ] Database client (`src/lib/db.ts`) is set up with Prisma 7 driver adapter
- [ ] Dependencies installed: `next-auth@5.0.0-beta.32`, `@auth/prisma-adapter`, `resend`

## Phase 1: Auth Configuration & Server-Side Setup

### 1.1 Create `src/lib/owner.ts` with isOwnerEmail utility

- [ ] Create `src/lib/owner.ts`
- [ ] Export `isOwnerEmail(email: string, ownerEmail: string | undefined): boolean`
- [ ] Implement case-insensitive comparison: `email.toLowerCase() === ownerEmail.toLowerCase()`
- [ ] Handle undefined/empty `ownerEmail` by returning `false`
- [ ] Write unit tests in `src/lib/owner.test.ts`:
  - [ ] Exact match
  - [ ] Case-insensitive match (both directions)
  - [ ] Non-matching email
  - [ ] `ownerEmail` is undefined
  - [ ] `ownerEmail` is empty string
- [ ] Run `pnpm test` and verify all owner tests pass

### 1.2 Create `src/auth.ts` with Auth.js v5 configuration

- [ ] Create `src/auth.ts`
- [ ] Import:
  - [ ] `db` from `@/lib/db`
  - [ ] `PrismaAdapter` from `@auth/prisma-adapter`
  - [ ] `PrismaClient` from `@/generated/prisma/client` (for type cast)
  - [ ] `NextAuth` from `next-auth`
  - [ ] `Resend` from `next-auth/providers/resend`
  - [ ] `isOwnerEmail` from `@/lib/owner`
- [ ] Create Prisma client for adapter: `const prismaForAdapter = db as unknown as PrismaClient;`
- [ ] Call `NextAuth()` with:
  - [ ] `adapter: PrismaAdapter(prismaForAdapter)`
  - [ ] `providers: [Resend({ apiKey: process.env.AUTH_RESEND_KEY, from: process.env.EMAIL_FROM })]`
  - [ ] `callbacks.signIn`: async function that:
    - [ ] Returns `false` if `user.email` is falsy
    - [ ] Returns `true` if email matches `OWNER_EMAIL` (via `isOwnerEmail()`)
    - [ ] Queries `Invitation` for an unexpired, unaccepted invite: `where: { email, expiresAt: { gt: new Date() }, acceptedAt: null }`
    - [ ] If invitation found, updates it: `await prismaForAdapter.invitation.update({ where: { id }, data: { acceptedAt: new Date() } })` then returns `true`
    - [ ] Queries `Membership` for existing membership: `where: { user: { email } }`
    - [ ] Returns `true` if membership found, `false` otherwise
  - [ ] `session.maxAge: 30 * 24 * 60 * 60` (30 days in seconds)
  - [ ] `pages.signIn: "/signin"`
- [ ] Export `handlers`, `auth`, `signIn`, `signOut` from `NextAuth()` result
- [ ] Run `pnpm typecheck` and verify no errors

### 1.3 Create auth route handler at `src/app/api/auth/[...nextauth]/route.ts`

- [ ] Create directory `src/app/api/auth/[...nextauth]/`
- [ ] Create `route.ts` in that directory
- [ ] Import `handlers` from `@/auth`
- [ ] Export `{ GET, POST } = handlers`
- [ ] Run `pnpm typecheck` to verify

### 1.4 Create `proxy.ts` middleware at project root

- [ ] Create `proxy.ts` at `/home/user/baseball/proxy.ts`
- [ ] Import `NextRequest`, `NextResponse` from `next/server`
- [ ] Export `function proxy(request: NextRequest)`:
  - [ ] Read `authjs.session-token` cookie from `request.cookies`
  - [ ] If not present, build redirect URL to `/signin` with `callbackUrl` search param set to `request.nextUrl.pathname`
  - [ ] Return `NextResponse.redirect(loginUrl)` (not found) or `NextResponse.next()` (found)
- [ ] Export `config` object with `matcher: ["/t/:path*"]`
- [ ] Run `pnpm typecheck` to verify

## Phase 2: Frontend — Sign-In Page

### 2.1 Create sign-in page at `src/app/signin/page.tsx`

- [ ] Create directory `src/app/signin/`
- [ ] Create `page.tsx` with:
  - [ ] Mark as `"use client"` (client component, uses `next-auth/react`)
  - [ ] Import `signIn` from `next-auth/react`
  - [ ] Import `useSearchParams` from `next/navigation` (extract `callbackUrl`)
  - [ ] Create functional component with state:
    - [ ] `email` (string)
    - [ ] `isLoading` (boolean)
    - [ ] `submitted` (boolean) — track if user has submitted (show "check email" state)
    - [ ] `error` (string) — display Resend API or Auth.js errors
  - [ ] Handle form submission:
    - [ ] Call `signIn("resend", { email, redirect: false })`
    - [ ] On error, display `result.error` message
    - [ ] On success, set `submitted = true`
  - [ ] Render two states:
    - [ ] **Submitted state:** "Check your email" message with `email` shown, "Try another email" button
    - [ ] **Form state:** Email input field + submit button, with error display
  - [ ] Styling (Tailwind):
    - [ ] Gradient background (`from-emerald-50 to-blue-50`)
    - [ ] Centered card (max-width 28rem)
    - [ ] Input field: border, focus ring, disabled state
    - [ ] Submit button: emerald theme, disabled when loading or email empty
    - [ ] Helper text about magic-link flow
  - [ ] Wrap in `<Suspense>` to handle `useSearchParams()` async boundary
- [ ] Run `pnpm typecheck` to verify
- [ ] Optionally: write component test in `src/app/signin/page.test.tsx` (not required by AC)

## Phase 3: Environment Variables & Documentation

### 3.1 Document environment variables in `.env.example`

- [ ] Open `.env.example`
- [ ] Add (if not present):
  - [ ] `# Auth.js configuration` section header
  - [ ] `AUTH_SECRET=` — comment: "Random 32-byte base64 string; generate with: openssl rand -base64 32"
  - [ ] `AUTH_URL=` — comment: "Application URL (e.g., http://localhost:3000 in dev)"
  - [ ] `AUTH_TRUST_HOST=` — comment: "Set to true in dev if AUTH_URL doesn't match request origin"
  - [ ] `AUTH_RESEND_KEY=` — comment: "API key from Resend (https://resend.com)"
  - [ ] `EMAIL_FROM=` — comment: "Sender email address (e.g., noreply@example.com)"
  - [ ] `OWNER_EMAIL=` — comment: "Bootstrap owner account email; can sign in without invitation"
- [ ] Keep `.gitignore` entry `!.env.example` intact (exempts from ignore)

### 3.2 Verify `.env` has required variables

- [ ] Check `.env` (not committed) has all variables from `.env.example`
- [ ] For local dev, set:
  - [ ] `AUTH_SECRET` to any 32-char string (e.g., `"dev-secret-key-dev-secret-key-d"`)
  - [ ] `AUTH_URL` to `"http://localhost:3000"`
  - [ ] `AUTH_RESEND_KEY` to a valid Resend API key (or placeholder for build-only testing)
  - [ ] `EMAIL_FROM` to a verified sender in Resend (e.g., `"onboarding@resend.dev"` for testing)
  - [ ] `OWNER_EMAIL` to your test email (e.g., `"coach@example.com"`)

## Phase 4: Verification & Testing

### 4.1 Run all checks

- [ ] Run `pnpm lint` — must pass
- [ ] Run `pnpm typecheck` — must pass
- [ ] Run `pnpm test` — must pass (owner tests + any existing tests)
- [ ] Run `pnpm build` — must pass (builds Next.js, generates Prisma client)
- [ ] If build fails due to missing `DATABASE_URL`, temporarily set it to a dummy Postgres connection string (e.g., `postgresql://user:pass@localhost:5432/dummy`) for build-only validation

### 4.2 Sanity checks (manual, if possible)

- [ ] If you have a real Postgres instance:
  - [ ] Run `pnpm db:generate` to ensure Prisma client is up-to-date
  - [ ] Run `pnpm dev` and visit `http://localhost:3000/signin` — form should load
  - [ ] Try navigating to `/t/any-team` without signing in — should redirect to `/signin`
- [ ] If build-only (no DB):
  - [ ] Verify `pnpm build` succeeds (that's sufficient for this phase)

## Pre-Commit Gate

Before pushing, verify all checks pass:

- [ ] Lint ✅
- [ ] Type check ✅
- [ ] Tests ✅
- [ ] Build ✅

Run:
```bash
pnpm check && pnpm build
```

## Files Modified / Created

| File | Change |
|---|---|
| `src/lib/owner.ts` | **Created** — `isOwnerEmail()` utility with case-insensitive comparison |
| `src/lib/owner.test.ts` | **Created** — Unit tests for `isOwnerEmail()` |
| `src/auth.ts` | **Created** — Auth.js v5 config with Prisma adapter, Resend provider, signIn callback |
| `src/app/api/auth/[...nextauth]/route.ts` | **Created** — Auth.js route handler |
| `proxy.ts` | **Created** — Next.js middleware (renamed from middleware.ts in Next.js 16) |
| `src/app/signin/page.tsx` | **Created** — Sign-in page with email form |
| `.env.example` | **Modified** — Added `AUTH_SECRET`, `AUTH_URL`, `AUTH_TRUST_HOST`, `AUTH_RESEND_KEY`, `EMAIL_FROM`, `OWNER_EMAIL` |

