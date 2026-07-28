# Proposal — Phase 2: Auth — magic link, session, proxy, and owner bootstrap (#2)

> **STATUS: DRAFT — NOT APPROVED, NOT POSTED TO THE ISSUE.** See the defect list at the top
> of `design-doc.md`. Acceptance criterion 5 ("`Invitation.acceptedAt` is marked" during the
> sign-in callback) is not in issue #2, was invented by this draft, and describes behavior
> that breaks the magic-link flow. Effort estimates are unfounded.

## Executive Summary

This phase implements a complete authentication system for the Youth Baseball Team Manager using Auth.js v5 with Resend magic-link provider. The system is invite-only: no self-serve signup path exists anywhere. Account creation is gated by the `Invitation` table (for parents added to a team) or by the `OWNER_EMAIL` environment variable (for the bootstrap owner). The middleware (`proxy.ts`) is deliberately thin—it only checks for a session cookie and redirects unauthenticated requests to the sign-in page; all role and membership authorization is deferred to server actions. A 30-day session lifetime balances security with usability for parents using the app on a phone at a ballfield.

## Scope

### In Scope

- Auth.js v5 configuration with Prisma adapter and Resend magic-link provider
- Sign-in callback that validates against `Invitation` table + existing `Membership`, with `OWNER_EMAIL` bootstrap exception
- Mark invitation as accepted when sign-in succeeds
- Session maxAge set to 30 days
- Middleware (`proxy.ts`) for optimistic-only, cookie-based redirect to `/signin`
- Sign-in page at `/signin` with email form and "check your email" confirmation state
- Pure `isOwnerEmail()` utility with case-insensitive email comparison and unset-env safety
- Environment variable documentation for `AUTH_SECRET`, `AUTH_URL`, `AUTH_RESEND_KEY`, `EMAIL_FROM`, `OWNER_EMAIL`
- Unit tests for `isOwnerEmail()`

### Out of Scope

- Actual Resend email delivery (tested by Resend; assumed working)
- Per-game lineup permissions (#3 handles team-scoped authorization)
- Magic-link expiration UI (if a link expires, user must re-enter email on sign-in)
- Email verification after sign-in (not needed; magic-link proves ownership)
- 2FA or passwordless fallback
- Account deletion or password reset flows
- User profile page or account settings

## Acceptance Criteria

1. `src/auth.ts` created with Auth.js v5 config using `@auth/prisma-adapter` and Resend provider
2. Resend provider configured with `apiKey` and `from` (not using default `authjs.dev` address)
3. Route handler at `src/app/api/auth/[...nextauth]/route.ts` exports `{ GET, POST }`
4. `signIn` callback rejects unsigned invitations and non-members, except `OWNER_EMAIL`
5. When invitation is accepted via sign-in, `Invitation.acceptedAt` is marked
6. Session `maxAge` set to 30 days (2592000 seconds)
7. `proxy.ts` at project root with `export function proxy(request)` and `config.matcher = '/t/:path*'`; does cookie read + redirect only
8. `src/lib/owner.ts` exports `isOwnerEmail(email, ownerEmail)` with case-insensitive comparison and unset-env handling
9. Unit tests for `isOwnerEmail()` in `src/lib/owner.test.ts` cover exact match, case-insensitive, no match, undefined, empty
10. Sign-in page at `src/app/signin/page.tsx` with email input, submit button, and "check email" confirmation state
11. `.env.example` documents `OWNER_EMAIL`, `AUTH_RESEND_KEY`, `EMAIL_FROM` alongside existing vars
12. `pnpm check` passes (lint → typecheck → test)
13. `pnpm build` passes

## Implementation Phases

| Phase | Description | Areas Affected | Effort |
|---|---|---|---|
| 1 | Auth config, route handler, owner utility, middleware | `src/auth.ts`, `src/lib/owner.ts`, `proxy.ts`, `src/app/api/auth/` | ~3–4 hours |
| 2 | Sign-in page and environment documentation | `src/app/signin/`, `.env.example` | ~1–2 hours |
| 3 | Testing and verification | `src/lib/owner.test.ts`, `pnpm check`, `pnpm build` | ~30 min |

**Total effort:** Medium (~5–6 hours, including testing and verification)

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Middleware doing too much (authz instead of authn)** | High | Design decision explicitly keeps `proxy.ts` to cookie checks only. Authz lives in server actions. Prevents prefetch-induced DB lookups and duplication. |
| **OWNER_EMAIL typo prevents owner sign-in** | High | `isOwnerEmail()` uses case-insensitive comparison. Typo is still a typo, but case differences are forgiven. Document in `.env.example` with an example value. |
| **Invitation accepted but user never clicks link** | Low | Acceptable orphaned record. Invitation is single-use (acceptedAt prevents re-use). Owner can re-invite if needed. |
| **Session token stolen (XSS)** | Med | Mitigated by: (a) magic-link only (no password), (b) HTTPS in production, (c) 30-day limit, (d) framework defaults (httpOnly, secure cookies). |
| **Resend API key leaked in version control** | High | `.env` is in `.gitignore`. `.env.example` documents the variable without the secret. Document in team wiki / onboarding. |
| **Build fails without DATABASE_URL** | Low | Set dummy connection string for build-time validation (not needed for schema generation, only if Prisma runs queries). `pnpm db:generate` regenerates client; `pnpm build` only requires types. |
| **Auth.js v5 beta instability** | Med | Auth.js 5.0.0-beta.32 is specified in `package.json` (not floating). If critical issues arise, documented migration path to stable version exists. For MVP, beta is acceptable. |

## Effort Estimate

**Overall:** Medium (5–6 hours)

| Phase | Estimate |
|---|---|
| Phase 1 (Auth config + utilities) | 3–4 hours |
| Phase 2 (Sign-in page + docs) | 1–2 hours |
| Phase 3 (Tests + verification) | 30 min |

**Includes:** implementation, unit testing, type checking, build verification. Does not include: deployment, live email testing, E2E tests (deferred).

## Next Steps

1. **Review and approve** this proposal. Highlight any concerns about the approach (e.g., 30-day session maxAge, Resend as email provider, invitation acceptance in signIn callback).
2. **Follow `task-doc.md`** to implement phase by phase, committing after each phase passes `pnpm check`.
3. **After implementation**, verify:
   - [ ] `pnpm check` passes
   - [ ] `pnpm build` succeeds
   - [ ] (Optional) Manual test: `/signin` page loads, `/t/[any]` redirects to `/signin` without session
4. **Use `finalize-issue` skill** to verify PR against acceptance criteria, merge, and close the issue.

---

## Decision Record

The following architectural choices are locked in by this proposal. Changes require discussion and re-approval:

1. **Thin proxy:** Middleware checks cookies only; no database lookups, no authz logic
2. **Invitation in signIn callback:** Acceptance is marked when sign-in succeeds, not in a separate step
3. **OWNER_EMAIL is env-only:** No database flag for owner; infrastructure config only
4. **30-day session:** Chosen for parental usability; acceptable risk for invite-only, magic-link-only app
5. **Resend as email provider:** Selected in Phase 1 stack decisions; not revisiting here

