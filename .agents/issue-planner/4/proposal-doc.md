# Proposal — Phase 4: Roster, jersey numbers, guardians, and invitations (#4)

## Executive Summary

Phase 4 builds the owner-driven roster seeding and guardian invitation system. Owners will manually create players, assign jersey numbers, link guardians (parents) to players via email, and send team invitations with 7-day expiry. This phase completes the onboarding flow, enabling an owner to bootstrap a team and bring parents into the app. The implementation follows the established patterns in the codebase: pure functions in `src/lib/` (testable without a database), data access wrappers that interact with Prisma, and server actions that enforce team access control before calling the library functions. Email invitations are sent via Resend using a React Email template, reusing the existing Auth.js infrastructure.

## Scope

### In Scope

- Player creation with optional date of birth
- Roster entry management (create, edit, remove) with jersey number uniqueness per team
- Guardian-player linking (many-to-many) with User upsert by email
- Invitation creation with random token and 7-day expiry
- Email invitation template and sending via Resend
- Server actions for all mutations with team access control
- UI for roster management: table display, add player, add guardian, send invitation
- Comprehensive unit tests for all lib functions and server actions
- Error messaging for jersey collisions, invalid ranges, and missing permissions
- Integration with existing sign-in gate (invitations consumed on magic-link click)

### Out of Scope

- CSV import (deferred to #5 via returning-player picker)
- Bulk operations (one player/guardian/invitation at a time in MVP)
- Guardian self-service signup or verification (invite-only via email token)
- Per-game lineup or position assignments (ballots for #10 and #11)
- Notification preferences or opt-out (deferred past MVP)

## Acceptance Criteria

1. Owner can create a player with name and optional date of birth through the UI
2. Owner can add/edit/remove roster entries scoped by teamId; each entry carries a jersey number
3. Jersey numbers are unique per team (range 0–99) and surface friendly error messages on collision (P2002)
4. Owner can link guardians to players via email address; Users are created/upserted immediately
5. Duplicate guardian links silently upsert (no error if already linked)
6. Owner can create and send invitations with automatic 7-day expiry from creation time
7. Invitations carry a unique random token and specified role (OWNER, COACH, PARENT)
8. Invitation acceptance is integrated with existing sign-in: email is invited, clicks magic link, acceptInvitations consumes the invitation on sign-in
9. React Email template renders correctly; invitations are sent via Resend to the configured `EMAIL_FROM` domain
10. All pure functions in `src/lib/roster.ts` and extended `src/lib/invitations.ts` are unit-tested
11. All server actions are tested with mocked database and access control
12. All new code passes `pnpm lint`, `pnpm typecheck`, and `pnpm test`
13. Build succeeds: `pnpm build`

## Implementation Phases

| Phase | Description | Areas Affected | Effort |
|---|---|---|---|
| 1 | Data access layer: roster functions (create player, add/edit roster, link guardians), pure helpers (token generation, validation) | `src/lib/roster.ts`, `src/lib/roster.test.ts` | ~3 days |
| 2 | Extended invitations & email: add createInvitation, sendInvitationEmail to lib, create React Email template | `src/lib/invitations.ts`, `src/emails/InvitationEmail.tsx`, tests | ~2 days |
| 3 | Server actions & UI: implement actions for all mutations, create roster management page and components, test server actions | `src/app/t/[teamId]/roster/` (actions, page, components, tests) | ~3 days |
| 4 | Integration & polish: verify sign-in gate flow, error messaging, edge case handling, final pre-commit checks | End-to-end testing, documentation | ~1 day |

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Unverified Resend domain results in emails landing in spam | High | Document `EMAIL_FROM` domain requirement in `.env.example`; email verification is part of infrastructure setup, not code. Test with a verified domain. |
| Jersey number P2002 error not caught cleanly | Medium | Server action catches Prisma errors by code (P2002 for unique constraint). Wrap in try-catch and redirect with user-friendly error. |
| Guardian-player race condition (simultaneous add) | Low | GuardianPlayer uses composite PK (`userId_playerId`); Prisma upserts are atomic. No issue. |
| Owner removes a player with pending RSVPs | Medium | RosterEntry deletion cascades to delete Rsvps. Mitigate: add UI warning ("This player has X RSVPs; removing will delete them"). Archive instead of delete in a future phase if soft-delete is needed. |
| Missing RESEND_API_KEY at build time | Low | `requireEnv` in `auth.ts` throws at runtime, not build time. Defers to first sign-in attempt. Acceptable per existing auth design. |
| Invitation email template breaks on old email clients | Low | Use React Email best practices (semantic HTML, fallback text, no complex CSS). Test rendering before deployment. |

## Effort Estimate

**Overall:** Medium (7–9 days, solo developer)

| Phase | Estimate | Rationale |
|---|---|---|
| Phase 1 | 3 days | 5–6 functions + validators + ~40 lines of tests each = ~100 test lines |
| Phase 2 | 2 days | Smaller scope; Resend integration is straightforward; React Email template is simple |
| Phase 3 | 3 days | ~6 server actions + page + 4 components + action tests = ~400 lines of new code + ~200 test lines |
| Phase 4 | 1 day | Testing, error messaging, edge cases, pre-commit gate |

**Assumptions:**
- Phases 1 and 2 can slightly overlap (start 2 once 1 schemas are solid)
- No major architectural surprises (existing patterns hold)
- Resend domain is already verified (operations, not development)

## Next Steps

1. **Review this proposal.** Confirm scope, risk mitigations, and effort estimate align with expectations.
2. **Approval.** Once approved, post proposal to GitHub issue #4 as a comment.
3. **Implementation.** Follow `task-doc.md` phase by phase. Commit regularly with clear messages.
4. **Testing.** Run `pnpm check` (lint → typecheck → test) before each commit; `pnpm build` before declaring a phase complete.
5. **Finalization.** After all code is merged, use the `finalize-issue` skill to archive planning docs and close the issue.

---

## Detailed Notes

### Architecture Highlights

**Separation of concerns:**
- Pure functions (validation, token generation) in helpers
- Data access (Prisma calls) in lib modules (`src/lib/roster.ts`, `src/lib/invitations.ts`)
- Orchestration (access control, error handling) in server actions
- UI (forms, display) in components

**Reuse of existing infrastructure:**
- Existing `Invitation` model already supports this use case (it's designed for gating any sign-in, not just auth onboarding)
- Existing `acceptInvitations` logic is reused; no new sign-in flow needed
- Resend + React Email already configured; no new packages needed
- Team access control follows established pattern: `requireTeamAccess` in server actions

**Testing strategy:**
- Unit tests mock the database layer; focus on logic and error handling
- Server action tests mock `requireTeamAccess` and lib functions; focus on Zod parsing and redirect behavior
- Component tests can be minimal (export checks) in MVP; smoke testing is sufficient
- No E2E tests in this phase; manual testing is acceptable for invite flow

### Data Model Constraints

**Why not add team columns to `Player` or `User`?**

Per AGENTS.md and the schema comments: a player may be on two active teams (travel + rec), and players/guardians persist across seasons. Jersey number, batting order, and position are team-specific and belong on `RosterEntry`. Guardian links are NOT team-scoped deliberately—this allows #5 (returning-player picker) to pull families onto new teams without reconstruction.

**Why upsert User immediately?**

- Keeps GuardianPlayer always pointing to a real User row
- Supports the use case where family links must persist to cascade guardians to new teams (#5)
- Matches the pattern in `acceptInvitations` (upsert on consumption)

**Why not per-game lineups?**

See Decision 16 in stack-decisions.md. The chart is standing (persistent), not per-game. Invitations and RSVPs gate sign-in and show readiness, but do not create per-game copies.

### Email Delivery

**Resend domain requirement:**
The app's email-sending reliability depends entirely on the `EMAIL_FROM` domain being verified (SPF/DKIM). This is an infrastructure concern, not a code concern. If emails go to spam, the problem is not the template or Resend integration—it's the domain verification. Document this prominently.

**Invitation email flow:**
1. Owner clicks "Send invitation" → server action `sendInvitationAction`
2. Creates `Invitation` row with random token, 7-day expiry
3. Calls `sendInvitationEmail({ to, teamName, acceptUrl })`
4. Guardian receives email with magic link to `/signin?email=...`
5. Guardian enters email, receives magic link, clicks it
6. Sign-in callback consumes the Invitation row (marks `acceptedAt`, creates `Membership`)

No separate "accept" page is needed; the existing flow handles it.

### Jersey Number Validation

**Zod schema:**
```typescript
const jerseyNumberSchema = z.coerce.number().int().min(0).max(99).optional();
```

**Error messages:**
- Type coercion fails → "Please enter a valid number"
- Out of range → "Jersey number must be between 0 and 99"
- Database collision (P2002) → "Jersey number already in use on this team"

### Archived Teams

Archived teams reject all mutations via `requireTeamAccess` with `intent: "write"`. This includes roster, guardian, and invitation operations. Owners cannot even force-create a player on an archived team. This is intentional: archived teams are historical records, not active rosters.

### Remaining Issues Blocked By or Dependent On This Phase

- **#5 (Returning-player picker)** — blocked by this phase; needs functioning roster and guardian links to pick from
- **#7 (RSVP with tri-state)** — can run in parallel; both use `Invitation` infrastructure but for different purposes
- **#10 (Batting order editor)** — blocked by this phase; needs roster entries to exist before editing chart
- **#11 (Positions editor)** — blocked by this phase; same as #10

