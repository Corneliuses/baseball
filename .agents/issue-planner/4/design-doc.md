# Design Doc — Phase 4: Roster, jersey numbers, guardians, and invitations (#4)

## Overview

This phase implements the owner-driven roster seeding flow: creating players with jersey numbers, linking guardians to players, and sending team invitations to guardians via email. After this phase, an owner can hand-seed a team's roster and invite parents to join, bootstrapping the invite-only application.

## Acceptance Criteria

- [ ] Owner can create players with name and optional date of birth (DOB)
- [ ] Owner can add/edit/remove roster entries scoped by teamId, each carrying a jersey number
- [ ] Jersey numbers are unique per team (range 0–99) with friendly error messaging for collisions
- [ ] Owner can link guardians to players (many-to-many), creating Users by email upfront
- [ ] Duplicate guardian links silently upsert (no-op if already linked)
- [ ] Owner can create invitations with random token, 7-day expiry, and specified role
- [ ] Invitation acceptance flow validates token and expiry, marks acceptedAt, creates Membership
- [ ] React Email template for invitations, sent via Resend
- [ ] Pure helpers in `src/lib/roster.ts` and `src/lib/invitations.ts` unit-tested
- [ ] All checks pass: `pnpm check` (lint → typecheck → test) and `pnpm build`

## Architecture & Data Model

### Data Layer

**Existing models used:**
- `Player` — global, team-scoped via `RosterEntry` (name, DOB only; no team-specific fields)
- `User` — global, upserted by email before guardian link is created
- `GuardianPlayer` — many-to-many family link, deliberately NOT team-scoped
- `RosterEntry` — team-scoped roster spot (playerId, teamId, jerseyNumber, battingOrder=null, position=null)
- `Invitation` — team-scoped gate record (teamId, email, role, token, expiresAt, acceptedAt)
- `Membership` — team scoped access (userId, teamId, role)

**Constraints enforced:**
- `@@unique([playerId, teamId])` on `RosterEntry` — one spot per player per team
- `@@unique([teamId, jerseyNumber])` on `RosterEntry` — no duplicate jerseys per team (handles NULLs safely)
- `@@unique([userId, teamId])` on `Membership` — one role per person per team
- Jersey number range: 0–99 (validated in application logic)

### API / Service Layer

**Pure functions (DB-free, testable):**

| Function | Signature | Purpose |
|---|---|---|
| `validateJerseyNumber` | `(value: unknown) => number` | Zod schema for jersey validation |
| (future additions) | | More validation/decision helpers as needed |

**Data access & mutations (in `src/lib/roster.ts`):**

| Function | Type | Purpose |
|---|---|---|
| `createPlayer` | Mutation | `{ name, dateOfBirth? }` → Player |
| `createRosterEntry` | Mutation | `{ teamId, playerId, jerseyNumber? }` → RosterEntry, throws on jersey collision (P2002) |
| `updateRosterEntry` | Mutation | `{ id, jerseyNumber? }` → RosterEntry, throws on jersey collision |
| `removeRosterEntry` | Mutation | `{ id }` → void |
| `getRosterByTeamId` | Query | `(teamId)` → [RosterEntry with Player details] |

**Invitations (in `src/lib/invitations.ts`):**

| Function | Type | Purpose |
|---|---|---|
| `createInvitation` | Mutation | `{ teamId, email, role, expiresAt }` → Invitation with random token |
| `generateInvitationToken` | Pure | `() → string` (crypto.randomUUID or similar) |
| `sendInvitationEmail` | Mutation | `{ invitationId, to, teamName, acceptUrl }` → void, uses Resend |
| (existing) `acceptInvitations` | Mutation | `(userId, email)` → count, marks acceptedAt & creates Membership |

**Guardian linking (in `src/lib/roster.ts` or separate `src/lib/guardians.ts`):**

| Function | Type | Purpose |
|---|---|---|
| `linkGuardian` | Mutation | `{ playerId, email }` → GuardianPlayer, upserts User by email |
| `getGuardiansForPlayer` | Query | `(playerId)` → [User] |
| `getPlayersForGuardian` | Query | `(userId)` → [Player] |

### UI Component Tree

```
/t/[teamId]/roster/
├── page.tsx (layout)
├── _components/
│   ├── RosterTable.tsx (display & edit roster)
│   ├── AddPlayerForm.tsx (create player + jersey)
│   ├── EditRosterEntryModal.tsx (edit/remove)
│   ├── AddGuardianForm.tsx (link guardian to player)
│   └── SendInvitationForm.tsx (create & send invitation)
```

### Email Template

**InvitationEmail.tsx** (React Email component):
- Team name
- Invited role
- Magic link to acceptance endpoint (`/t/[teamId]/accept-invitation?token=...`)
- Fallback text for email clients that don't support templates

## Key Decisions

### Decision 1: User Creation Timing

**Options considered:**
- A. Upsert User immediately when guardian is linked
- B. Upsert User only when invitation is sent
- C. Upsert User only when invitation is accepted

**Decision:** A (immediate on link creation)

**Rationale:**
- Simplifies the data model: GuardianPlayer always points to a real User row
- Prevents orphaned links if invitation is never sent
- Aligns with the pattern in `acceptInvitations` which upserts at link-creation time
- Supports the use case from #5 (returning-player picker) where family links must persist to pull guardians onto new teams

### Decision 2: Jersey Number Validation Range

**Options considered:**
- A. Only uniqueness per team (no range)
- B. Range 0–99 (youth sports standard)
- C. Range 1–99 (no zero)

**Decision:** B (0–99 range)

**Rationale:**
- Matches standard youth sports practice and user expectations
- Caught in Zod schema before database, giving friendly error message
- User feedback indicated this is the right range for the domain

### Decision 3: Invitation Expiry Duration

**Options considered:**
- A. 7 days
- B. 14 days
- C. 30 days

**Decision:** A (7 days)

**Rationale:**
- Enough time for a parent to see an email and click without losing it in spam
- Short enough that re-sending to a lapsed guardians is not burdensome
- Matches common SaaS practice (7-day magic link expiry)

### Decision 4: Invitation Acceptance Route

**Options considered:**
- A. Separate accept page that validates token, then sign-in
- B. Accept on sign-in: token is consumed by the sign-in callback

**Decision:** B (consume on sign-in, reuse existing gate)

**Rationale:**
- Reuses existing `acceptInvitations` and sign-in gate logic
- Guardian clicks link → lands on `/signin` → enters email → gets magic link → clicks it → sign-in callback consumes invitations
- No separate acceptance flow needed; invitations are consumed exactly like the existing flow
- Simpler UX: one flow for all guardians whether they have an account or not

### Decision 5: Duplicate Guardian Linking

**Options considered:**
- A. Silently succeed (upsert) — no error if already linked
- B. Error if already linked

**Decision:** A (silently upsert)

**Rationale:**
- Owner may correct mistakes or re-add accidentally removed links without confusion
- Database model uses composite primary key `@@id([userId, playerId])`, which upserts naturally
- User feedback indicated this is acceptable for the workflow

## Security & Permissions

**Role-based access:**
- Only `OWNER` or `COACH` can create/edit roster (`minRole: "COACH"` for create, `minRole: "OWNER"` for mutations if needed)
- Only `OWNER` can send invitations (`minRole: "OWNER"`)
- Guardian acceptance uses existing sign-in gate: token + email must match an `Invitation` row with future `expiresAt`

**Data scoping:**
- All roster queries filtered by `teamId` in `src/lib/roster.ts`
- All invitation creates/sends scoped to `teamId`
- `requireTeamAccess` called in server actions before any mutation

**Archived team behavior:**
- Archived teams reject all roster and invitation mutations (checked by `requireTeamAccess` with `intent: "write"`)
- Reading archived rosters is allowed (historical reference)

## Error Handling

| Error Scenario | User Facing | Technical |
|---|---|---|
| Jersey number collision (P2002) | "Jersey number already in use on this team" | Catch Prisma `P2002` in server action, redirect with error code |
| Invalid jersey range | "Jersey number must be 0–99" | Zod validation in schema, catch and redirect |
| Guardian email invalid | "Please enter a valid email address" | Zod email validation |
| Expired invitation | Redirect to sign-in with info message | Handled by existing gate (expiresAt check) |
| No Resend API key | Don't crash the app; log error server-side | `requireEnv` in auth.ts prevents build-time failure |
| Database error | "Failed to save. Please try again." | Catch and log; redirect with error; don't pretend it worked |

## Testing Strategy

| Layer | Test Type | File(s) | Notes |
|---|---|---|---|
| Validation | Unit | `src/lib/roster.test.ts` | Zod schemas, pure validators |
| Data access | Unit (mocked DB) | `src/lib/roster.test.ts` | Mock `db` module, verify queries |
| Invitation logic | Unit (mocked DB) | `src/lib/invitations.test.ts` | Extend existing tests; verify token generation, expiry calc |
| Server actions | Integration | `src/app/t/[teamId]/roster/actions.test.ts` | Mock `requireTeamAccess`, `roster.ts` functions; verify Zod parsing, error redirect |
| Email template | Visual (manual) | `src/emails/InvitationEmail.tsx` | Renders without error; inspect in Resend dashboard or local preview |

**Existing patterns to follow:**
- Mocked DB in tests (see `src/lib/invitations.test.ts`)
- Server action error handling with redirects (see `src/app/t/[teamId]/settings/actions.ts`)
- Zod schema parsing and safeParse (see `src/app/t/[teamId]/settings/actions.ts`)

## Config Changes

| Area | Change |
|---|---|
| Schema | No new tables. Existing Invitation model already supports role. GuardianPlayer, User, RosterEntry, Membership unchanged. |
| Migrations | No migrations needed if schema is already applied. If not: `pnpm db:migrate` creates initial migration. |
| Indexes | Invitation table already has indexes on `teamId` and `email`. No new indexes needed. |
| Environment variables | `RESEND_API_KEY`, `EMAIL_FROM` already required by auth.ts. No new env vars. |
| Dependencies | Resend and React Email already in package.json. No new packages. |

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| Owner invites same email multiple times | Low | Each invitation is a separate row; both can be pending. When email signs in, all pending invitations are consumed. If one is already accepted, upsert skips it. No issue. |
| Guardian signs up in the middle of being added to roster | Low | Race condition is unlikely but possible. GuardianPlayer link and User upsert are separate statements. If User creation races ahead, link succeeds. If link races ahead, User upsert on invitation send ensures User exists. Acceptable. |
| Invitation expires while parent is entering email in form | Low | Parent enters email → email is not invited → Resend quietly fails (or link never sends). Parent lands on check-email page with empty inbox. On next attempt (within 7 days) after owner re-sends, it works. Expected behavior. |
| Jersey number reuse after player is removed from roster | Low | Removing a RosterEntry deletes the row. Jersey number is freed. Can be reused. Correct behavior. |
| Owner tries to remove a player who has RSVPs | Medium | Removing RosterEntry cascades to delete Rsvps (see schema `onDelete: Cascade`). This is data loss. Mitigation: warn on the UI ("This player has RSVPs for X games; removing will delete them"). Consider soft-delete later (archive instead of delete) if needed. |
| Resend domain not verified | High | Emails sent from unverified domain land in spam or fail silently. Mitigation: document in `.env.example` that `EMAIL_FROM` domain must be SPF/DKIM verified. This is not a code issue but an operational one. |
