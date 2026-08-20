# Task Doc — Phase 13: Email messaging (#13)

## Prerequisites

- [x] #9 (Validation gate) — closed as completed 2026-08-01
- [x] Owner decisions recorded in design-doc.md: coach-only list, broadcasts-only
      persistence, Reply-To = sender

## Phase 1: Domain & email plumbing (pure, DB-free where possible)

- [ ] Add `replyTo?: string` to `SendEmailInput` in `src/lib/email.ts`, passed through to
      `resend.emails.send` (Resend's field is `replyTo`); omit when absent
- [ ] Add `src/lib/email.test.ts` covering the pass-through and the omission
- [ ] Create `src/lib/messages.ts`:
      - `MessageAudience` = `"ALL_PARENTS" | "INDIVIDUAL_PARENT" | "ALL_COACHES"`
      - Pure `resolveRecipients({ audience, senderRole, senderUserId, targetUserId?, members })`
        returning `{ ok: true; recipients } | { ok: false; reason }` — enforces the
        role→audience matrix, team-scoped individual target (must be a PARENT member),
        sender exclusion, and non-empty recipients. `members` is the
        `TeamMember[]` shape from `src/lib/memberships.ts`
      - Zod schemas: subject (trimmed, 1–200 chars), body (trimmed, 1–5000 chars)
      - DB wrappers (thin, following `memberships.ts` style): `createMessage(teamId,
        senderId, subject, body)` and `listMessages(teamId)` (order `sentAt` desc,
        select sender `name`/`email`)
- [ ] Write `src/lib/messages.test.ts` — the full matrix from design-doc.md's Testing
      Strategy, including the parent-can-never-reach-a-parent invariant
- [ ] Create `src/emails/team-message-email.ts` — pure `buildTeamMessageEmail({ teamName,
      subject, teamId, env })` → `{ subject: "[<teamName>] <subject>", teamUrl }`,
      mirroring `src/emails/added-to-team-email.ts`
- [ ] Write `src/emails/team-message-email.test.ts`
- [ ] Create `src/emails/TeamMessageEmail.tsx` — plain React Email template in the
      `InvitationEmail.tsx` style: sender name + team name, `pre-wrap` body, link to the
      team home; no images

## Phase 2: Server action, pages, nav

- [ ] Create `src/app/t/[teamId]/messages/new/actions.ts` — `sendTeamMessageAction`:
      1. Parse `teamId`, `audience`, optional `targetUserId`, `subject`, `body`
      2. `requireTeamAccess(teamId, { intent: "write", minRole: audience === "ALL_COACHES" ? "PARENT" : "COACH" })`
      3. `listTeamMembers(teamId)` → `resolveRecipients(...)`; redirect `?error=...` on failure
      4. `MAX_RECIPIENTS = 50` guard; `MIN_SEND_INTERVAL_MS = 600` pacing constant
         (document the coupling with `maxDuration`, as `roster/invite/actions.ts` does)
      5. Broadcast only: `createMessage(...)` before the loop
      6. Paced per-recipient `sendEmail` loop with `replyTo` = sender's email, counting
         `sent`/`failed`; per-recipient failures never abort the loop
      7. `revalidatePath` the messages list; redirect with `?sent=&failed=` params
- [ ] Write `src/app/t/[teamId]/messages/new/actions.test.ts` (pattern:
      `roster/invite/actions.test.ts`)
- [ ] Create `src/app/t/[teamId]/messages/new/page.tsx` — compose form;
      `export const maxDuration = 60` with the roster/invite comment about it governing
      the action's timeout; COACH+ gets audience radio (all parents / one parent select
      built from `listTeamMembers` PARENT rows); PARENT gets fixed "All coaches";
      result/error banners from search params
- [ ] Write `src/app/t/[teamId]/messages/new/page.test.tsx`
- [ ] Create `src/app/t/[teamId]/messages/page.tsx` — `requireTeamAccess` read; PARENT →
      `redirect` to `messages/new`; COACH+ → broadcast history via `listMessages` +
      "New message" link
- [ ] Write `src/app/t/[teamId]/messages/page.test.tsx`
- [ ] Add `{ href: `${base}/messages`, label: "Messages" }` to the base items in
      `src/components/TeamNav.tsx` (all roles)
- [ ] Update `src/components/TeamNav.test.tsx` for the new tab

## Pre-Commit Gate

Per AGENTS.md `## Commands`:

- [ ] `pnpm check` (lint → typecheck → test) ✅
- [ ] `pnpm exec next build` ✅ (bare `pnpm build` needs `DATABASE_URL` for
      `prisma migrate deploy`; no schema change here, so the migration step is moot —
      use the documented no-database build)

## Files Modified / Created

| File | Change |
|---|---|
| `src/lib/email.ts` | Add optional `replyTo` pass-through |
| `src/lib/email.test.ts` | New — wrapper tests |
| `src/lib/messages.ts` | New — pure recipient resolution + schemas + DB wrappers |
| `src/lib/messages.test.ts` | New — resolution matrix tests |
| `src/emails/team-message-email.ts` | New — pure subject/URL builder |
| `src/emails/team-message-email.test.ts` | New — builder tests |
| `src/emails/TeamMessageEmail.tsx` | New — React Email template |
| `src/app/t/[teamId]/messages/page.tsx` | New — coach-only broadcast list; parent redirect |
| `src/app/t/[teamId]/messages/page.test.tsx` | New |
| `src/app/t/[teamId]/messages/new/page.tsx` | New — compose form, `maxDuration = 60` |
| `src/app/t/[teamId]/messages/new/page.test.tsx` | New |
| `src/app/t/[teamId]/messages/new/actions.ts` | New — `sendTeamMessageAction` |
| `src/app/t/[teamId]/messages/new/actions.test.ts` | New |
| `src/components/TeamNav.tsx` | Add Messages tab |
| `src/components/TeamNav.test.tsx` | Cover Messages tab |
