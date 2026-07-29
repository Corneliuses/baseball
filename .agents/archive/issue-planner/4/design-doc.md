# Design Doc — Phase 4: Roster, jersey numbers, guardians, and invitations (#4)

## Overview

The owner seeds a team's roster by hand: players with jersey numbers, guardians linked by
email, invitations mailed out. Until this lands the only address that can sign in is
`OWNER_EMAIL` — `Invitation` rows exist in the schema but nothing in the codebase creates
one, so the app has exactly one user. This is the issue that gives it people.

## Assumptions

These four questions were raised before planning and left unanswered; the plan proceeds on
the recommended answer. Each is cheap to change now and expensive to change after Phase 2.

| # | Question | Assumed answer |
|---|---|---|
| A1 | How does the invitation link grant access? | `/invite/[token]` validates the token and triggers a magic link. Membership still comes from the existing email-keyed `acceptInvitations` in `events.signIn`. One grant path, not two. |
| A2 | What happens when a guardian email is added? | One step: upsert `User`, create `GuardianPlayer`, create `Membership(PARENT)`, create `Invitation`, send the email. A separate "Resend invite" action covers typos. |
| A3 | Does #4 cover coach access? | Yes — invite by email with `role: COACH`, plus an owner-only control to change an existing member's role on this team. No other issue in the milestone covers it. |
| A4 | Who may view `/t/[teamId]/roster`? | Any member reads; every mutation requires `minRole: "COACH"`. |

## Acceptance Criteria

- [ ] AC1 — The owner can create a `Player` capturing **only** `name` and optional
      `dateOfBirth`. No team-specific column is written to `Player`.
- [ ] AC2 — The owner/coach can create, edit, and remove a `RosterEntry` scoped by
      `teamId`, carrying `jerseyNumber`. `battingOrder` and `position` stay null.
- [ ] AC3 — A duplicate jersey number produces a friendly, field-level error rather than an
      unhandled Prisma `P2002`. Same for adding a player already rostered on this team.
- [ ] AC4 — A player can be linked to many guardians and a guardian to many players, via
      `GuardianPlayer`. Linking upserts the `User` by normalized email.
- [ ] AC5 — Linking a guardian creates `Membership(user, team, PARENT)` and an `Invitation`
      row with a random token, an `expiresAt`, and the invited role, and mails the
      invitation. An existing `Membership` is **never** modified (A2, Decision 15 step 3).
- [ ] AC6 — The invitation email is a React Email template sent through Resend, containing
      an absolute `/invite/<token>` link and the team name.
- [ ] AC7 — Visiting `/invite/<token>` validates the token and expiry and, when live,
      sends a magic link to the invited address. Clicking that link signs the parent in and
      `acceptInvitations` sets `acceptedAt` and grants the `Membership`.
- [ ] AC8 — Expired, already-accepted, and unknown tokens each render a distinct, calm
      message and write nothing.
- [ ] AC9 — The owner can invite a COACH by email, and can change an existing member's role
      on this team. Role changes never touch any other team.
- [ ] AC10 — Every roster and invitation mutation calls `requireTeamAccess` with
      `intent: "write"` and `minRole: "COACH"` (role changes: `"OWNER"`) before writing.
      Archived teams reject all of them.
- [ ] AC11 — `src/lib/roster.ts` and `src/lib/invitations.ts` are the only modules issuing
      these Prisma calls; pure helpers are co-located and unit-tested.
- [ ] AC12 — `pnpm check` and `pnpm build` are green.

## Architecture & Data Model

### Data Layer

**No schema change and no migration.** Every model this issue needs already exists:
`Player` (`prisma/schema.prisma:85-94`), `RosterEntry` (`:156-178`), `GuardianPlayer`
(`:99-108`), `Membership` (`:135-147`), `Invitation` (`:182-196`). `Invitation.token` is
already `@unique` and is currently written by nothing — this issue is what starts using it.

The four unique constraints that matter here:

| Constraint | Fires when | Handling |
|---|---|---|
| `RosterEntry @@unique([teamId, jerseyNumber])` | two kids given the same number | friendly field error |
| `RosterEntry @@unique([playerId, teamId])` | same kid added twice | friendly form error |
| `Membership @@unique([userId, teamId])` | guardian already on the team | upsert, `update: {}` |
| `User.email @unique` | guardian already exists | upsert by normalized email |

`@@unique([teamId, jerseyNumber])` is over a nullable column; Postgres defaults to
`NULLS DISTINCT`, so any number of unnumbered players coexist. A player with no jersey yet
is a normal state, not an error.

### Module Layer

New and changed modules, following the repo's split — pure decision in one file, data
loading in a thin wrapper (`signin-gate.ts` / `invitations.ts` is the model to copy):

| Module | Pure? | Purpose |
|---|---|---|
| `src/lib/email-address.ts` | yes | `normalizeEmail(raw)` — trim + lowercase. One place, because `User.email` is `@unique` and case-sensitive on upsert. |
| `src/lib/invitation-token.ts` | DB-free | `generateInvitationToken()` (32 random bytes, base64url), `invitationExpiresAt(now)`, `isLiveInvitation({expiresAt, acceptedAt}, now)`, `INVITATION_TTL_DAYS = 14`. |
| `src/lib/roster-rules.ts` | yes | `parseJerseyNumber`, `sortRoster`, `rosterWriteFailure(error)` mapping a Prisma error shape to `"jersey-taken" \| "already-rostered" \| null`. |
| `src/lib/absolute-url.ts` | yes | `absoluteUrl(path, env)` — builds the `/invite/<token>` link from `AUTH_URL`, else `VERCEL_PROJECT_PRODUCTION_URL`/`VERCEL_URL`, else `http://localhost:3000`. |
| `src/lib/email.ts` | no | Thin Resend sender. Reads `RESEND_API_KEY` / `EMAIL_FROM` **at call time**, matching `src/auth.ts`'s lazy config — the build must not require secrets. #13 reuses this. |
| `src/lib/roster.ts` | no | Roster reads and writes, all `teamId`-scoped. |
| `src/lib/invitations.ts` | no | **Extended**, not replaced: adds `createInvitation`, `getInvitationByToken`, `listTeamInvitations`. |
| `src/lib/memberships.ts` | no | `listTeamMembers`, `setMemberRole` (Phase 4 only). |
| `src/emails/InvitationEmail.tsx` | — | React Email template. |

`src/lib/signin-gate.ts` loses its private `isLive` and imports `isLiveInvitation` from
`invitation-token.ts` instead. That is the whole refactor — one definition of "live", used
by both the gate and the accept page, so they can never drift.

### Route Layer

| Route | Auth | Purpose |
|---|---|---|
| `src/app/t/[teamId]/roster/page.tsx` | member (read) | Roster list, jersey numbers, add-player form. Edit controls render only for COACH+. |
| `src/app/t/[teamId]/roster/[entryId]/page.tsx` | member (read) | One player: jersey, DOB, guardians, invite status, remove. |
| `src/app/t/[teamId]/roster/actions.ts` | COACH (write) | `addPlayerAction`, `updateRosterEntryAction`, `removeRosterEntryAction`, `linkGuardianAction`, `unlinkGuardianAction`, `resendInvitationAction`. |
| `src/app/t/[teamId]/members/page.tsx` | OWNER (read) | Members and pending invitations; invite-a-coach form; role control. |
| `src/app/t/[teamId]/members/actions.ts` | OWNER (write) | `inviteMemberAction`, `setMemberRoleAction`. |
| `src/app/invite/[token]/page.tsx` | **none** | Token landing page. |
| `src/app/invite/[token]/actions.ts` | **none** | `requestInvitationLinkAction` — sends the magic link. |

`/invite/*` is deliberately outside `proxy.ts`'s `"/t/:path*"` matcher
(`src/proxy.ts:48`), so an invited parent with no session reaches it without being bounced
to `/signin`. No change to `proxy.ts` is needed or wanted.

## Key Decisions

### Decision 1: The token gates the send; the email grants the membership

**Options considered:**
- **A.** `/invite/[token]` validates the token, then calls `signIn("resend", {...})` to mail
  a magic link. Membership comes from the already-shipped `acceptInvitations` in
  `src/auth.ts:116-128`.
- **B.** `/invite/[token]` sets `acceptedAt` and creates the `Membership` itself.
- **C.** No token route; the invitation email links to `/signin`.

**Decision:** A.

**Rationale:** Membership-granting code already exists, is keyed on email, is idempotent,
runs on every sign-in, and is tested (`src/lib/invitations.test.ts:89-176`). Option B adds
a second path to the same write, which means two places to get "never modify an existing
Membership" right instead of one — the exact rule `AGENTS.md` flags as the one implementers
break by being helpful. Option C leaves `Invitation.token` a dead column and makes the
emailed link indistinguishable from the public sign-in page.

Under A the token earns its keep as the thing that authorizes *sending* mail to a
server-supplied address, which is what stops the page being an open relay. The page itself
writes nothing.

The cost is two clicks — invitation link, then magic link. That is precisely what the
product brief describes: "each gets an invitation link; clicking it issues a one-time,
expiring magic link and creates the account."

### Decision 2: Membership is created when the guardian is linked, not when they accept

**Options considered:**
- **A.** Linking a guardian creates `User` + `GuardianPlayer` + `Membership(PARENT)` +
  `Invitation`, and mails it.
- **B.** Membership appears only once the parent signs in.

**Decision:** A.

**Rationale:** Decision 15 is explicit that a `User` row exists before that person signs in
and that this is what "lets a not-yet-verified parent hold a `Membership`"
(`stack-decisions.md:411-419`, echoed at `prisma/schema.prisma:61-64`). #5's returning-player
cascade creates `Membership` with no invitation at all, so B would give the same person two
different arrival paths. Under B an invited-but-not-yet-clicked parent is also invisible to
#5's directory and to #13's broadcast recipient resolution, both of which resolve from
`Membership`.

The `Invitation` row is still created and still carries the role, because it is what
`decideSignIn` reads to admit a brand-new address (`src/lib/signin-gate.ts:66-68`).

### Decision 3: Catch `P2002`, do not pre-check for a free jersey number

**Options considered:**
- **A.** `SELECT` for the number first, reject if taken.
- **B.** Attempt the write, translate `P2002` into a field error.

**Decision:** B.

**Rationale:** A is a time-of-check/time-of-use race — two tabs assigning #7 both pass the
check and one still throws — so it needs B underneath it anyway. B alone is one round trip
and correct.

The translation lives in a **pure** `rosterWriteFailure(error)` in `roster-rules.ts` that
duck-types the error (`code === "P2002"`, plus the constraint name or column list in
`meta.target`) rather than importing `PrismaClientKnownRequestError`. Two reasons: the
generated client is gitignored so its internal export path is not a stable import, and
duck-typing keeps the mapper DB-free and exhaustively testable.

**Verify against a real database before merging.** With a driver adapter, Postgres reports
`meta.target` as the constraint *name* (`RosterEntry_teamId_jerseyNumber_key`), not the
column array some Prisma versions return. The mapper handles both shapes by substring
match, but which one actually arrives is unproven here — this repo has never run a
migration against live Postgres.

### Decision 4: Removing a roster entry removes the roster spot and nothing else

**Decision:** `removeRosterEntry` deletes the `RosterEntry` row only. `Player`,
`GuardianPlayer`, and the guardians' `Membership` rows all survive.

**Rationale:** Three things depend on that survival. #5's returning-player picker reads
global `Player` rows and their intact `GuardianPlayer` links. The product brief says members
"keep that read-only access indefinitely rather than being removed at season's end". And a
guardian may still have a second kid on the team — deleting their `Membership` because one
child left would silently cut off a family that is still on the roster.

The visible consequence: removing the only child of a family leaves that guardian on the
team as a PARENT with no kids. That is deliberate, not an oversight; the owner can change or
revoke access from the members page.

### Decision 5: Emails are stored normalized

**Decision:** `normalizeEmail` (trim + lowercase) is applied before writing `User.email` and
`Invitation.email`.

**Rationale:** `User.email` is `@unique` and Prisma's `upsert` matches it exactly. Without
normalization the owner typing `Sam@Example.com` for one kid and `sam@example.com` for the
sibling creates two `User` rows, two `Membership` rows, and two copies of the same parent in
the directory. Existing readers already match case-insensitively
(`src/lib/invitations.ts:29,33`), so nothing breaks — normalization just stops the duplicate
being created in the first place.

### Decision 6: Re-inviting replaces the pending invitation

**Decision:** `createInvitation` deletes any unaccepted `Invitation` for that
`(teamId, email)` and inserts a fresh one, in a transaction.

**Rationale:** `Invitation` has no `@@unique([teamId, email])`, so repeated "Resend invite"
clicks would otherwise pile up rows that all stay live. `acceptInvitations` copes — it
consumes them all idempotently — but the pending-invitations list on the members page would
show one parent four times, and a revoked-then-reissued invitation would leave the old token
working. Replacing keeps exactly one live token per address per team.

### Decision 7: A failed send does not roll back the invitation

**Decision:** Write the rows, then send. If Resend fails, keep the rows and report
`?error=email-failed`; the "Resend invite" action retries.

**Rationale:** The guardian link and the `Membership` are correct regardless of whether mail
went out, and the parent can also get in via the ordinary `/signin` form because
`decideSignIn` admits them on the live invitation. Rolling back would discard good data over
a transient provider error.

## Security & Permissions

| Operation | `requireTeamAccess` |
|---|---|
| View roster / player detail | `{ intent: "read" }` |
| Add / edit / remove roster entry | `{ intent: "write", minRole: "COACH" }` |
| Link / unlink guardian, resend invite | `{ intent: "write", minRole: "COACH" }` |
| View members page | `{ intent: "read", minRole: "OWNER" }` |
| Invite a coach, change a member's role | `{ intent: "write", minRole: "OWNER" }` |
| `/invite/[token]` | none — the token is the credential |

Notes:

- Archived teams reject every write above via `checkTeamAccess`
  (`src/lib/team-access.ts:64-68`), owner included. No extra handling needed.
- Every page under `/t/[teamId]` calls `requireTeamAccess` **itself**, not relying on the
  layout — layouts do not re-run on client-side navigation (`src/app/t/[teamId]/layout.tsx:11-17`).
- Role changes write `Membership.role` for **one** `(userId, teamId)` pair only. There is no
  code path in this issue that reads or writes a membership on another team.
- The owner may not demote themselves below OWNER on a team they own — that would strand the
  team. `setMemberRole` rejects it.
- `/invite/[token]` is unauthenticated and triggers an outbound email, so it is a spammable
  surface. The address is server-supplied from the row, so it cannot be used to mail a
  stranger, and the token is 32 random bytes. Rate limiting is **out of scope** and recorded
  as a risk below.
- The token appears in a URL path and therefore in server access logs. Fourteen-day TTL and
  single-team scope bound the exposure; this matches how the magic link itself already works.
- Minors' data: the roster holds children's names and jersey numbers. Every roster route is
  behind a membership check; nothing is public.

## Error Handling

Following `src/app/t/[teamId]/settings/actions.ts` exactly:

1. Zod-parse the `FormData`. On failure, `redirect(...?error=<code>)`.
2. `requireTeamAccess`. On `TeamAccessError`, `redirect(...?error=access)`.
3. Call the `src/lib/` write. Wrap in try/catch, run `unstable_rethrow(error)` **first** so
   Next's redirect-by-throw is never swallowed, map through `rosterWriteFailure`, redirect
   with the code, rethrow anything unrecognized.
4. `revalidatePath` then `redirect` on success.

The page renders codes through an `ERROR_MESSAGES` record with a generic fallback, as
`src/app/t/[teamId]/settings/page.tsx:20-23` does.

Read helpers in `roster.ts` swallow database errors and return empty, matching `teams.ts`;
mutations do **not** — `src/lib/teams.ts:1-14` states the rationale and it applies unchanged.

Codes: `invalid-name`, `invalid-jersey`, `invalid-email`, `jersey-taken`,
`already-rostered`, `email-failed`, `access`.

## Testing Strategy

| Layer | Test type | File | Notes |
|---|---|---|---|
| Email normalization | Unit | `src/lib/email-address.test.ts` | Case, whitespace, empty, already-normalized. |
| Token & expiry | Unit | `src/lib/invitation-token.test.ts` | Token is URL-safe and non-repeating; `isLiveInvitation` boundary — expiring exactly `now` is expired, matching the behaviour `signin-gate.test.ts` already asserts. |
| Jersey / P2002 mapping | Unit | `src/lib/roster-rules.test.ts` | Both `meta.target` shapes; non-`P2002` returns null; jersey range and blank-means-null. |
| Absolute URL | Unit | `src/lib/absolute-url.test.ts` | Each env precedence rung; no double slash. |
| Roster data module | Unit (mocked `db`) | `src/lib/roster.test.ts` | Mirror `invitations.test.ts`'s `vi.mock("./db")` shape. Assert every query carries `teamId`. |
| Invitations data module | Unit (mocked `db`) | `src/lib/invitations.test.ts` | Extend the existing file — do not rewrite it. Assert re-invite replaces, and that the guardian-link transaction upserts `Membership` with `update: {}`. |
| Membership role write | Unit (mocked `db`) | `src/lib/memberships.test.ts` | Assert the `where` names both `userId` and `teamId`; assert self-demotion rejected. |
| Invitation email | Unit | `src/emails/InvitationEmail.test.ts` | Test the props builder — subject line and the absolute accept URL. The rendered markup is not asserted. |
| Roster page | Component | `src/app/t/[teamId]/roster/page.test.tsx` | Follow `settings/page.test.tsx`. Edit controls absent for PARENT. |
| Accept page | Component | `src/app/invite/[token]/page.test.tsx` | Four states: live, expired, already accepted, unknown token. |

## Config Changes

- [ ] Schema / migration — **none required.** Every model already exists.
- [ ] Access rules — none beyond the `requireTeamAccess` calls listed above.
- [ ] Environment variables — `AUTH_URL` must be documented in `.env.example` (verify; add
      only if absent) since `absoluteUrl` reads it to build the invitation link.
      `RESEND_API_KEY` and `EMAIL_FROM` are already there.
- [ ] Dependencies — **none.** `resend`, `react-email`, and `@react-email/components` are
      already in `package.json`.
- [ ] `src/emails/` is a new top-level directory under `src/`; #13 will add to it.

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| Resend domain not SPF/DKIM verified — mail lands in spam or nowhere | **High.** Nothing else in the app matters if parents never get the invite. | Not fixable in code. Verify the domain before the first real send; `EMAIL_FROM` already carries the warning. Test against a real inbox, not just a 200 from the API. |
| `meta.target` shape differs from what the mapper expects | Medium — a jersey collision surfaces as a 500 instead of a field error | Mapper handles both shapes; confirm against live Postgres before merge (Decision 3). |
| Same guardian typed with different casing | Medium — duplicate parent, duplicate membership | `normalizeEmail` on every write (Decision 5). |
| Owner typos a guardian address | Medium — invite reaches a stranger; a `Membership` exists for the wrong address | Unlink removes `GuardianPlayer`; the members page can revoke the invitation. Full membership removal is not in scope — noted below. |
| `/invite/[token]` used to send repeated mail | Low — the address is server-supplied, so it can only spam the genuine invitee | Accepted for MVP. Rate limiting deferred; recorded here so it is a known gap, not a surprise. |
| Removing the only rostered child leaves an orphan PARENT membership | Low | Deliberate (Decision 4). Visible on the members page. |
| Jersey number reused after a player is removed | Low | The unique index is on live rows only; the number frees up immediately. Correct behaviour. |
| Two coaches editing the roster at once | Low | Last write wins. Unique constraints still hold; the loser sees a friendly collision error. |
| An invitation expires between send and click | Low | `decideSignIn` refuses, `/invite/[token]` shows the expired state, owner resends. Already-correct behaviour, tested. |
| Never-run migration — this is the first live-Postgres exercise of these constraints | Medium | Phase 1 ends with a real `pnpm db:migrate` against a Neon dev branch before UI work begins. |

## Out of Scope

Named explicitly so they are not quietly attempted:

- **CSV import.** Ruled out in the issue and the brief.
- **Adding an existing/returning player** — that is #5 and is the only legitimate global
  `Player` read in the app.
- **The directory page** — #5.
- **Removing a member from a team entirely** — no issue covers it; revoking an invitation
  and changing a role are what #4 ships.
- **`battingOrder` and `position`** — #10 and #11. They stay null here.
- **Broadcast messaging** — #13, which reuses `src/lib/email.ts` from this issue.
