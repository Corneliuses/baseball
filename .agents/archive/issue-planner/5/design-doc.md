# Design Doc — Phase 5: Returning-player picker and directory (#5)

## Overview

Building a new season's roster today means retyping every kid and re-inviting every parent,
even though `Player`, `GuardianPlayer`, and `User` all survived the last season untouched.
This issue spends that: the owner picks a returning kid from a past team, and the kid's
guardians land on the new team as parents automatically. It also adds the directory — the
one screen where a parent standing at a field can find another parent's phone number.

## Clarifications

Three questions were raised before planning and answered. They are settled, not assumed.

| # | Question | Answer |
|---|---|---|
| C1 | Which players does the picker list? | Every `Player` holding a `RosterEntry` on **any team other than this one** — active or archived — minus those already rostered here. Decision 15 explicitly supports a kid on travel and rec simultaneously; an archived-only filter would block the exact case the model was built for. Each row labels where the kid played. |
| C2 | Nothing writes `User.phone`, so the directory's phone column would be empty. | #5 adds an owner/coach-editable phone field beside each linked guardian on `/t/[teamId]/roster/[entryId]`. Smallest change that makes the directory useful the day it ships; a self-serve profile page stays a later issue. |
| C3 | Who appears in the directory, and what are "their kids"? | One row per `Membership` on this team — parents, coaches, owner — each showing the kids they guard **who are rostered on this team**. Scoping the kid list to this team is a privacy requirement, not a nicety: an unscoped `GuardianPlayer` read would expose a child's participation on an unrelated team to everyone signed into this one. |

## Acceptance Criteria

- [ ] AC1 — `/t/[teamId]/roster/returning` lists every `Player` with a `RosterEntry` on some
      other team and none on this team, showing name, the teams/seasons they played on, and
      how many guardians they carry. Players already on this roster never appear.
- [ ] AC2 — The picker is **OWNER-only** to view and to write. A COACH or PARENT reaching the
      URL gets `notFound()`. This is the only global `Player` read in the app (Decision 13).
- [ ] AC3 — Picking a player prompts for an optional jersey number and, in **one
      transaction**, inserts `RosterEntry(player, team)` and creates
      `Membership(guardian, team, PARENT)` for every `GuardianPlayer` of that player.
- [ ] AC4 — An **existing `Membership` is never modified**. A guardian who is already a
      COACH or OWNER on this team keeps that role; a guardian already a PARENT is untouched.
      No code path in this issue issues a `membership.update`.
- [ ] AC5 — `src/lib/returning-players.ts` is pure and DB-free, computes which guardian
      memberships would be **newly created** versus already present, and has co-located tests
      covering none-existing, all-existing, mixed, duplicate-guardian, and empty inputs.
- [ ] AC6 — A "you've been added to *team*" email goes to **only** the guardians whose
      membership this call created. It carries no magic-link token — it links to the team
      page. Adding a second sibling in the same sitting re-notifies nobody.
- [ ] AC7 — A duplicate jersey number, or a player who became rostered between page render
      and submit, produces a friendly field error via the existing `rosterWriteFailure`
      mapping — never an unhandled Prisma `P2002`.
- [ ] AC8 — `/t/[teamId]/directory` lists every member of this team with name, phone, email,
      and the kids they guard **on this team**, visible to any signed-in member (PARENT+).
- [ ] AC9 — An owner or coach can set and clear a guardian's phone number from
      `/t/[teamId]/roster/[entryId]`, and it shows in the directory.
- [ ] AC10 — Every write in this issue calls `requireTeamAccess` with `intent: "write"`
      first (`minRole: "OWNER"` for the pick, `"COACH"` for the phone edit). Archived teams
      reject all of them.
- [ ] AC11 — No Prisma call is made from a component; all queries live in `src/lib/`.
- [ ] AC12 — `pnpm check` and `pnpm build` are green.

## Architecture & Data Model

### Data Layer

**No schema change and no migration.** Every model and column this issue needs exists:
`Player` (`prisma/schema.prisma:85-94`), `RosterEntry` (`:156-178`), `GuardianPlayer`
(`:99-108`), `Membership` with `@@unique([userId, teamId])` (`:145`), and `User.phone`
(`:71`) — declared in Phase 1 and written by nothing until now.

The picker's candidate query is the one global `Player` read the app permits:

```ts
db.player.findMany({
  where: {
    rosterEntries: { some: { teamId: { not: teamId } } },
    NOT: { rosterEntries: { some: { teamId } } },
  },
  // …teams played on, guardian count
})
```

Both halves matter. `some: { teamId: { not: teamId } }` keeps the list to kids who have
actually played somewhere — a `Player` row with no roster entry anywhere is not a
"returning" player. `NOT: { some: { teamId } }` is AC1's exclusion, and it is a filter for
the operator's benefit only: the real guarantee is
`RosterEntry @@unique([playerId, teamId])`, which is what a submit racing another tab
collides with.

### Module Layer

| Module | Pure? | Purpose |
|---|---|---|
| `src/lib/returning-players.ts` | **yes** | `planGuardianCascade(guardians, existingMemberUserIds)` → `{ toCreate, alreadyMembers }`, plus `sortReturningCandidates`. The new-versus-existing split AC6 keys off. |
| `src/lib/phone.ts` | **yes** | `normalizePhone(raw)` — trim, collapse internal whitespace, `""` → `null`, reject over 32 chars. Deliberately does not validate format. |
| `src/lib/directory-rules.ts` | **yes** | `sortDirectory(entries)` — OWNER, then COACH, then PARENT, each alphabetical by display name. Mirrors `roster-rules.ts` beside `roster.ts`. |
| `src/lib/roster.ts` | no | **Extended:** `listReturningCandidates(teamId)` and `addReturningPlayer({ teamId, playerId, jerseyNumber })` — the transactional cascade. |
| `src/lib/memberships.ts` | no | **Extended:** `listDirectory(teamId)`. |
| `src/lib/invitations.ts` | no | **Extended:** `setGuardianPhone(playerId, userId, phone)`. |
| `src/emails/added-to-team-email.ts` | **yes** | `buildAddedToTeamEmail({ teamName, teamId, env })` → `{ subject, teamUrl }`. Copy of the `invitation-email.ts` shape. |
| `src/emails/AddedToTeamEmail.tsx` | — | React Email template. No token, no accept button. |

### Route Layer

| Route | Auth | Purpose |
|---|---|---|
| `src/app/t/[teamId]/roster/returning/page.tsx` | **OWNER** (read) | Candidate list with `?q=` name filter; each row carries its own jersey input and Add button. |
| `src/app/t/[teamId]/roster/returning/actions.ts` | **OWNER** (write) | `addReturningPlayerAction`. |
| `src/app/t/[teamId]/directory/page.tsx` | member (read) | Name, phone, email, kids on this team. |
| `src/app/t/[teamId]/roster/actions.ts` | COACH (write) | **Extended:** `setGuardianPhoneAction`. |
| `src/app/t/[teamId]/roster/page.tsx` | — | **Extended:** "Add returning player" link, OWNER only. |
| `src/app/t/[teamId]/page.tsx` | — | **Extended:** "Directory" link, all members. |

No change to `src/proxy.ts`. Both new routes sit under `/t/:path*` and are covered by the
existing matcher.

## Key Decisions

### Decision 1: `createMany({ skipDuplicates: true })`, not `upsert`, for the guardian memberships

**Options considered:**
- **A.** `membership.upsert` per guardian with `update: {}` — the pattern already used in
  `acceptInvitations` (`src/lib/invitations.ts:79-85`) and `linkGuardian` (`:275-279`).
- **B.** One `membership.createMany({ data: toCreate, skipDuplicates: true })`.
- **C.** Read existing memberships, then `createMany` without `skipDuplicates`.

**Decision:** **B**, over the `toCreate` set that `planGuardianCascade` returns.

**Rationale:** AC4 is the rule the issue says an implementer gets wrong by being helpful, so
it is worth making structurally impossible rather than merely correct. `upsert` with an
empty `update` is correct but keeps an update branch in the statement — one future edit to
that object silently starts overwriting roles. `createMany` has no update branch to fill in.
It is also one round trip instead of N, and `skipDuplicates` makes the read-then-write race
(a guardian gaining a membership between our read and our write) a no-op rather than a
`P2002` that would abort the whole transaction and lose the roster insert. C is the version
of B that turns that race into a user-visible error for no benefit.

The existing `upsert` call sites are not being changed; they upsert a single row where the
extra round trip is not worth a second pattern.

### Decision 2: The cascade write lives in `roster.ts`, the decision in `returning-players.ts`

**Options considered:**
- **A.** Put `addReturningPlayer` in `roster.ts` (roster writes) even though it also writes
  `Membership` rows.
- **B.** Put it in `memberships.ts` even though it also writes a `RosterEntry`.
- **C.** A third data module, `src/lib/returning-roster.ts`, owning just this write.

**Decision:** **A** — `roster.ts`, with `src/lib/returning-players.ts` staying pure.

**Rationale:** The cascade is one atomic write, so it has to be one function: splitting it
across modules would mean passing a Prisma `tx` handle across a module boundary, which is a
worse coupling than the one it avoids and makes both modules untestable in isolation. Given
it must live in one place, `roster.ts` is the right one — the operation *is* "add a player
to this roster", and the memberships are its consequence. The `roster-rules.ts` / `roster.ts`
split is the precedent being copied exactly: the decision (`planGuardianCascade`) is pure and
exhaustively tested; the transaction is a thin wrapper around it.

### Decision 3: The notice email links to the team page and carries no token

**Options considered:**
- **A.** Plain notice linking to `/t/<teamId>`.
- **B.** Plain notice linking to `/signin`.
- **C.** Branch on `User.emailVerified`: a plain notice for guardians who have signed in,
  a real `Invitation` with a token for those who never did.

**Decision:** **A.**

**Rationale:** C looks necessary and isn't, which is worth spelling out because it is the
tempting one. The cascade creates a `Membership`, and `decideSignIn`
(`src/lib/signin-gate.ts:72-74`) admits any address holding a membership on any team —
that branch exists precisely so "a returning parent whose invitation was consumed seasons
ago still gets in." So a never-signed-in guardian following the link hits `proxy.ts`, gets
bounced to `/signin?callbackUrl=/t/<teamId>` (`src/proxy.ts:38-44`), enters their address,
and is let through on `hasMembership`. The link is a real way in for both populations
without a second grant path, which is the same conclusion #4 reached in its Decision 1.
A over B only because the callback lands them on the team they were just added to.

### Decision 4: Emails are sent after the transaction commits, and a send failure does not roll back

**Options considered:**
- **A.** Send inside `db.$transaction`.
- **B.** Send after commit; on failure redirect to `?error=email-failed`.
- **C.** Send after commit; on failure delete the roster entry and memberships.

**Decision:** **B**, matching `linkGuardianAction`'s handling (`roster/actions.ts:260-269`)
and #4's Decision 7.

**Rationale:** An email cannot be rolled back, so A holds a database transaction open across
a third-party HTTP call and still can't make the two atomic. C is worse than the problem: the
kid genuinely is on the roster and the guardians genuinely do have access — undoing correct
database state because a notification bounced would surprise the coach far more than a
"couldn't send the email" banner. The guardian retains access either way; the notice is a
courtesy, and the picker page can be used again.

Multiple guardians are mailed with `Promise.allSettled`, so one bad address does not suppress
the other guardian's notice. The banner appears if any send failed.

### Decision 5: The directory's kid list is scoped by `teamId`

**Options considered:**
- **A.** Read every `GuardianPlayer` for each member.
- **B.** Read only the guarded players who hold a `RosterEntry` on this team.

**Decision:** **B.**

**Rationale:** A leaks. `GuardianPlayer` is global by design (Decision 15), so A would show
every parent on this team that a given child also plays travel ball on another team in this
instance — cross-team information that the brief lists as out of scope and that no parent
consented to share. B is also what "their kids" means to someone reading a team directory.
Implemented as a nested `where: { rosterEntries: { some: { teamId } } }`, so the scoping is
in the query, not a post-filter that a later refactor can drop.

## Security & Permissions

| Operation | Check | Notes |
|---|---|---|
| View `/roster/returning` | `requireTeamAccess(teamId, { intent: "read", minRole: "OWNER" })` | Gates the global `Player` read. `TeamAccessError` → `notFound()`, so the route does not confirm the team exists to a non-member. |
| `addReturningPlayerAction` | `requireTeamAccess(teamId, { intent: "write", minRole: "OWNER" })` | `intent: "write"` is what makes an archived team reject the pick. |
| View `/directory` | `requireTeamAccess(teamId, { intent: "read" })` | Any member. |
| `setGuardianPhoneAction` | `requireTeamAccess(teamId, { intent: "write", minRole: "COACH" })`, then `requireRosterEntry` | Reuses the existing helper (`roster/actions.ts:228-237`) and the `entry.guardians.find(...)` guard, so a forged `userId` cannot write a phone onto an unrelated `User`. |

`playerId` in the pick action is the one identifier that legitimately comes from the form —
the picker is a global list by definition, so there is no team-scoped record to read it back
from. What bounds it instead is the candidate query's own predicate, re-applied in the
action: the action confirms the player has a roster entry on some other team and none on
this one before writing. A forged `playerId` for a kid who is already on this roster is
caught by `@@unique([playerId, teamId])` regardless.

The guardian emails sent by the cascade are read from `GuardianPlayer` → `User`, never from
the form — same rule as `resendInvitationAction` (`roster/actions.ts:324-330`): an
authenticated mail send must not be steerable to an arbitrary recipient.

## Error Handling

| Failure | Handling |
|---|---|
| Non-owner opens the picker or directory | `TeamAccessError` → `notFound()`. |
| Archived team, pick submitted | `TeamAccessError` → `?error=access`. |
| Jersey number not 0–99 | `parseJerseyNumber` throws `RangeError` → `?error=invalid-jersey`. |
| Jersey number already taken | `rosterWriteFailure` → `?error=jersey-taken`. |
| Player rostered here since page render | `rosterWriteFailure` → `?error=already-rostered`. |
| One or more notice emails fail | Roster entry and memberships stand; `?error=email-failed`. |
| Database outage on a list read | `listReturningCandidates` / `listDirectory` log and return `[]` — the empty-page rule from `teams.ts`. |
| Database outage on a write | Propagates. A write that silently fails is worse than one that throws. |

## Testing Strategy

| Layer | Test type | File | Notes |
|---|---|---|---|
| Cascade planning | Unit (pure) | `src/lib/returning-players.test.ts` | AC5: none existing, all existing, mixed, the same guardian listed twice, zero guardians. Asserts `alreadyMembers` is never in `toCreate`. |
| Phone | Unit (pure) | `src/lib/phone.test.ts` | Blank → null, whitespace collapse, over-long rejected, formats preserved. |
| Directory order | Unit (pure) | `src/lib/directory-rules.test.ts` | Role rank then name; members with no name sort by email. |
| Email builder | Unit (pure) | `src/emails/added-to-team-email.test.ts` | Subject carries the team name; URL is absolute and contains no token. |
| Pick action | Unit | `src/app/t/[teamId]/roster/returning/actions.test.ts` | Non-owner denied; email sent only to `toCreate`; zero new memberships → zero sends; `P2002` → friendly redirect; send failure still commits. |
| Picker page | Unit | `src/app/t/[teamId]/roster/returning/page.test.tsx` | Renders candidates, `notFound()` for a COACH, empty state. |
| Directory page | Unit | `src/app/t/[teamId]/directory/page.test.tsx` | Renders a member with kids, a coach with none, empty phone as "—". |
| Phone action | Unit | `src/app/t/[teamId]/roster/actions.test.ts` (extended) | Non-guardian `userId` → `?error=not-a-guardian`. |

`src/lib/roster.ts` and `src/lib/memberships.ts` stay untested directly, as they are today —
they are Prisma call sites with no branching worth mocking a client for, and the repo has no
database-backed test setup.

## Config Changes

- [ ] Schema / index changes — **none required.** No migration.
- [ ] Access rule changes — none beyond the `requireTeamAccess` calls above.
- [ ] Environment variables — none. Reuses `RESEND_API_KEY`, `EMAIL_FROM`, and the
      `AUTH_URL` / `VERCEL_*` chain that `absoluteUrl` already reads.
- [ ] Dependency changes — **none required.**

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| Guardian is already a COACH on this team | **High** — the rule the issue exists to protect | `createMany` has no update branch (Decision 1); `planGuardianCascade` excludes them from `toCreate`, so they are also not emailed. Directly unit-tested. |
| Two siblings added in one sitting | Med — a re-notified household reads as spam | Second add finds the membership present, `toCreate` is empty, no email. Directly unit-tested. |
| Guardian gains a membership between the read and the write | Low | `skipDuplicates` absorbs it; the notice is sent redundantly once. Accepted — a single-coach app has no real concurrency here. |
| Picked player has no guardians | Low | `toCreate` empty, roster entry still created, no email. Tested. |
| Jersey collision on submit | Low | Existing `rosterWriteFailure` mapping. |
| `rosterWriteFailure`'s `P2002` shape is still unverified against live Postgres | Med — a real collision could surface as a 500 | Pre-existing and documented in `AGENTS.md`; this issue reuses the mapping rather than adding a second one, so verifying it once fixes both paths. Not resolved here. |
| Candidate list grows across many seasons | Low | `?q=` name filter; the list is one query with no N+1. Realistically 25–75 rows. |
| Directory exposes parent phone numbers to every member | Med — by design, but worth naming | Matches the brief ("visible to all signed-in members"); membership is invite-only and the kid list is team-scoped (Decision 5). |
| A parent expects to edit their own phone | Low | Owner/coach-entered only in this issue (C2). A self-serve profile page is a follow-up. |
