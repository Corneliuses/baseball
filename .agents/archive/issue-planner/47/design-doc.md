# Design Doc — Day-of reminders: email + push on the morning of any team activity (#47)

## Overview

Nothing reminds a family that today is game day. The RSVP-participation metric (≥70%
without being chased by text) depends on the app doing the nudging, so on the morning of
any event — games and practices — every guardian on the team gets a reminder email, and
guardians who opted into push get a push notification on top. Email is the channel of
record per Decision 8; push is an enhancement that must never gate it.

## Acceptance Criteria

- [ ] On the day of each game or practice, every guardian receives one reminder email in
      the morning, `APP_TIMEZONE`-correct
- [ ] Guardians with a registered push subscription also receive a push with a deep link
- [ ] A parent who never installs the PWA still gets full information by email
- [ ] Duplicate protection: a cron re-run does not double-send for the same event/guardian
- [ ] No reminder for events on archived teams

## Architecture & Data Model

### Data Layer

One new model, plus one additive migration:

```prisma
/// One reminder actually dispatched for one (event, guardian) pair — the
/// duplicate-protection ledger for the day-of cron (#47). A row is claimed
/// BEFORE the email goes out and released if the send fails, so a cron
/// re-run skips what already went and retries what didn't.
model ReminderReceipt {
  id      String   @id @default(cuid())
  eventId String
  userId  String
  sentAt  DateTime @default(now())

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([eventId, userId])
  @@index([userId])
}
```

- The `@@unique([eventId, userId])` constraint is the dedup mechanism itself — the
  invalid state (two reminders for one pair) is unrepresentable, matching how the schema
  already prefers constraints over checks.
- `onDelete: Cascade` both ways: a deleted event or user takes its receipts with it;
  receipts are operational bookkeeping, not history anyone reads.
- Migration is hand-written SQL (no live dev database in this environment), verified
  against the schema with `prisma migrate diff` per AGENTS.md, following the naming of
  `20260822120000_add_rsvp_recorded_by`.

`PushSubscription` already exists (currently unused) and is used as-is — no schema change
for push.

### API / Service Layer

| Endpoint / Function | Type | Auth | Purpose |
|---|---|---|---|
| `GET /api/cron/reminders` | Route Handler (Vercel Cron target) | `Authorization: Bearer ${CRON_SECRET}` | Daily job: find today's remaining events on non-archived teams, send one email (+ push) per guardian per event |
| `POST /api/push/subscription` | Route Handler | Session (signed-in user) | Register/refresh the caller's push subscription (upsert on `endpoint`) — the Route-Handler use case AGENTS.md sanctions |
| `DELETE /api/push/subscription` | Route Handler | Session (signed-in user) | Remove the caller's subscription for this browser |
| `buildReminderBatch` (`src/lib/reminders.ts`) | Pure function | — | Given today's events, rosters, guardians, and RSVP rows: the per-guardian-per-event payload list |
| `loadTodaysReminderWork`, `claimReminder`, `releaseReminder` (`src/lib/reminder-data.ts`) | Thin DB wrapper | — | Query + receipt ledger; the only Prisma-touching half |
| `sendEventReminderPush` (`src/lib/push.ts`) | Internal | — | web-push fan-out to a user's subscriptions; prunes on `404`/`410` |

Cron configuration is a new `vercel.json`:

```json
{ "crons": [{ "path": "/api/cron/reminders", "schedule": "0 12 * * *" }] }
```

`0 12 * * *` UTC = **7:00 AM CDT** during the baseball season (6:00 AM CST in winter —
Vercel cron cannot express a zone-anchored hour, and the one-hour DST drift is
acceptable for a "morning" reminder). Correctness never depends on the cron hour: the
handler computes "today" in `APP_TIMEZONE` itself.

### UI Component Tree (push opt-in, Phase 2)

- `src/app/profile/page.tsx` (server) — reads `VAPID_PUBLIC_KEY` from env and renders:
  - `PushOptInCard` (`src/components/PushOptInCard.tsx`, client) — a Card matching the
    page's existing Contact details card. States: unsupported (no `PushManager` /
    `Notification` in this browsing context — which on an iPhone means "not running as a
    Home Screen app", and the copy says so), permission denied, subscribed (with a turn-off
    button), and not subscribed (an explicit button, because permission must be requested
    from a user gesture and a declined prompt is effectively permanent — Decision 8).
    Detects the current subscription client-side via `pushManager.getSubscription()`.
- `public/sw.js` grows `push` and `notificationclick` handlers — the exact landing spot
  its own comment reserves. Still no `fetch` handler, still caches nothing.

## Key Decisions

### Decision 1: Two phases — email ships alone first

**Options considered:**
- Option A: Build email + push together, one PR.
- Option B: Phase 1 email (cron, template, dedup ledger), Phase 2 push (web-push, sw
  handlers, registration route, opt-in UI), layered into the same cron loop.

**Decision:** Option B.
**Rationale:** The issue itself sequences it this way, and Decision 8 declares email the
channel of record with push a layered enhancement that must never gate it. Phase 1 is
independently shippable and satisfies ACs 1, 3, 4, 5; Phase 2 adds AC 2. Push is also the
stack's declared innovation token (unfamiliar territory), so isolating it keeps the
reviewable, testable email half from being hostage to VAPID debugging.

### Decision 2: Dedup is claim-first with release-on-failure

**Options considered:**
- Option A: Send, then record the receipt. A crash between send and record double-sends
  on re-run.
- Option B: Claim the receipt (insert; unique violation → skip), then send; delete the
  claim if the send fails so a re-run retries it.

**Decision:** Option B.
**Rationale:** The AC is explicitly "a cron re-run does not double-send", so the failure
mode to eliminate is the duplicate, not the rare missed send (a crash in the instant
between claim and send loses one reminder — recoverable by a manual note, where a
double-send is unrecoverable noise that trains parents to ignore the app). The unique
constraint does the actual work, so two overlapping cron invocations race safely at the
database rather than in application logic. The unique-violation detection duck-types
`P2002` the way `roster-rules.ts` already does, for the same generated-client reason.

### Decision 3: Recipients are guardians via the roster, not team members

**Options considered:**
- Option A: Email every `Membership` on the team.
- Option B: Email every distinct guardian of every player rostered on the team
  (`RosterEntry → Player → GuardianPlayer → User`).

**Decision:** Option B.
**Rationale:** The issue says "every guardian on the team", and the email's body includes
"their kids' current RSVP state" — a coach with no kid on the roster has no kids to
report and already lives in the schedule. A guardian with two kids on the team gets **one**
email per event listing both kids, not two emails — same one-per-household instinct as
Decision 15's step 4. One email per guardian **per event** (a doubleheader morning is two
emails), matching the issue's wording and keeping the receipt key simple.

### Decision 4: "Today" means today-in-`APP_TIMEZONE`, still ahead of now

**Options considered:**
- Option A: Query events in the UTC calendar day.
- Option B: Query `startsAt` in `[now, endOfDayInZone(now))`, where the new
  `endOfDayInZone` helper joins `calendar.ts`'s existing `startOfDayInZone`.

**Decision:** Option B.
**Rationale:** Option A is precisely the bug class `calendar.ts`'s module docstring
exists to prevent — a 7:30 PM Central game falls on the next UTC day. Lower-bounding at
`now` rather than start-of-day means a re-run at 3 PM (after a failed morning run) never
"reminds" anyone about the 9 AM game already played; the receipts ledger handles the
already-sent 11 AM game. The helper lives in `calendar.ts` beside its siblings so the
zone conversion stays in one file.

### Decision 5: Cron auth is `CRON_SECRET` bearer check

**Options considered:**
- Option A: Vercel's `CRON_SECRET` convention — the platform sends
  `Authorization: Bearer ${CRON_SECRET}` with each invocation; the handler compares and
  401s otherwise.
- Option B: A capability token in the URL, like the calendar feed.

**Decision:** Option A.
**Rationale:** It's the platform's documented convention for exactly this, it keeps the
secret out of URLs (which get logged), and unlike the calendar feed there is no
third-party client that can only do URLs. The handler runs as the system — no
`requireTeamAccess`, because no user is acting — so its queries carry the safety instead:
every event query filters `team.archivedAt: null` (AC 5), and nothing in the job writes
to any team-scoped table except the receipts ledger.

### Decision 6: Push rides the same claim, after the email

For each claimed (event, guardian) pair: email first, then push best-effort. A push
failure (or a guardian with no subscription — the overwhelmingly common case) never
releases the claim, never fails the run, and never gates the email — Decision 8's
architectural mitigation, verbatim. Subscriptions that come back `404`/`410` are deleted
in the same pass (Decision 8: "subscriptions expire and must be pruned").

### Decision 7: The VAPID public key reaches the browser as a prop, not `NEXT_PUBLIC_`

The profile page is already a server component; it reads `VAPID_PUBLIC_KEY` and passes it
to `PushOptInCard`. Avoids a build-time-inlined `NEXT_PUBLIC_` variable (the build must
stay secret-free per AGENTS.md) and keeps `.env.example`'s existing commented-out VAPID
entries as the single naming source — Phase 2 uncomments them.

## Security & Permissions

- **Cron route**: `CRON_SECRET` bearer comparison, 401 on mismatch or when the variable
  is unset (fail closed — an unset secret disables the route, it does not open it).
  Archived-team exclusion in the query. Recipient addresses come only from
  `GuardianPlayer` joins, never from request input.
- **Push registration route**: `getCurrentUser()` required; the subscription row is
  created for the session's user only. `DELETE` removes by `endpoint` **and**
  `userId`, so one user cannot unregister another's endpoint. Subscription JSON is
  Zod-validated (endpoint must be an `https:` URL; `p256dh`/`auth` non-empty strings)
  before it ever reaches Prisma.
- **Email content**: contact details stay staff-facing — the reminder shows a guardian
  only their own kids' names and RSVP states, nothing about other families.
- **No new proxy matcher entries**: `/api/*` is already outside `proxy.ts`'s matcher, and
  both new routes do their real auth server-side, consistent with "proxy is
  optimistic-only".

## Error Handling

- Per-recipient isolation in the cron loop, exactly like the bulk invite: one bad mailbox
  or one Prisma hiccup is counted and logged, the loop continues. The handler returns a
  JSON summary `{ sent, skipped, failed, pushed }` for the Vercel cron log.
- Failed email send → receipt released (Decision 2) so the next run retries.
- Push errors: `404`/`410` prune the subscription; anything else logs and continues.
- `sendEmail` already fails soft with a reason when `RESEND_API_KEY`/`EMAIL_FROM` are
  unset; the handler counts those as failures and releases claims, so a misconfigured
  deploy retries cleanly once fixed.
- The opt-in card wraps every `Notification`/`PushManager` access in feature checks —
  those globals don't exist in an iOS Safari tab, and the card must render the
  unsupported state, not crash.

## Testing Strategy

| Layer | Test Type | File(s) | Notes |
|---|---|---|---|
| Reminder derivation (pure) | Unit | `src/lib/reminders.test.ts` | Grouping per guardian per event, kids' RSVP states via `rsvp.ts`, two-kid households get one email, event with no rostered guardians produces nothing |
| Calendar helper | Unit | `src/lib/calendar.test.ts` | `endOfDayInZone` across a DST boundary and a late-evening UTC-rollover event |
| Email props builder (pure) | Unit | `src/emails/event-reminder-email.test.ts` | Subject carries team name prefix like `buildTeamMessageEmail`; event URL shape `/t/{teamId}/schedule/{eventId}` |
| Cron route | Unit (mocked db + `sendEmail`) | `src/app/api/cron/reminders/route.test.ts` | 401 without/with wrong bearer; 401 when `CRON_SECRET` unset; dedup skip on existing receipt; claim released on failed send; archived team excluded; follows `src/app/api/calendar/[token]/route.test.ts` patterns |
| Push fan-out | Unit (mocked `web-push`) | `src/lib/push.test.ts` | Prunes on 410, survives per-endpoint failure, no-op with zero subscriptions |
| Subscription route | Unit | `src/app/api/push/subscription/route.test.ts` | 401 signed out; Zod rejection; upsert on same endpoint; DELETE scoped to own userId |
| Opt-in card | Component | `src/components/PushOptInCard.test.tsx` | Unsupported / denied / subscribed / not-subscribed states; static imports per AGENTS.md |

## Config Changes

- [ ] Schema: new `ReminderReceipt` model + hand-written additive migration (Phase 1)
- [ ] `vercel.json` created with the daily cron entry (Phase 1)
- [ ] Environment variables: `CRON_SECRET` new in `.env.example` (Phase 1); existing
      commented-out VAPID entries uncommented (Phase 2). `.env.example`'s gitignore
      negation is untouched
- [ ] Dependencies: `web-push` + `@types/web-push` (Phase 2 only)

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| Cron re-run (manual or platform retry) double-sends | High | `ReminderReceipt` unique constraint; claim-first (Decision 2) |
| Late-evening event files under wrong day (`TZ=UTC`) | High | All day math through `calendar.ts` zone helpers (Decision 4) |
| Doubleheader / multi-event day | Med | One email per event by design; receipts keyed per event |
| Preview deploys share the production `DATABASE_URL` | Med | Vercel runs crons only for the production deployment, and the migration is additive; noted risk, no action |
| Cron misfires or Resend is down that morning | Med | Claims released on failure → a manual re-invocation (Vercel dashboard) retries only the unsent |
| Run outgrows the route timeout | Low | 600ms pacing shared with the other send loops, `maxDuration = 300`, and a per-run send cap with the same coupling comment AGENTS.md mandates for `MAX_ROWS` |
| iOS parent never installs the PWA → no push, silently, forever | Med | Decision 8's answer: email is the channel of record; opt-in card copy explains the install requirement |
| iOS standalone container may be signed out (unverified, #14/#60) | Med | Opt-in requires being signed in *inside* the installed app; if #14 confirms the split-container problem, push opt-in on iOS inherits #60's fix. Email unaffected |
| Push subscription expired | Low | Prune on `404`/`410` per Decision 8 |
| Guardian on two teams with events the same day | Low | Correct by construction: reminders are per event, each scoped to its own team's roster |
