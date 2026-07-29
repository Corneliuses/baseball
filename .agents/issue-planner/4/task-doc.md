# Task Doc — Phase 4: Roster, jersey numbers, guardians, and invitations (#4)

## Prerequisites

- [x] #3 (Teams, `/t/[teamId]` scoping, `requireTeamAccess`) — merged as PR #19.
- [ ] `pnpm install && pnpm db:generate` — `src/generated/prisma` is gitignored and the repo
      does not typecheck without it.
- [ ] A live Postgres URL (a Neon dev branch) in `DATABASE_URL`. Needed in Phase 1 to prove
      the `P2002` shape; the repo has never run a migration against real Postgres.
- [ ] A Resend domain with SPF/DKIM verified, and `RESEND_API_KEY` / `EMAIL_FROM` set.
      Needed only for Phase 3's manual send check.

---

## Phase 1 — Pure modules and data layer

- [ ] Create `src/lib/email-address.ts` exporting `normalizeEmail(raw: string): string`
      (trim + lowercase). Named export, no default.
- [ ] Write `src/lib/email-address.test.ts` — mixed case, surrounding whitespace, empty
      string, already-normalized input.
- [ ] Create `src/lib/invitation-token.ts` exporting `INVITATION_TTL_DAYS = 14`,
      `generateInvitationToken()` (32 bytes from `node:crypto` `randomBytes`, base64url),
      `invitationExpiresAt(now: Date): Date`, and
      `isLiveInvitation(invitation: { expiresAt: Date; acceptedAt: Date | null }, now: Date): boolean`.
- [ ] Write `src/lib/invitation-token.test.ts` — token is URL-safe and differs across calls;
      `isLiveInvitation` false when `acceptedAt` is set, false when `expiresAt` equals `now`
      exactly, true one millisecond earlier.
- [ ] Edit `src/lib/signin-gate.ts`: delete the private `isLive` (lines 78–85) and import
      `isLiveInvitation` from `./invitation-token`. Confirm `src/lib/signin-gate.test.ts`
      still passes untouched — it is the regression check on this refactor.
- [ ] Create `src/lib/absolute-url.ts` exporting
      `absoluteUrl(path: string, env: NodeJS.ProcessEnv): string`, preferring `AUTH_URL`,
      then `VERCEL_PROJECT_PRODUCTION_URL`, then `VERCEL_URL`, then
      `http://localhost:3000`. Bare Vercel hosts get an `https://` scheme.
- [ ] Write `src/lib/absolute-url.test.ts` — each precedence rung, trailing-slash base, path
      with and without a leading slash.
- [ ] Create `src/lib/roster-rules.ts` exporting `parseJerseyNumber(raw: unknown): number | null`
      (blank → null, range 0–99, non-integer rejected), `sortRoster(entries)` (jersey number
      ascending, unnumbered last, then name), and
      `rosterWriteFailure(error: unknown): "jersey-taken" | "already-rostered" | null`
      duck-typing `code === "P2002"` and substring-matching `meta.target` against both the
      constraint-name and column-array shapes.
- [ ] Write `src/lib/roster-rules.test.ts` — both `meta.target` shapes for each constraint,
      a `P2003` and a plain `Error` returning null, and the jersey parse table.
- [ ] Create `src/lib/email.ts` exporting `sendEmail({ to, subject, react })`. Read
      `RESEND_API_KEY` and `EMAIL_FROM` inside the function, not at module scope — mirror
      the `requireEnv` + lazy-config rationale in `src/auth.ts:17-18,26-32`. Return a
      discriminated `{ ok: true } | { ok: false; reason: string }` rather than throwing.
- [ ] Create `src/lib/roster.ts` with `getRoster(teamId)`, `getRosterEntry(teamId, entryId)`,
      `addPlayerToRoster(teamId, { name, dateOfBirth, jerseyNumber })` (nested `Player`
      create), `updateRosterEntry(teamId, entryId, { name, dateOfBirth, jerseyNumber })`,
      `removeRosterEntry(teamId, entryId)`. Reads swallow errors and return empty; writes
      propagate — copy the doc comment rationale from `src/lib/teams.ts:1-14`. **Every**
      `where` names `teamId`.
- [ ] Write `src/lib/roster.test.ts` mocking `./db` in the shape of
      `src/lib/invitations.test.ts:1-34`. Assert every query is `teamId`-scoped, that
      `addPlayerToRoster` writes only `name`/`dateOfBirth` to `Player`, and that
      `battingOrder`/`position` are never written.
- [ ] Extend `src/lib/invitations.ts` — do not rewrite it — with
      `createInvitation({ teamId, email, role })` (normalize the address; inside a
      `$transaction`, delete unaccepted invitations for that `(teamId, email)` then create
      one with a fresh token and `expiresAt`), `getInvitationByToken(token)` (selecting
      `teamId`, `email`, `role`, `expiresAt`, `acceptedAt`, and the team's `name`), and
      `listTeamInvitations(teamId)`.
- [ ] Add `linkGuardian({ teamId, playerId, email, name })` to `src/lib/invitations.ts` (or
      `roster.ts` — keep it wherever the `Membership` upsert lives, one file, not both):
      in a transaction, upsert `User` by normalized email, create `GuardianPlayer`, upsert
      `Membership` with `update: {}` and `create` role `PARENT`, and report whether the
      membership was newly created. Add `unlinkGuardian({ playerId, userId })` deleting the
      `GuardianPlayer` row **only**.
- [ ] Extend `src/lib/invitations.test.ts` with cases for the above. The existing
      `acceptInvitations` tests must pass unchanged — assert re-invite deletes then creates,
      and that the membership upsert's `update` is `{}`.
- [ ] Create `src/lib/memberships.ts` with `listTeamMembers(teamId)` and
      `setMemberRole(teamId, userId, role)`; `setMemberRole` rejects demoting the last
      OWNER on the team.
- [ ] Write `src/lib/memberships.test.ts` — the `where` names both `userId` and `teamId`;
      last-OWNER demotion rejected; a role change touches exactly one row.
- [ ] Run `pnpm db:migrate` against the Neon dev branch and, in `pnpm db:studio` or a
      scratch script, force each of the two `RosterEntry` collisions. **Record the actual
      `meta.target` value** and confirm `rosterWriteFailure` matches it — adjust the mapper
      and its test if it does not.

## Phase 2 — Roster UI

- [ ] Create `src/app/t/[teamId]/roster/page.tsx`. `requireTeamAccess(teamId, { intent: "read" })`
      in the page itself, `notFound()` on `TeamAccessError` — copy the shape of
      `src/app/t/[teamId]/page.tsx:19-32`. Render `sortRoster(await getRoster(teamId))`;
      show the add-player form and per-row edit links only when `role !== "PARENT"`.
- [ ] Create `src/app/t/[teamId]/roster/actions.ts` with `addPlayerAction`,
      `updateRosterEntryAction`, `removeRosterEntryAction`. Each: Zod-parse `FormData`,
      `requireTeamAccess(teamId, { intent: "write", minRole: "COACH" })`, call `src/lib/`,
      `unstable_rethrow(error)` **before** any error mapping, map through
      `rosterWriteFailure`, `revalidatePath("/t/[teamId]/roster", "page")`, redirect.
      Reuse the `extractTeamId` helper pattern from
      `src/app/t/[teamId]/settings/actions.ts:19-25`.
- [ ] Create `src/app/t/[teamId]/roster/[entryId]/page.tsx` — jersey, name, DOB, the
      guardian list with invitation status, an add-guardian form, unlink and remove buttons.
      Its own `requireTeamAccess` call.
- [ ] Add an `ERROR_MESSAGES` record to both pages covering `invalid-name`, `invalid-jersey`,
      `jersey-taken`, `already-rostered`, `access`, with a generic fallback — as
      `src/app/t/[teamId]/settings/page.tsx:20-23` does.
- [ ] Add a "Roster" link to `src/app/t/[teamId]/page.tsx`, visible to every member.
- [ ] Write `src/app/t/[teamId]/roster/page.test.tsx` following
      `src/app/t/[teamId]/settings/page.test.tsx` — renders entries in jersey order, hides
      edit controls for PARENT, shows the empty state.

## Phase 3 — Invitations and the accept flow

- [ ] Create `src/emails/InvitationEmail.tsx` — a `@react-email/components` template taking
      `{ teamName, acceptUrl, expiresAt }`. Named export. Plain, no images, one obvious
      button plus the URL as visible text for clients that strip links.
- [ ] Create `src/emails/invitation-email.ts` (or co-locate in the `.tsx`) exporting a pure
      `buildInvitationEmail({ teamName, token, env })` returning `{ subject, acceptUrl }`,
      built via `absoluteUrl`.
- [ ] Write `src/emails/InvitationEmail.test.ts` asserting the subject names the team and
      `acceptUrl` is `<base>/invite/<token>`. Do not assert rendered markup.
- [ ] Add `linkGuardianAction` and `resendInvitationAction` to
      `src/app/t/[teamId]/roster/actions.ts`: `minRole: "COACH"`, link the guardian, create
      the invitation, then `sendEmail`. On `{ ok: false }` redirect with `?error=email-failed`
      — **do not** roll back the rows (Decision 7).
- [ ] Create `src/app/invite/[token]/page.tsx` (unauthenticated — `proxy.ts`'s matcher is
      `/t/:path*`, leave `src/proxy.ts:48` alone). Load by token; `notFound()` when unknown;
      distinct copy for expired and already-accepted; for live, show the team name, the
      masked invited address, and a submit button.
- [ ] Create `src/app/invite/[token]/actions.ts` with `requestInvitationLinkAction`:
      re-load the invitation by token server-side, re-check `isLiveInvitation`, then
      `signIn("resend", { email: invitation.email, redirect: false })` and redirect to
      `/signin/check-email`. Take the address **from the row**, never from the form. Wrap in
      try/catch with `unstable_rethrow` first, following
      `src/app/signin/actions.ts:31-44`.
- [ ] Write `src/app/invite/[token]/page.test.tsx` covering live, expired, already-accepted,
      and unknown-token.
- [ ] Manual end-to-end check against the Neon dev branch and a real inbox: invite an
      address, receive the mail, click through, confirm `acceptedAt` is set and the
      `Membership` exists with the invited role. This is the only proof the Resend domain is
      actually verified.

## Phase 4 — Coach invitations and role changes

- [ ] Create `src/app/t/[teamId]/members/page.tsx` — `requireTeamAccess(teamId, { intent: "read", minRole: "OWNER" })`.
      Lists `listTeamMembers(teamId)` with roles, plus `listTeamInvitations(teamId)` pending
      rows.
- [ ] Create `src/app/t/[teamId]/members/actions.ts` with `inviteMemberAction` (Zod email +
      `Role`; `createInvitation` then `sendEmail`) and `setMemberRoleAction`. Both
      `{ intent: "write", minRole: "OWNER" }`.
- [ ] Confirm `setMemberRoleAction` writes one `Membership` for `(userId, teamId)` and
      nothing else — this is the surface where "roles never inherit across teams" gets
      broken by being helpful.
- [ ] Add a "Members" link to `src/app/t/[teamId]/settings/page.tsx`, owner-only.
- [ ] Write `src/app/t/[teamId]/members/page.test.tsx` — pending invitations render,
      role control present for other members and absent for the last owner.

## Documentation

- [ ] Add to `AGENTS.md` Repository Structure: `src/emails/` and the new `/t/[teamId]/roster`,
      `/t/[teamId]/members`, `/invite/[token]` routes.
- [ ] Add to `AGENTS.md` Gotchas: `RosterEntry`'s unique indexes surface as `P2002` and must
      be translated in `roster-rules.ts`, with the confirmed `meta.target` shape recorded.
- [ ] Verify `AUTH_URL` is documented in `.env.example`; add it if not, keeping the
      `!.env.example` gitignore negation intact.
- [ ] Do **not** edit `.agents/app-brainstorm/` — it is a decision record, and no decision is
      being revised here.

## Pre-Commit Gate

From `AGENTS.md` → Commands:

- [ ] `pnpm lint` ✅
- [ ] `pnpm typecheck` ✅
- [ ] `pnpm test` ✅
- [ ] `pnpm check` (all three) ✅
- [ ] `pnpm build` ✅

## Files Modified / Created

| File | Change |
|---|---|
| `src/lib/email-address.ts` (+ test) | New — `normalizeEmail` |
| `src/lib/invitation-token.ts` (+ test) | New — token generation, TTL, `isLiveInvitation` |
| `src/lib/absolute-url.ts` (+ test) | New — invitation link base URL |
| `src/lib/roster-rules.ts` (+ test) | New — jersey parsing, sorting, `P2002` translation |
| `src/lib/email.ts` | New — Resend sender, reused by #13 |
| `src/lib/roster.ts` (+ test) | New — team-scoped roster reads and writes |
| `src/lib/memberships.ts` (+ test) | New — member list and role changes |
| `src/lib/invitations.ts` | Extended — create/lookup/list, guardian linking |
| `src/lib/invitations.test.ts` | Extended — existing cases untouched |
| `src/lib/signin-gate.ts` | `isLive` replaced by the shared `isLiveInvitation` |
| `src/emails/InvitationEmail.tsx` (+ test) | New — React Email template |
| `src/app/t/[teamId]/roster/page.tsx` (+ test) | New — roster list |
| `src/app/t/[teamId]/roster/actions.ts` | New — roster and guardian mutations |
| `src/app/t/[teamId]/roster/[entryId]/page.tsx` | New — player detail and guardians |
| `src/app/t/[teamId]/members/page.tsx` (+ test) | New — members and pending invitations |
| `src/app/t/[teamId]/members/actions.ts` | New — invite by role, change role |
| `src/app/invite/[token]/page.tsx` (+ test) | New — token landing page |
| `src/app/invite/[token]/actions.ts` | New — sends the magic link |
| `src/app/t/[teamId]/page.tsx` | Roster link |
| `src/app/t/[teamId]/settings/page.tsx` | Members link |
| `AGENTS.md`, `.env.example` | Structure, gotcha, `AUTH_URL` |
| `prisma/schema.prisma` | **Unchanged — no migration** |
| `src/proxy.ts` | **Unchanged — `/invite` is correctly outside the matcher** |
