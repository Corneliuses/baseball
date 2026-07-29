# Proposal — Phase 4: Roster, jersey numbers, guardians, and invitations (#4)

## Executive Summary

Until this issue lands, the app has exactly one user. `OWNER_EMAIL` is the only address the
sign-in gate admits, because the `Invitation` table it consults is never written to by
anything. #4 is what gives the app people: the owner types in players and jersey numbers,
links guardians by email, and mails them invitations that actually work.

The approach leans on what #2 already shipped rather than duplicating it. Membership-granting
code exists, is keyed on email, is idempotent, and is tested — `acceptInvitations` runs in
Auth.js's `events.signIn`. So the new `/invite/[token]` page validates the token and expiry
and then simply triggers a magic link; the membership is still granted by the one existing
path when that link is clicked. The token's job is to authorize *sending* mail to a
server-supplied address, which is what keeps the unauthenticated page from being an open
relay. This matches the product brief's description of onboarding word for word, and leaves
one place — not two — where "never modify an existing Membership" has to be right.

**No schema change and no migration.** Every model is already in `prisma/schema.prisma`,
including `Invitation.token`, which this issue is the first to use.

## Assumptions

Four questions were raised before planning and left unanswered; the plan proceeds on the
recommended answer for each. All four are cheap to change now and expensive after Phase 2.

1. **Accept flow** — `/invite/[token]` validates and sends a magic link; the existing
   email-keyed `acceptInvitations` still grants the Membership.
2. **Guardian linking** — one step: upsert `User`, create `GuardianPlayer`, create
   `Membership(PARENT)`, create `Invitation`, send the email. A "Resend invite" action covers
   typos.
3. **Coach access is in scope** — invite with `role: COACH`, plus an owner-only role control.
   No other issue in the milestone covers getting a coach onto a team.
4. **Roster visibility** — any member reads; every mutation requires COACH or above.

## Scope

### In Scope

- `Player` creation capturing only `name` and optional `dateOfBirth`.
- `RosterEntry` create / edit / remove, `teamId`-scoped, carrying `jerseyNumber`.
- Friendly errors for both `RosterEntry` unique-constraint collisions (duplicate jersey
  number, player already rostered).
- `GuardianPlayer` linking — many guardians per player, many players per guardian — with the
  `User` upserted by normalized email and `Membership(PARENT)` created on the spot.
- `Invitation` rows with a random token, `expiresAt`, and the invited role.
- A React Email invitation template sent through Resend, and a reusable `src/lib/email.ts`
  sender that #13 will build on.
- `/invite/[token]`: validate token and expiry, send the magic link, and let the existing
  sign-in path set `acceptedAt` and create the `Membership`.
- Coach invitations and an owner-only role control on `/t/[teamId]/members`.
- `src/lib/roster.ts` and `src/lib/invitations.ts` as the data modules, with pure helpers
  co-located and unit-tested.

### Out of Scope

- **CSV import** — ruled out by the issue and the brief; #5's picker covers the repeat case.
- **Adding a returning player, and the directory page** — #5.
- **`battingOrder` and `position`** — #10 and #11. They stay null here.
- **Broadcast messaging** — #13, reusing this issue's Resend wiring.
- **Removing a member from a team entirely** — no issue covers it; #4 ships revoking an
  invitation and changing a role.
- **Rate limiting the unauthenticated `/invite/[token]` send** — recorded as a known gap.

## Acceptance Criteria

1. The owner can create a `Player` capturing **only** name and optional date of birth. No
   team-specific column is ever written to `Player`.
2. Owner/coach can create, edit, and remove a `RosterEntry` scoped by `teamId`, carrying the
   jersey number. `battingOrder` and `position` stay null.
3. A duplicate jersey number produces a friendly field-level error, not an unhandled Prisma
   `P2002`. Same for adding a player already rostered on the team.
4. A player links to many guardians and a guardian to many players via `GuardianPlayer`.
   Linking upserts the `User` by normalized email.
5. Linking a guardian creates `Membership(user, team, PARENT)` and an `Invitation` carrying a
   random token, `expiresAt`, and role, and mails it. An existing `Membership` is **never**
   modified.
6. The invitation email is a React Email template sent through Resend, with an absolute
   `/invite/<token>` link and the team name.
7. Visiting a live `/invite/<token>` sends a magic link to the invited address; clicking it
   signs the parent in, sets `acceptedAt`, and grants the `Membership`.
8. Expired, already-accepted, and unknown tokens each render a distinct message and write
   nothing.
9. The owner can invite a COACH by email and change an existing member's role on this team.
   Role changes never touch another team.
10. Every roster and invitation mutation calls `requireTeamAccess` with `intent: "write"` and
    `minRole: "COACH"` (role changes: `"OWNER"`) before writing. Archived teams reject all of
    them.
11. `src/lib/roster.ts` and `src/lib/invitations.ts` are the only modules issuing these
    Prisma calls; pure helpers are co-located and unit-tested.
12. `pnpm check` and `pnpm build` are green.

## Implementation Phases

| Phase | Description | Areas affected |
|---|---|---|
| 1 | Pure modules and data layer — email normalization, token/expiry, jersey and `P2002` rules, absolute URLs, Resend sender, `roster.ts`, `memberships.ts`, `invitations.ts` extensions. Ends by exercising the unique constraints against real Postgres. | `src/lib/` |
| 2 | Roster UI — list, player detail, server actions, error surfaces. | `src/app/t/[teamId]/roster/` |
| 3 | Invitations — React Email template, guardian-link send, `/invite/[token]` accept flow, real-inbox check. | `src/emails/`, `src/app/invite/[token]/` |
| 4 | Coach invitations and role changes. | `src/app/t/[teamId]/members/` |

Phases 1 and 2 are the reviewable core; Phase 3 is where the only external dependency
(Resend deliverability) is proven; Phase 4 is small and separable, and touches the one
security-sensitive write in the issue.

## Key Decisions

| Decision | Choice | Why |
|---|---|---|
| Accept flow | Token gates the send; email-keyed `acceptInvitations` grants membership | One grant path, not two. The existing one is already idempotent and tested. |
| Guardian linking | `Membership` created immediately, before acceptance | Decision 15 and the schema comment both say a `User` exists before sign-in precisely so a not-yet-verified parent can hold a `Membership`. #5's cascade does the same. |
| Jersey collisions | Catch `P2002`, don't pre-check | A pre-check is a TOCTOU race and needs the catch underneath it anyway. |
| Roster removal | Deletes the `RosterEntry` only | `Player` and `GuardianPlayer` must survive for #5; the brief says members keep access indefinitely; a guardian may still have another kid on the team. |
| Email storage | Normalized (trim + lowercase) on write | `User.email` is `@unique` and upsert matches exactly — otherwise one parent becomes two rows and two directory entries. |
| Re-invite | Replaces the pending invitation in a transaction | There is no `@@unique([teamId, email])`, so repeats would pile up live tokens. |
| Failed send | Keeps the rows, reports the failure, offers a resend | The link and membership are correct regardless; the parent can also get in via `/signin`. |

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Resend domain not SPF/DKIM verified — invitations land in spam or nowhere | **High** | Not fixable in code. Phase 3 ends with a real send to a real inbox, not a 200 from the API. |
| Prisma's `meta.target` shape differs from what the error mapper expects, so a jersey collision 500s | Medium | The mapper handles both known shapes; Phase 1 confirms the actual value against live Postgres before any UI is built. |
| First real exercise of these constraints — the repo has never run a migration against Postgres | Medium | Phase 1 runs `pnpm db:migrate` against a Neon dev branch before Phase 2 starts. |
| A mistyped guardian address gets a `Membership` and an invitation | Medium | Unlink and revoke are available; full member removal is out of scope and named as such. |
| `/invite/[token]` is unauthenticated and triggers outbound email | Low | The address comes from the row, so it can only ever mail the genuine invitee. Rate limiting deferred and recorded. |
| Refactoring `signin-gate.ts`'s `isLive` breaks the sign-in gate | Low | `signin-gate.test.ts` is untouched and is the regression check. |

## Effort Estimate

**Overall: Medium (4–5 days).** This is the largest issue in the milestone so far — three
new surfaces, an outbound email dependency, and the first code to write `Invitation` rows.

| Phase | Estimate |
|---|---|
| 1 — Pure modules and data layer | 1.5 days |
| 2 — Roster UI | 1.5 days |
| 3 — Invitations and accept flow | 1 day + deliverability debugging |
| 4 — Coach invitations and role changes | 0.5 day |
| Docs, review cycles | 0.5 day |

The soft spot is Phase 3: domain verification and inbox placement are outside the code and
historically eat more time than the implementation does.

## Next Steps

1. Confirm or override the four assumptions above — especially #3 (whether coach access is
   in scope), which is the only one that changes the amount of work.
2. Review and approve this proposal.
3. Follow `task-doc.md` phase by phase.
4. Finalize with the `finalize-issue` skill: verify the ACs against the PR, archive
   `.agents/issue-planner/4/`, merge, close #4.
