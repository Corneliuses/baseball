# Task Doc — Phase 2: Auth — magic link, session, proxy, and owner bootstrap (#2)

## Prerequisites

- [x] Dependencies present — `next-auth@5.0.0-beta.32`, `@auth/prisma-adapter`, `resend`,
      `zod` are all already in `package.json`. Nothing to install.
- [x] Auth tables migrated — `User`, `Account`, `Session`, `VerificationToken`,
      `Invitation`, `Membership` are all in `prisma/migrations/20260728053521_001/`.
      No schema change, no new migration in this issue.
- [ ] `pnpm install && pnpm db:generate` on a fresh clone — `src/generated/prisma` is
      gitignored and nothing typechecks without it.
- [ ] A real `DATABASE_URL` (Neon dev branch) and a Resend API key with a verified sender
      domain, for the manual round trip in Phase 4. Not needed for Phases 1–3.
- [ ] Not blocked by #1 — that work is merged. #3 is blocked by this.

---

## Phase 1: Pure domain modules

No framework, no database, no imports from `src/auth.ts`. These hold every decision worth
asserting and are what makes `src/auth.ts` thin.

- [ ] Create `src/lib/owner.ts` exporting `isOwnerEmail(email: string | null | undefined,
      ownerEmail: string | null | undefined): boolean` — trims and lowercases both sides;
      returns `false` when either is missing, empty, or whitespace-only
- [ ] Write `src/lib/owner.test.ts`: exact match; differing case; surrounding whitespace;
      `ownerEmail` `undefined` / `""` / `"   "`; `email` empty
- [ ] Create `src/lib/signin-gate.ts` exporting `decideSignIn(input: SignInGateInput):
      SignInDecision`, where the input is `{ email, ownerEmail, invitations: {expiresAt,
      acceptedAt}[], hasMembership: boolean, now: Date }` and the decision carries
      `allowed` plus a `reason` of `"owner" | "invitation" | "membership" |
      "no-invitation"` for server-side logging
- [ ] Write `src/lib/signin-gate.test.ts` covering every row of the design doc's decision
      table: owner (including when no `User` row exists); unexpired unaccepted invitation;
      membership only; expired-only; accepted-only; expired *and* accepted; no invitations
      at all; `expiresAt` exactly equal to `now` (expired — use `>` not `>=`)
- [ ] `pnpm test` green

## Phase 2: Auth wiring

- [ ] Create `src/lib/invitations.ts` with two DB functions:
      `loadSignInContext(email)` → `{ invitations, hasMembership }`, selecting only
      `expiresAt` / `acceptedAt` / `teamId` / `role`, matching the email case-insensitively
      (`mode: "insensitive"`); and `acceptInvitations(userId, email, now)` which, in a
      `db.$transaction`, marks each pending invitation `acceptedAt` and calls
      `db.membership.upsert({ where: { userId_teamId }, update: {}, create: { userId,
      teamId, role } })` — **the empty `update` is load-bearing**, it is what keeps an
      existing membership from being re-roled (schema rule 3)
- [ ] Write `src/lib/invitations.test.ts` with `vi.mock("./db", …)` following the pattern
      in `src/lib/teams.test.ts`; assert the upsert is called with an empty `update`, and
      assert `acceptInvitations` performs no writes when the pending set is empty
- [ ] Create `src/auth.ts`:
      - assert `RESEND_API_KEY` and `EMAIL_FROM` at module scope, throwing with a
        "see `.env.example`" message like `src/lib/db.ts` does
      - `adapter: PrismaAdapter(db)` — verified to typecheck against the Prisma 7 client
        with no cast
      - `providers: [Resend({ apiKey, from })]` — `from` must be explicit; the provider's
        default is `Auth.js <no-reply@authjs.dev>`
      - `session: { strategy: "database", maxAge: 60 * 60 * 24 * 90, updateAge: 60 * 60 * 24 }`
      - `pages: { signIn: "/signin", verifyRequest: "/signin/check-email", error: "/signin" }`
      - **no `cookies` block** — the Auth.js defaults (`httpOnly`, `sameSite: "lax"`) are
        what make magic links from email clients and same-origin service-worker fetches
        both work
      - `callbacks.signIn`: call `loadSignInContext` then `decideSignIn`; return the
        boolean. Wrap in try/catch and return `false` on a thrown error (fail closed)
      - `callbacks.session`: expose `user.id` on the session
      - `events.signIn`: `await acceptInvitations(...)` inside try/catch that logs and
        swallows — a failed membership write must not break an otherwise valid login
- [ ] Create `src/app/api/auth/[...nextauth]/route.ts` — `export const { GET, POST } =
      handlers` from `@/auth`
- [ ] Create `src/lib/session.ts` exporting `getCurrentUser()` — the single place the app
      asks who is calling, wrapping `auth()` and returning `{ id, email, name } | null`.
      Every later feature and a future MCP identity source go through this one function
- [ ] Create **`src/proxy.ts`** — note the location, `src/`, beside `app`, *not* the repo
      root as the issue body says (see design doc Decision 4):
      - `export function proxy(request: NextRequest)`
      - read `authjs.session-token` and `__Secure-authjs.session-token` from
        `request.cookies`; if neither is present, redirect to
        `/signin?callbackUrl=<encoded original path>`
      - `export const config = { matcher: "/t/:path*" }`
      - **import nothing from `@/auth`** — that would pull Prisma into a bundle that runs
        on every request including prefetches
- [ ] Write `src/proxy.test.ts`: redirect when no cookie; pass through with the unprefixed
      cookie; pass through with the `__Secure-` cookie; `callbackUrl` preserved and encoded

## Phase 3: Sign-in UI and environment documentation

- [ ] Create `src/app/signin/actions.ts` with `requestSignInLink(formData)`:
      validate with `z.email()`; on a malformed address re-render with a field error
      without touching the database; otherwise call
      `signIn("resend", { email, redirect: false })` inside try/catch, swallow `AuthError`
      (log server-side), then `redirect("/signin/check-email")` **after** the try/catch so
      Next's redirect-by-throw is not caught by it
- [ ] Create `src/app/signin/page.tsx` — email field plus submit, wrapped in
      `PageContainer` from `@/components/layout/PageContainer`, using the existing
      `Button` / `Card` primitives in `src/components/ui/`. Explain that sign-in is by
      emailed link and that the app is invite-only
- [ ] Create `src/app/signin/check-email/page.tsx` — the identical destination for invited
      and uninvited addresses. Wording must not imply an email was definitely sent; add a
      line telling a parent who sees nothing to check the address and ask their coach
- [ ] Write `src/app/signin/page.test.tsx` — renders the form and the email input,
      following `src/app/page.test.tsx`
- [ ] Add `OWNER_EMAIL` to `.env.example` with a comment covering what it grants (always
      may sign in; sole team creator, enforced in #3) and what happens when it is unset
      (nobody gets the exception; invited users still sign in; no team can be created).
      **Still outstanding** — a tool permission rule denied all access to `.env*` during
      implementation. Ready to paste:

      ```sh
      # The single global owner of this instance. This address can always sign in,
      # with no invitation, which is how the first account comes into being — and it
      # is the only account permitted to create teams. Creating a team grants it
      # Membership(OWNER) on that team. Leave it unset and nobody holds the
      # exception: invited users still sign in, but no team can be created.
      OWNER_EMAIL="coach@example.com"
      ```
- [ ] Confirm `RESEND_API_KEY` and `EMAIL_FROM` are documented in `.env.example` and add
      them if not — planning could not read `.env*` (tool permission), so verify rather
      than assume
- [ ] Confirm `.gitignore` still carries the `!.env.example` negation

## Phase 4: Verification

- [ ] `pnpm check` (lint → typecheck → test) ✅
- [ ] `pnpm build` ✅
- [ ] **Proxy location smoke test** — `pnpm dev`, request `/t/anything` with no session
      cookie, confirm the redirect to `/signin`. A misplaced `proxy.ts` fails *silently*,
      so this cannot be skipped
- [ ] Manual round trip against a Neon dev branch: seed an `Invitation`, sign in with that
      address, confirm the mail arrives from `EMAIL_FROM` (not `authjs.dev`), confirm
      `acceptedAt` is set and a `Membership` row exists with the invitation's role
- [ ] Manual negative: sign in with an uninvited address — confirm the identical
      confirmation page **and** that Resend shows no send for it
- [ ] Manual idempotency: sign out and sign in again with the same address — confirm no
      second `Membership` row and no role change
- [ ] Manual owner bootstrap: sign in as `OWNER_EMAIL` with no `Invitation` and no
      `User` row — confirm it succeeds and the `User` row is created by the adapter

## Pre-Commit Gate

From `AGENTS.md` → Commands:

- [ ] `pnpm lint` ✅
- [ ] `pnpm typecheck` ✅
- [ ] `pnpm test` ✅
- [ ] `pnpm build` ✅

(`pnpm check` runs the first three.)

## Files Modified / Created

| File | Change |
|---|---|
| `src/lib/owner.ts` | **New** — pure `isOwnerEmail` |
| `src/lib/owner.test.ts` | **New** — case-insensitivity, unset env, empty input |
| `src/lib/signin-gate.ts` | **New** — pure `decideSignIn` |
| `src/lib/signin-gate.test.ts` | **New** — full decision table |
| `src/lib/invitations.ts` | **New** — `loadSignInContext`, `acceptInvitations` |
| `src/lib/invitations.test.ts` | **New** — mocked `db`, upsert shape, idempotency |
| `src/lib/session.ts` | **New** — `getCurrentUser()`, the single identity seam |
| `src/auth.ts` | **New** — Auth.js config, env assertions, callbacks, events |
| `src/app/api/auth/[...nextauth]/route.ts` | **New** — `export const { GET, POST } = handlers` |
| `src/proxy.ts` | **New** — cookie-presence redirect, `matcher: "/t/:path*"` |
| `src/proxy.test.ts` | **New** — redirect / pass-through / callbackUrl |
| `src/app/signin/page.tsx` | **New** — sign-in form |
| `src/app/signin/page.test.tsx` | **New** — renders form |
| `src/app/signin/actions.ts` | **New** — `requestSignInLink` server action |
| `src/app/signin/check-email/page.tsx` | **New** — shared confirmation destination |
| `.env.example` | **Modified** — document `OWNER_EMAIL` (+ `RESEND_API_KEY` / `EMAIL_FROM` if absent) |
| `prisma/schema.prisma` | **Unchanged** — deliberately |
