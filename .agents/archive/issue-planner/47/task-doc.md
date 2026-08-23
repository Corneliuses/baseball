# Task Doc — Day-of reminders: email + push on the morning of any team activity (#47)

## Prerequisites

- [ ] None for Phase 1. Phase 2's stated dependency (PWA install: manifest, icons,
      service worker) has already landed — `src/app/manifest.ts`, `public/sw.js`,
      `PwaRegistrar`, `InstallPrompt` all exist.

## Phase 1: Email reminders — cron, dedup ledger, template

- [ ] Add `ReminderReceipt` to `prisma/schema.prisma` (fields and comment per
      design-doc.md), plus back-relations on `Event` and `User`
- [ ] Hand-write `prisma/migrations/<timestamp>_add_reminder_receipt/migration.sql`
      (CREATE TABLE, unique index on `(eventId, userId)`, index on `userId`, FKs with
      `ON DELETE CASCADE`), verify against the schema with `prisma migrate diff`, then
      `pnpm db:generate`
- [ ] Add `endOfDayInZone(instant: Date): Date` to `src/lib/calendar.ts` beside
      `startOfDayInZone`; tests in `src/lib/calendar.test.ts` (DST day, late-evening
      UTC-rollover event)
- [ ] Create `src/lib/reminders.ts` (pure, DB-free): types for the loaded shape
      (event + team, roster entries with player + guardians, RSVP rows) and
      `buildReminderBatch(...)` returning one payload per (guardian, event) —
      guardian email/name, event fields, and that guardian's kids with states derived
      via `deriveRsvpState` from `src/lib/rsvp.ts`
- [ ] Write `src/lib/reminders.test.ts`: two kids one household → one payload listing
      both; guardian on two rostered kids across two events → one payload per event;
      no-response default; event with no guardians → empty
- [ ] Create `src/lib/reminder-data.ts` (thin Prisma wrapper):
      `loadTodaysReminderWork(now)` — events with `startsAt` in
      `[now, endOfDayInZone(now))` and `team: { archivedAt: null }`, including team,
      RSVPs, and roster → player → guardians → user; `claimReminder(eventId, userId)` —
      `create` returning claimed/duplicate, duck-typing `P2002` the way
      `src/lib/roster-rules.ts` does; `releaseReminder(eventId, userId)` — best-effort
      delete
- [ ] Create `src/emails/event-reminder-email.ts` (pure props builder): subject
      `[TeamName] Today: Game vs Hawks, 5:30 PM` (practice: `Today: Practice, 5:30 PM`),
      event URL via `absoluteUrl(\`/t/${teamId}/schedule/${eventId}\`, env)`; time
      formatting via `formatEventTime` / `formatEventDayLabel` from `src/lib/calendar.ts`
- [ ] Write `src/emails/event-reminder-email.test.ts` (mirror
      `team-message-email.test.ts`)
- [ ] Create `src/emails/EventReminderEmail.tsx`: plain like `TeamMessageEmail.tsx` —
      type/opponent, time, location, notes, per-kid RSVP state lines, event-page link
- [ ] Create `src/app/api/cron/reminders/route.ts`: `GET` handler exporting
      `maxDuration = 300`; 401 unless `Authorization === \`Bearer ${CRON_SECRET}\``
      **and** `CRON_SECRET` is set; load → build batch → per payload: claim, skip on
      duplicate, `sendEmail`, release claim on failure; 600ms `MIN_SEND_INTERVAL_MS`
      pacing (same remainder-only wait as `bulkInviteGuardiansAction`); per-run send cap
      (200) with the AGENTS.md-style coupling comment against `maxDuration`; return JSON
      `{ sent, skipped, failed }`
- [ ] Write `src/app/api/cron/reminders/route.test.ts` (mock `@/lib/reminder-data`,
      `@/lib/email`; pattern from `src/app/api/calendar/[token]/route.test.ts`): auth
      cases, dedup skip, release-on-failure, pacing constants sanity
- [ ] Create `vercel.json`: `{ "crons": [{ "path": "/api/cron/reminders", "schedule": "0 12 * * *" }] }`
- [ ] Add `CRON_SECRET` to `.env.example` with a comment (Vercel sends it as a bearer
      token on cron invocations; generate like `AUTH_SECRET`) — keep the `!.env.example`
      gitignore negation intact
- [ ] Update `AGENTS.md`: the cron route joins the "sends in a loop" inventory and its
      constant-coupling note; mention the receipts ledger in one line

## Phase 2: Push — web-push, service worker, registration route, opt-in UI

- [ ] `pnpm add web-push` and `pnpm add -D @types/web-push`; generate VAPID keys
      (`pnpm exec web-push generate-vapid-keys`) for the operator; uncomment/fill the
      VAPID entries in `.env.example` (public key, private key, subject `mailto:`)
- [ ] Create `src/lib/push.ts`: `sendEventReminderPush(userId, payload)` — load the
      user's `PushSubscription` rows, `webpush.sendNotification` each with VAPID details
      read lazily like `src/lib/email.ts`; delete rows on `WebPushError` status 404/410;
      log-and-continue on anything else; no-op cleanly when VAPID env is unset
- [ ] Write `src/lib/push.test.ts` with `vi.mock("web-push")`
- [ ] Create `src/lib/push-subscription.ts` (pure): Zod schema for the browser's
      `PushSubscription.toJSON()` shape — `https:` endpoint URL, non-empty
      `keys.p256dh` / `keys.auth`; co-located test `src/lib/push-subscription.test.ts`
- [ ] Create `src/app/api/push/subscription/route.ts`: `POST` — `getCurrentUser()` or
      401, validate body, upsert on `endpoint` (re-registration moves an endpoint to the
      current user); `DELETE` — remove by endpoint **and** `userId`; plus
      `src/app/api/push/subscription/route.test.ts`
- [ ] Extend `public/sw.js`: `push` handler (`event.waitUntil(showNotification(...))`
      with title/body/data.url from the JSON payload) and `notificationclick`
      (focus-or-open `event.notification.data.url`); still no `fetch` handler, still no
      caching — keep the file's comment accurate
- [ ] Create `src/components/PushOptInCard.tsx` (client) with the four states from
      design-doc.md; subscribe flow: `Notification.requestPermission()` from the button
      gesture → `registration.pushManager.subscribe({ userVisibleOnly: true,
      applicationServerKey })` → `POST /api/push/subscription`; unsubscribe reverses both
- [ ] Write `src/components/PushOptInCard.test.tsx` (static imports per AGENTS.md)
- [ ] Wire the card into `src/app/profile/page.tsx`, passing `VAPID_PUBLIC_KEY` (render
      the card only when the key is configured); update `src/app/profile/page.test.tsx`
- [ ] Cron route: after a successful email for a claimed pair, call
      `sendEventReminderPush` best-effort — push failure never releases the claim and
      never fails the run; deep link in the payload is the event page URL; add `pushed`
      to the JSON summary and cover it in `route.test.ts`

## Pre-Commit Gate

Per AGENTS.md `## Commands` (and CI in `.github/workflows/ci.yml`):

- [ ] `pnpm check` (lint → typecheck → test) ✅
- [ ] `pnpm exec next build` (never `pnpm build` off-Vercel — the package script would
      run `prisma migrate deploy` against the shared `DATABASE_URL`) ✅

## Files Modified / Created

| File | Change |
|---|---|
| `prisma/schema.prisma` | `ReminderReceipt` model + back-relations |
| `prisma/migrations/<ts>_add_reminder_receipt/migration.sql` | Hand-written additive migration |
| `src/lib/calendar.ts` / `calendar.test.ts` | `endOfDayInZone` helper + tests |
| `src/lib/reminders.ts` / `reminders.test.ts` | Pure reminder-batch derivation + tests |
| `src/lib/reminder-data.ts` | Query + receipt claim/release wrapper |
| `src/emails/event-reminder-email.ts` / `.test.ts` | Pure props builder + tests |
| `src/emails/EventReminderEmail.tsx` | Reminder template |
| `src/app/api/cron/reminders/route.ts` / `route.test.ts` | Cron handler + tests |
| `vercel.json` | New — daily cron entry |
| `.env.example` | `CRON_SECRET`; VAPID entries uncommented (Phase 2) |
| `AGENTS.md` | Send-loop inventory + receipts ledger note |
| `package.json` | `web-push`, `@types/web-push` (Phase 2) |
| `src/lib/push.ts` / `push.test.ts` | web-push fan-out + prune (Phase 2) |
| `src/lib/push-subscription.ts` / `.test.ts` | Subscription payload schema (Phase 2) |
| `src/app/api/push/subscription/route.ts` / `route.test.ts` | Registration route (Phase 2) |
| `public/sw.js` | `push` + `notificationclick` handlers (Phase 2) |
| `src/components/PushOptInCard.tsx` / `.test.tsx` | Opt-in UI (Phase 2) |
| `src/app/profile/page.tsx` / `page.test.tsx` | Card wiring (Phase 2) |
