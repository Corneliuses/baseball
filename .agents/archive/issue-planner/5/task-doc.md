# Task Doc — Phase 5: Returning-player picker and directory (#5)

## Prerequisites

- [x] #4 (Roster, jersey numbers, guardians, and invitations) — merged in PR #20. This
      issue extends `src/lib/roster.ts`, `src/lib/invitations.ts`, `src/lib/memberships.ts`,
      and `src/app/t/[teamId]/roster/actions.ts`, all of which landed there.
- [ ] `pnpm install && pnpm db:generate` — `src/generated/prisma` is gitignored and nothing
      typechecks without it.
- No migration. No new dependencies. No new environment variables.

## Phase 1 — Pure core and the notice email

- [ ] Create `src/lib/returning-players.ts`, exporting:
      - `type GuardianLink = { userId: string; email: string; name: string | null }`
      - `type ReturningCandidate` — `playerId`, `name`, `dateOfBirth`, `teams: { id, name, season, archivedAt }[]`, `guardianCount`
      - `planGuardianCascade(guardians: readonly GuardianLink[], existingMemberUserIds: readonly string[]): { toCreate: GuardianLink[]; alreadyMembers: GuardianLink[] }` — deduplicates by `userId` and preserves input order
      - `sortReturningCandidates(candidates)` — alphabetical by name
      Header comment must state that `toCreate` is the *only* set that gets a membership or
      an email, and that nothing here may ever produce a role change.
- [ ] Write `src/lib/returning-players.test.ts`: no existing members, all existing, mixed,
      the same guardian appearing twice, empty guardian list, and an assertion that no
      member of `alreadyMembers` appears in `toCreate`.
- [ ] Create `src/lib/phone.ts` with `normalizePhone(raw: unknown): string | null` — trim,
      collapse internal whitespace, `""` → `null`, throw `RangeError` over 32 characters. No
      format validation.
- [ ] Write `src/lib/phone.test.ts`.
- [ ] Create `src/lib/directory-rules.ts` with `sortDirectory(entries)` — OWNER, COACH,
      PARENT, then `name ?? email` alphabetically. Reuse the `ROLE_RANK` idea from
      `src/lib/team-access.ts:23-27` rather than a second ad-hoc ordering.
- [ ] Write `src/lib/directory-rules.test.ts`.
- [ ] Create `src/emails/added-to-team-email.ts` with
      `buildAddedToTeamEmail({ teamName, teamId, env })` → `{ subject, teamUrl }`, using
      `absoluteUrl` from `src/lib/absolute-url.ts`. Copy the shape of
      `src/emails/invitation-email.ts` exactly.
- [ ] Write `src/emails/added-to-team-email.test.ts` — asserts the URL is absolute, points
      at `/t/<teamId>`, and contains no token.
- [ ] Create `src/emails/AddedToTeamEmail.tsx` — React Email, modelled on
      `src/emails/InvitationEmail.tsx`: team name, one button to the team page, the URL
      repeated as text, and a line saying they already have an account and can sign in with
      their email address. No expiry line, no "accept" language.

## Phase 2 — The picker: data layer, route, and cascade action

- [ ] Add `listReturningCandidates(teamId): Promise<ReturningCandidate[]>` to
      `src/lib/roster.ts`. One `db.player.findMany` with
      `where: { rosterEntries: { some: { teamId: { not: teamId } } }, NOT: { rosterEntries: { some: { teamId } } } }`,
      selecting the other teams played on and `_count.guardians`. Swallow database errors and
      return `[]`, matching `getRoster` (`src/lib/roster.ts:68-79`). Comment it as the single
      legitimate global `Player` read in the app, per Decision 13.
- [ ] Add `addReturningPlayer({ teamId, playerId, jerseyNumber })` to `src/lib/roster.ts`,
      returning `{ entry, notify: GuardianLink[] }`. Inside one `db.$transaction(async (tx) => …)`:
      1. `tx.rosterEntry.create({ data: { teamId, playerId, jerseyNumber } })`
      2. `tx.guardianPlayer.findMany({ where: { playerId }, select: { user: { select: { id, email, name } } } })`
      3. `tx.membership.findMany({ where: { teamId, userId: { in: guardianIds } }, select: { userId: true } })`
      4. `planGuardianCascade(...)` from `@/lib/returning-players`
      5. `tx.membership.createMany({ data: toCreate.map((g) => ({ userId: g.userId, teamId, role: "PARENT" })), skipDuplicates: true })`
      Do **not** send email inside the transaction. Do **not** write `membership.update`
      anywhere — leave a comment saying why `createMany` was chosen over `upsert`
      (design-doc.md Decision 1).
- [ ] Create `src/app/t/[teamId]/roster/returning/actions.ts` with
      `addReturningPlayerAction(formData)`:
      - `extractTeamId`-style validation for `teamId` and `playerId` (copy the helpers'
        shape from `src/app/t/[teamId]/roster/actions.ts:25-39`)
      - `parseJerseyNumber` → `?error=invalid-jersey`
      - `requireTeamAccess(teamId, { intent: "write", minRole: "OWNER" })`
      - re-apply the candidate predicate for the submitted `playerId` before writing
        (design-doc.md "Security & Permissions") → `?error=not-a-candidate` if it fails
      - `addReturningPlayer(...)`, then `Promise.allSettled` over `notify`, sending
        `AddedToTeamEmail` via `sendEmail`; any failure → `?error=email-failed`
      - `unstable_rethrow` + `TeamAccessError` → `?error=access`, `rosterWriteFailure` →
        `?error=<failure>`, matching `addPlayerAction`
      - `revalidatePath("/t/[teamId]/roster", "page")` and
        `revalidatePath("/t/[teamId]/roster/returning", "page")`, then redirect to
        `/t/${teamId}/roster?added=1`
- [ ] Create `src/app/t/[teamId]/roster/returning/page.tsx`:
      `requireTeamAccess(teamId, { intent: "read", minRole: "OWNER" })` with
      `TeamAccessError` → `notFound()`; a `?q=` name filter form; one `Card` per candidate
      showing name, the teams/seasons played on (with an "archived" hint), guardian count,
      an optional jersey `input`, and an Add button posting `addReturningPlayerAction`; an
      `ERROR_MESSAGES` map in the style of `roster/page.tsx:22-29`; an empty state that says
      no past players are available to add.
- [ ] Add an OWNER-only "Add returning player" link to
      `src/app/t/[teamId]/roster/page.tsx`, and surface the `?added=1` confirmation there.
      `role` is already resolved on that page (`roster/page.tsx:45`).
- [ ] Write `src/app/t/[teamId]/roster/returning/actions.test.ts` — mock `@/lib/roster`,
      `@/lib/email`, `@/lib/teams`, `@/lib/team-access`, `next/cache`, `next/navigation`,
      copying the mock scaffold at the top of
      `src/app/t/[teamId]/roster/actions.test.ts:1-55`. Cover: COACH denied; email sent once
      per `toCreate` entry and never for `alreadyMembers`; empty `notify` → `sendEmail`
      never called; `P2002` → `?error=jersey-taken`; failed send → still redirects with
      `?error=email-failed`.
- [ ] Write `src/app/t/[teamId]/roster/returning/page.test.tsx` — renders candidates,
      `notFound()` for a COACH, empty state.

## Phase 3 — Directory and guardian phone

- [ ] Add `listDirectory(teamId)` to `src/lib/memberships.ts`, returning
      `{ userId, role, name, email, phone, players: { id, name }[] }[]`. Nested read:
      `user: { select: { …, guardianOf: { where: { player: { rosterEntries: { some: { teamId } } } }, select: { player: { select: { id, name } } } } } }`.
      Swallow errors → `[]`, like `listTeamMembers`. Comment that the nested `where` is the
      privacy boundary (design-doc.md Decision 5), not a cosmetic filter.
- [ ] Create `src/app/t/[teamId]/directory/page.tsx` —
      `requireTeamAccess(teamId, { intent: "read" })`, `sortDirectory(await listDirectory(teamId))`,
      one row per member with name, role, `mailto:` email, `tel:` phone or "—", and the kids
      they guard on this team.
- [ ] Add a "Directory" link for all members to `src/app/t/[teamId]/page.tsx` alongside the
      existing Roster button (`page.tsx:50-60`).
- [ ] Add `setGuardianPhone(playerId, userId, phone)` to `src/lib/invitations.ts` — verifies
      the `GuardianPlayer` row exists, then `db.user.update({ where: { id: userId }, data: { phone } })`.
- [ ] Add `setGuardianPhoneAction` to `src/app/t/[teamId]/roster/actions.ts`, reusing
      `requireRosterEntry` (`:228-237`) and the `entry.guardians.find((g) => g.id === userId)`
      guard from `unlinkGuardianAction` (`:295-298`). `normalizePhone` `RangeError` →
      `?error=invalid-phone`.
- [ ] Add `phone` to `RosterEntryGuardian` and the `getRosterEntry` select in
      `src/lib/roster.ts` — the select already reads `phone` for the guardian
      (`roster.ts:112`), so this is wiring it into the returned shape's use, not a new read.
- [ ] Add the phone input to each guardian row in
      `src/app/t/[teamId]/roster/[entryId]/page.tsx`, rendered only when `canEdit`, plus
      `"invalid-phone"` in that page's `ERROR_MESSAGES` map (`:26-35`).
- [ ] Write `src/app/t/[teamId]/directory/page.test.tsx` — a parent with two kids, a coach
      with none, a member with no phone rendering "—".
- [ ] Extend `src/app/t/[teamId]/roster/actions.test.ts` for `setGuardianPhoneAction`:
      happy path, a `userId` that is not a guardian → `?error=not-a-guardian`, an over-long
      phone → `?error=invalid-phone`.
- [ ] Update `README.md` — the routes list (`README.md:27`) and the "what does not exist
      yet" line (`:37`), which currently names #5 explicitly.
- [ ] Update `AGENTS.md`'s Repository Structure note on `src/app/` to mention
      `/t/[teamId]/directory` and `/t/[teamId]/roster/returning`. Do **not** touch
      `.agents/app-brainstorm/` — it is a decision record.

## Pre-Commit Gate

From `AGENTS.md` § Commands:

- [ ] `pnpm check` (lint → typecheck → test) ✅
- [ ] `pnpm build` ✅

## Files Modified / Created

| File | Change |
|---|---|
| `src/lib/returning-players.ts` | **New.** Pure `planGuardianCascade`, `sortReturningCandidates`. |
| `src/lib/returning-players.test.ts` | **New.** |
| `src/lib/phone.ts` / `.test.ts` | **New.** `normalizePhone`. |
| `src/lib/directory-rules.ts` / `.test.ts` | **New.** `sortDirectory`. |
| `src/emails/added-to-team-email.ts` / `.test.ts` | **New.** Pure subject + URL builder. |
| `src/emails/AddedToTeamEmail.tsx` | **New.** Tokenless notice template. |
| `src/lib/roster.ts` | `listReturningCandidates`, `addReturningPlayer`, `phone` on `RosterEntryGuardian`. |
| `src/lib/memberships.ts` | `listDirectory`. |
| `src/lib/invitations.ts` | `setGuardianPhone`. |
| `src/app/t/[teamId]/roster/returning/page.tsx` / `.test.tsx` | **New.** Owner-only picker. |
| `src/app/t/[teamId]/roster/returning/actions.ts` / `.test.ts` | **New.** Cascade action. |
| `src/app/t/[teamId]/directory/page.tsx` / `.test.tsx` | **New.** Member directory. |
| `src/app/t/[teamId]/roster/actions.ts` | `setGuardianPhoneAction`. |
| `src/app/t/[teamId]/roster/actions.test.ts` | Phone action cases. |
| `src/app/t/[teamId]/roster/page.tsx` | Owner-only picker link; `?added=1` banner. |
| `src/app/t/[teamId]/roster/[entryId]/page.tsx` | Guardian phone input. |
| `src/app/t/[teamId]/page.tsx` | Directory link. |
| `README.md`, `AGENTS.md` | Route list and status refresh. |
