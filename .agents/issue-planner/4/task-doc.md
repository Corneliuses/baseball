# Task Doc — Phase 4: Roster, jersey numbers, guardians, and invitations (#4)

## Prerequisites

- [ ] Issue #3 (Teams, `/t/[teamId]` scoping, `requireTeamAccess`) must be completed and merged
- [ ] Understand `src/lib/team-access.ts` and the requireTeamAccess pattern
- [ ] Understand the existing `src/lib/invitations.ts` (sign-in gate) and how it works
- [ ] Database is accessible (pnpm db:generate has run)

## Phase 1: Data Access Layer — Roster & Guardian Functions

### Core roster functions

- [ ] Create `src/lib/roster.ts` with:
  - [ ] `createPlayer({ name, dateOfBirth? })` → Player
  - [ ] `getRosterByTeamId(teamId)` → RosterEntry[] with joined Player details
  - [ ] `createRosterEntry({ teamId, playerId, jerseyNumber? })` → RosterEntry; handle P2002 jersey collision
  - [ ] `updateRosterEntry({ id, jerseyNumber? })` → RosterEntry; handle P2002
  - [ ] `removeRosterEntry(id)` → void
  - [ ] `linkGuardian({ playerId, email })` → GuardianPlayer; upsert User by email
  - [ ] `getGuardiansForPlayer(playerId)` → User[]
  - [ ] `getPlayersForGuardian(userId)` → Player[]

### Validation & pure helpers

- [ ] Create Zod schema `jerseyNumberSchema` (integer, 0–99, optional)
- [ ] Create `generateInvitationToken()` → string (use crypto.randomUUID or similar)
- [ ] Create `calculateInvitationExpiry(days = 7)` → Date (7 days from now)

### Unit tests for roster functions

- [ ] Write tests in `src/lib/roster.test.ts`:
  - [ ] `createPlayer` creates a player with correct fields
  - [ ] `createRosterEntry` throws P2002-like error on jersey collision
  - [ ] `createRosterEntry` accepts optional jerseyNumber (null is valid)
  - [ ] `linkGuardian` upserts User by email (lowercase, trimmed)
  - [ ] `linkGuardian` with duplicate email silently succeeds (upsert behavior)
  - [ ] `getGuardiansForPlayer` returns all linked Users
  - [ ] `getPlayersForGuardian` returns all linked Players
  - [ ] All queries filter by correct IDs (no cross-team leakage)

## Phase 2: Extended Invitations & Email

### Extend invitations module

- [ ] Update `src/lib/invitations.ts`:
  - [ ] Add `createInvitation({ teamId, email, role, expiresAt })` → Invitation with random token
  - [ ] Add `sendInvitationEmail({ invitationId, to, teamName, acceptUrl })` → void via Resend
  - [ ] Use `generateInvitationToken()` from Phase 1

### Email template

- [ ] Create `src/emails/InvitationEmail.tsx` using React Email:
  - [ ] Display team name
  - [ ] Display invited role (OWNER, COACH, PARENT)
  - [ ] Include magic link: `/signin?email={email}&invite_token={token}` or direct to sign-in with context
  - [ ] Fallback text for non-HTML clients
  - [ ] Responsive for mobile

### Unit tests for invitations

- [ ] Extend `src/lib/invitations.test.ts`:
  - [ ] `createInvitation` generates unique random token
  - [ ] `createInvitation` sets expiresAt correctly
  - [ ] `createInvitation` stores email, role, teamId
  - [ ] `sendInvitationEmail` calls Resend with correct params
  - [ ] (existing tests still pass) `acceptInvitations` marks acceptedAt and creates Membership

## Phase 3: Server Actions & Pages

### Create server actions

- [ ] Create `src/app/t/[teamId]/roster/actions.ts`:
  - [ ] `createPlayerAction(formData)` → creates Player, redirect with success/error
  - [ ] `addRosterEntryAction(formData)` → creates RosterEntry, handle jersey collision error gracefully
  - [ ] `updateRosterEntryAction(formData)` → updates RosterEntry
  - [ ] `removeRosterEntryAction(formData)` → removes RosterEntry
  - [ ] `linkGuardianAction(formData)` → creates GuardianPlayer link, upserts User
  - [ ] `sendInvitationAction(formData)` → creates Invitation, sends email

All server actions must:
- [ ] Extract and validate formData with Zod
- [ ] Call `requireTeamAccess(teamId, { intent: "write", minRole: "COACH" or "OWNER" })`
- [ ] Handle `TeamAccessError` and redirect with error code
- [ ] Handle Prisma errors (P2002 jersey collision, P2025 record not found, etc.)
- [ ] Call appropriate `src/lib/roster.ts` or `src/lib/invitations.ts` function
- [ ] Revalidate paths after success: `revalidatePath("/t/[teamId]", "layout")`
- [ ] Redirect with success or error message

### Create UI pages & components

- [ ] Create `src/app/t/[teamId]/roster/page.tsx`:
  - [ ] Load roster via `getRosterByTeamId(teamId)` in a loader
  - [ ] Display teams via `requireTeamAccess` in a loader (with `intent: "read"`)
  - [ ] Render RosterTable component
  - [ ] Render AddPlayerForm component
  - [ ] Render AddGuardianForm component
  - [ ] Render SendInvitationForm component

- [ ] Create component `src/app/t/[teamId]/roster/_components/RosterTable.tsx`:
  - [ ] Display all roster entries for the team
  - [ ] Show player name, jersey number, guardians count
  - [ ] Edit/remove buttons (server action forms)
  - [ ] Handle errors from server (e.g., jersey collision message)

- [ ] Create component `src/app/t/[teamId]/roster/_components/AddPlayerForm.tsx`:
  - [ ] Input: name (required), dateOfBirth (optional date)
  - [ ] Input: jerseyNumber (0–99, optional)
  - [ ] Submit calls `createPlayerAction` + `addRosterEntryAction`
  - [ ] Show validation errors

- [ ] Create component `src/app/t/[teamId]/roster/_components/AddGuardianForm.tsx`:
  - [ ] Dropdown: select a player
  - [ ] Input: guardian email
  - [ ] Submit calls `linkGuardianAction`
  - [ ] Show success/error message

- [ ] Create component `src/app/t/[teamId]/roster/_components/SendInvitationForm.tsx`:
  - [ ] Dropdown: select a guardian (from all guardians on the roster)
  - [ ] Dropdown: select a role (PARENT, COACH)
  - [ ] Submit calls `sendInvitationAction`
  - [ ] Show status: "Invitation sent to {email}"

### Tests for server actions

- [ ] Create `src/app/t/[teamId]/roster/actions.test.ts`:
  - [ ] Mock `requireTeamAccess` to return OWNER role
  - [ ] Mock `src/lib/roster.ts` functions
  - [ ] Test `createPlayerAction` with valid formData
  - [ ] Test error redirect on TeamAccessError
  - [ ] Test error redirect on Prisma P2002 (jersey collision)
  - [ ] Test `linkGuardianAction` upserts User

- [ ] Create `src/app/t/[teamId]/roster/page.test.tsx`:
  - [ ] Mock `requireTeamAccess` to return OWNER role
  - [ ] Mock `getRosterByTeamId` to return test roster
  - [ ] Verify page exports default function
  - [ ] (Optional) Verify layout loads correctly

## Phase 4: Integration & Polish

### Sign-in flow integration

- [ ] Verify existing sign-in gate (`src/lib/signin-gate.ts`, `src/auth.ts`) accepts invitations correctly
- [ ] Test: owner invites email → invited email clicks link → sign-in form → magic link click → acceptInvitations consumes invitation
- [ ] No code changes needed; just verify the flow works end-to-end

### Error messaging

- [ ] Jersey number collision: "Jersey number already in use on this team"
- [ ] Invalid jersey range: "Jersey number must be between 0 and 99"
- [ ] Invalid email: "Please enter a valid email address"
- [ ] Access denied: "You don't have permission to manage this team's roster"
- [ ] Resend failure: "Failed to send invitation. Please try again."

### Pre-Commit Gate

- [ ] `pnpm lint` ✅ (no eslint violations)
- [ ] `pnpm typecheck` ✅ (strict TypeScript)
- [ ] `pnpm test` ✅ (all unit tests pass, >80% coverage for new files)
- [ ] `pnpm build` ✅ (Next.js build succeeds)

## Files Modified / Created

| File | Change | Phase |
|---|---|---|
| `src/lib/roster.ts` | New file with roster & guardian functions | 1 |
| `src/lib/roster.test.ts` | New file with unit tests | 1 |
| `src/lib/invitations.ts` | Add `createInvitation`, `sendInvitationEmail` functions | 2 |
| `src/lib/invitations.test.ts` | Extend with new invitation tests | 2 |
| `src/emails/InvitationEmail.tsx` | New React Email template | 2 |
| `src/app/t/[teamId]/roster/actions.ts` | New server actions | 3 |
| `src/app/t/[teamId]/roster/actions.test.ts` | New tests for server actions | 3 |
| `src/app/t/[teamId]/roster/page.tsx` | New roster management page | 3 |
| `src/app/t/[teamId]/roster/_components/RosterTable.tsx` | New component | 3 |
| `src/app/t/[teamId]/roster/_components/AddPlayerForm.tsx` | New component | 3 |
| `src/app/t/[teamId]/roster/_components/AddGuardianForm.tsx` | New component | 3 |
| `src/app/t/[teamId]/roster/_components/SendInvitationForm.tsx` | New component | 3 |
| `src/app/t/[teamId]/roster/page.test.tsx` | New tests | 3 |

## Dependency Chain

- Phase 1 (roster functions) is independent; can start immediately
- Phase 2 (invitations & email) depends on Phase 1 (generateInvitationToken is used by createInvitation)
- Phase 3 (server actions & pages) depends on Phases 1 & 2
- Phase 4 (integration) depends on all of Phases 1–3

**Realistic parallelization:** Phases 1 and 2 can overlap slightly (start Phase 2 once Phase 1 schemas are solid).
