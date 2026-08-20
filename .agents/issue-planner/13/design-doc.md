# Design Doc — Phase 13: Email messaging (#13)

## Overview

The coach broadcasts to all parents in one click or targets an individual parent; parents
message all coaches at once. Email is this app's channel of record (Decision 7; push is
deferred past MVP by Decision 8), so this phase is what replaces the coach's group text.

## Acceptance Criteria

From the issue, plus three clarifications confirmed with the owner on 2026-08-20:

- [ ] `Message` creation is scoped to the team, recording `senderId`, `subject`, `body`
- [ ] Coach → all parents broadcast, recipients resolved from `Membership(role: PARENT)` on that team
- [ ] Coach → individual parent
- [ ] Parent → all coaches (OWNER and COACH memberships on that team)
- [ ] **No parent-to-parent path anywhere** — parents reach coaches as a group, that is all
- [ ] React Email templates, sent via Resend, reusing the #4 email setup
- [ ] Message list view for the team
- [ ] `src/lib/messages.ts` holds recipient-resolution logic as a pure, tested function
- [ ] `pnpm check` green; `pnpm build` green

**Clarifications (owner decisions, 2026-08-20):**

1. **The message list is COACH+ only**, like `/directory`. Parents get a
   compose-to-coaches form but no history view — their record is their own inbox.
2. **Only coach → all-parents broadcasts persist as `Message` rows.** Individual and
   parent→coaches sends are email-only. The list is therefore unambiguously "team
   announcements", and the schema needs no audience column (no migration).
3. **Outbound emails set `Reply-To` to the sender's account email**, so replies continue
   as ordinary person-to-person email.

## Architecture & Data Model

### Data Layer

No schema change. `Message` (prisma/schema.prisma:237–250) already exists:
`id, teamId, senderId, subject, body, sentAt`, with `@@index([teamId, sentAt])` for the
list query and a non-cascading `sender` relation. Only broadcasts write rows.

### API / Service Layer

Server Actions only, per the app's architecture — no route handlers needed.

| Function | Type | Auth | Purpose |
|---|---|---|---|
| `resolveRecipients` (`src/lib/messages.ts`) | Pure | n/a | Role→audience matrix + recipient list from members; the tested core |
| `createMessage` (`src/lib/messages.ts`) | DB wrapper | called after `requireTeamAccess` | Insert one `Message` row (broadcasts only) |
| `listMessages` (`src/lib/messages.ts`) | DB wrapper | called after `requireTeamAccess` | Broadcast history, `sentAt` desc, with sender name |
| `sendTeamMessageAction` (`messages/new/actions.ts`) | Server Action | `requireTeamAccess(intent:"write")`; minRole varies by audience | Validate, resolve recipients, persist (broadcast only), fan out paced sends |
| `buildTeamMessageEmail` (`src/emails/team-message-email.ts`) | Pure | n/a | Subject line + team URL for the template |

**The role→audience matrix, enforced in the pure function:**

| Sender role | `ALL_PARENTS` | `INDIVIDUAL_PARENT` | `ALL_COACHES` |
|---|---|---|---|
| OWNER / COACH | ✅ | ✅ (target must hold a PARENT membership on this team) | ❌ (out of scope) |
| PARENT | ❌ | ❌ | ✅ |

`resolveRecipients` is where "no parent-to-parent path" becomes a tested invariant rather
than a UI courtesy: a PARENT sender can never yield a PARENT recipient, whatever the
submitted form claims.

### UI

- `/t/[teamId]/messages` (`page.tsx`) — COACH+: broadcast history plus a "New message"
  link; PARENT: redirect to `/messages/new`.
- `/t/[teamId]/messages/new` (`page.tsx`) — compose form. COACH+ picks the audience
  (all parents, or one parent from a server-rendered select of PARENT members); PARENT
  sees a fixed "All coaches" audience. Declares `export const maxDuration = 60` — the
  page, not the action, governs the Server Action's timeout (same as `roster/invite`).
- `TeamNav` gains a `Messages` tab for **all roles** — parents need the path to reach
  the coaches.

## Key Decisions

### Decision 1: Persist broadcasts only; no audience column

**Options considered:**
- A: Persist every send; list can't distinguish a broadcast from a 1:1 note
- B: Persist broadcasts only; 1:1 and parent→coaches are email-only
- C: Add an audience column via migration

**Decision:** B (owner's call).
**Rationale:** The schema deliberately records no audience, and AGENTS.md says the schema
already covers every planned feature; a migration would also need a live Neon branch URL.
B keeps the list semantically clean ("announcements") without a schema change, and a 1:1
message's record is the recipient's inbox — consistent with this app's email-first stance.

### Decision 2: One server action for all three audiences

**Options considered:**
- A: Three actions (broadcast / individual / to-coaches)
- B: One `sendTeamMessageAction` with an `audience` field, validated by the pure resolver

**Decision:** B.
**Rationale:** The security-relevant branching (who may address whom) lives in
`resolveRecipients`, which is pure and exhaustively testable — exactly the
`checkTeamAccess`/`requireTeamAccess` split this repo already uses. Three actions would
smear that matrix across three files. The action still applies `minRole: "COACH"` for the
coach audiences before touching recipients, and `intent: "write"` always, so archived
teams reject every send (issue requirement) — including the non-persisting ones.

### Decision 3: Per-recipient paced sends, never a shared To/CC line

**Options considered:**
- A: One email with all recipients in To/BCC
- B: One email per recipient, paced 600ms apart (the `bulkInviteGuardiansAction` pattern)

**Decision:** B.
**Rationale:** A shared To line leaks every parent's address to every other parent —
precisely the contact-details-are-staff-facing rule the directory enforces. BCC avoids
that but makes per-recipient failure invisible. The paced loop is already proven in
`roster/invite/actions.ts` against Resend's 2 req/s limit: ~25 parents × 600ms ≈ 15s,
well inside the page's `maxDuration = 60`. A `MAX_RECIPIENTS = 50` guard (50 × 600ms =
30s) keeps the loop bounded the way `MAX_ROWS` does, and the same coupling warning from
AGENTS.md applies: raise any of the three numbers only together.

### Decision 4: `Reply-To` is the sender's account email

**Decision:** Extend `sendEmail` with an optional `replyTo`, set to the sender's email
(owner's call).
**Rationale:** Mail goes out from `EMAIL_FROM` (the verified domain), so without
Reply-To, a parent replying to a broadcast mails a void. Exposure is already sanctioned
in both directions: parents see coach emails via the coaching-staff contact card, and
coaches see parent emails via the directory. No parent ever learns another parent's
address (Decision 3 above).

### Decision 5: Broadcast row is written before the fan-out

**Decision:** `createMessage` runs before the send loop; per-recipient failures are
counted and reported, mirroring how an `Invitation` row survives a failed send.
**Rationale:** The row records what the coach said and when — the coach's copy — and a
partially failed fan-out (rows 1–20 sent, Resend hiccup on 21) must not erase the
record of the 20 that went out. The result banner reports `sent`/`failed` counts.

## Security & Permissions

- Every page loader and the action call `requireTeamAccess` first (never only the layout).
- List page: `minRole: "COACH"`, `intent: "read"`. Compose page: `intent: "read"`,
  any role (the form adapts). Action: `intent: "write"` always; `minRole: "COACH"`
  enforced when the audience is `ALL_PARENTS` or `INDIVIDUAL_PARENT`.
- Recipients resolve **only** from `Membership` rows for the URL's `teamId`, via
  `listTeamMembers(teamId)` — never a global user list. The individual target arrives as
  a `userId` in the form, but is trusted only if it matches a PARENT membership on this
  team (same never-trust-the-form stance as `roster/invite` re-resolving entries).
- Archived teams reject all sends via `intent: "write"`.
- No parent-to-parent path: enforced in `resolveRecipients` (tested), not just hidden in the UI.

## Error Handling

- Validation failures (empty subject/body, over-length, bad audience) → redirect back
  with `?error=...`, the repo's established pattern.
- Zero resolvable recipients (e.g. no parents yet) → clean `?error=no-recipients`, no row written.
- Per-recipient send failures are counted, never thrown: one bad mailbox must not lose
  the rest of the broadcast. Result surfaces as `?sent=N&failed=M`.
- `TeamAccessError` → `?error=access` redirect; database errors propagate (fail closed).
- `sendEmail` already degrades cleanly when `RESEND_API_KEY`/`EMAIL_FROM` are unset.

## Testing Strategy

| Layer | Test Type | File(s) | Notes |
|---|---|---|---|
| Recipient resolution | Unit (pure) | `src/lib/messages.test.ts` | Full matrix: every role × audience, sender exclusion, non-member / non-PARENT individual target rejected, empty-recipient case, **parent can never reach a parent** |
| Email builder | Unit (pure) | `src/emails/team-message-email.test.ts` | Subject and team URL, mirroring `added-to-team-email.test.ts` |
| Email wrapper | Unit | `src/lib/email.test.ts` (new) | `replyTo` passed through to Resend; omitted when absent |
| Server action | Unit (mocked libs) | `src/app/t/[teamId]/messages/new/actions.test.ts` | Mirrors `roster/invite/actions.test.ts`: access, validation, persistence-only-for-broadcast, pacing loop, failure counting |
| Pages | Component | `messages/page.test.tsx`, `messages/new/page.test.tsx` | Role forks: coach list vs parent redirect; audience controls per role |
| Nav | Unit | `src/components/TeamNav.test.tsx` (update) | Messages tab present for every role |

## Config Changes

- [ ] Schema / index changes — **none** (Decision 1; `@@index([teamId, sentAt])` already serves the list)
- [ ] Access rule changes — none beyond per-page `requireTeamAccess` calls
- [ ] Environment variables — none new; `RESEND_API_KEY` / `EMAIL_FROM` already documented in `.env.example`
- [ ] Dependency changes — none (`resend`, `@react-email/components`, `zod` all present)

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| Unverified sending domain → silent spam-foldering | High | Operational, not code: `EMAIL_FROM` warning already in `.env.example`; #9's validation weekend confirmed invitations arrive |
| Resend 429s mid-broadcast | Med | 600ms pacing (proven in bulk invite); failures counted and reported, row already persisted |
| Batch outliving the action timeout | Med | `maxDuration = 60` on the compose page + `MAX_RECIPIENTS = 50` cap (30s of pacing max) |
| Forged POST targeting a non-member or a coach as "individual parent" | High | `resolveRecipients` accepts only a PARENT membership on this `teamId`; tested |
| Parent addresses leaking to other parents | High | Per-recipient sends; Reply-To only ever exposes the sender's own address |
| Team with no parents / no coaches yet | Low | `no-recipients` error before any write or send |
| Archived team | Low | `intent: "write"` on every send path |
| Sender deleted later (`sender` has no cascade) | Low | `listMessages` selects sender name via the relation; rows survive because deletion is restricted by the FK — nothing to handle in this phase |
