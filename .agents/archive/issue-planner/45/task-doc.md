# Task Doc — Email parents when a new event is added to the schedule (#45)

## Prerequisites

- [ ] None. No blocking issue, no migration, no new environment variable. #47 (day-of
      reminders) is already merged and is the pattern being followed.
- [ ] `pnpm install && pnpm db:generate` on a fresh clone — `src/generated/prisma` is
      gitignored and nothing typechecks without it.

---

## Phase 1: Pure modules and data access

Everything here is DB-free or a thin query, and everything is testable without touching the
action. Land this first — it is the half that carries the ACs.

### 1a — Share the guardian loader

- [ ] Create `src/lib/guardians.ts` and move `loadRostersByTeamId` into it verbatim as
      `loadGuardianRostersByTeamId(teamIds: readonly string[])`, keeping its
      `orderBy: [{ jerseyNumber: "asc" }, { createdAt: "asc" }]` (stable kid order) and its
      returned shape `{ playerId, playerName, guardians: [{ userId, email, name }] }`
- [ ] Add `listTeamGuardians(teamId: string)` to `src/lib/guardians.ts` — single-team
      wrapper over the above
- [ ] Delete the private `loadRostersByTeamId` from `src/lib/reminder-data.ts` and import the
      shared one; leave `loadTodaysReminderWork`'s signature and behaviour untouched
- [ ] Write `src/lib/guardians.test.ts` — grouping by `teamId`, guardians attached per
      player, mocked `db` (copy the mock style from `src/lib/reminder-data.test.ts`)
- [ ] Run `pnpm test src/app/api/cron/reminders` — the cron suite is the regression test for
      this move and must be green before going further

### 1b — The announcement decision module

- [ ] Create `src/lib/announcements.ts` with a module comment explaining that it is the pure
      half (per AGENTS.md) and that recipients come from the roster, never `Membership`
- [ ] Export `type AnnouncementRecipient = { userId: string; email: string; name: string | null }`
- [ ] Export `buildAnnouncementRecipients(roster)` — dedupe on `userId` (insertion-ordered
      `Map`, so roster order is preserved), skip guardians whose `email` is empty
- [ ] Export `shouldAnnounceEvent(startsAt: Date, now: Date): boolean` — `startsAt > now`,
      with a comment pointing at Decision 4 and noting the silent-skip cost
- [ ] Write `src/lib/announcements.test.ts` — two-kid household collapses to one recipient
      (AC8); empty email dropped; deterministic ordering; `shouldAnnounceEvent` boundary
      including `startsAt === now` (AC6)

### 1c — The email

- [ ] In `src/emails/event-reminder-email.ts`, promote `buildHeadline` to an exported
      `buildEventHeadline(type, opponent)` and update its internal caller — no behaviour
      change, so `event-reminder-email.test.ts` must stay green untouched
- [ ] Create `src/emails/event-announcement-email.ts`: pure builder
      `buildEventAnnouncementEmail({ teamName, teamId, eventId, type, startsAt, opponent, env })`
      returning `{ subject, headline, dateTimeLabel, eventUrl }`
      - subject: `` `[${teamName}] New ${type === "GAME" ? "game" : "practice"}: ${dateTimeLabel}${opponent ? ` vs ${opponent}` : ""}` ``
      - `dateTimeLabel` via `formatEventDateTime` from `@/lib/calendar` — **never**
        `toLocaleString` or bare date-fns (AC2)
      - `eventUrl` via `absoluteUrl(\`/t/${teamId}/schedule/${eventId}\`, env)` — the event
        page, because the announcement's one action is answering
- [ ] Create `src/emails/EventAnnouncementEmail.tsx` — plain like `EventReminderEmail`:
      `Preview`, headline, team + date-time line, `Where:` when location is set, `Notes:`
      with `whiteSpace: "pre-wrap"` when set, then the CTA `Link`. No roster, no attendance,
      no other family's details
- [ ] Write `src/emails/event-announcement-email.test.ts` (AC5) — game with and without an
      opponent, practice, absolute URL construction, and a late-evening Central `startsAt`
      formatting to the Central day while the test process runs `TZ=UTC` (AC2)

---

## Phase 2: Wire it into event creation

- [ ] In `src/app/t/[teamId]/schedule/actions.ts`, add module constants beside the existing
      ones, each with the comment the other two loops carry:
      - `const MAX_RECIPIENTS = 30` — matches `MAX_ROWS` / message `MAX_RECIPIENTS`; note in
        the comment that it is coupled to the page's `maxDuration`
      - `const MIN_SEND_INTERVAL_MS = 600` — Resend's 2 req/s limit
- [ ] Extract the fan-out into a local `async function announceEvent(...)` in the same file,
      returning `{ sent, failed }`, so `createEventAction` stays readable
- [ ] In `createEventAction`, capture the created event: `const event = await createEvent(...)`
- [ ] Guard the fan-out on `shouldAnnounceEvent(event.startsAt, new Date())` (AC6)
- [ ] Load `getTeamById(teamId)` for the team name and `listTeamGuardians(teamId)` for the
      audience; build recipients with `buildAnnouncementRecipients`
- [ ] Resolve the sending coach's address for `replyTo` / `listUnsubscribe` — reuse the
      `userId` already returned by `requireTeamAccess` and read it via `listTeamMembers`, the
      way `sendTeamMessageAction` does
- [ ] Redirect to `?error=too-many` if recipients exceed `MAX_RECIPIENTS`, **before** any
      send — a clean rejection, never a partial fan-out
- [ ] Build the `env` object (`AUTH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL`) as
      the cron and message action both do
- [ ] Write the paced loop: wait out only the remainder of `MIN_SEND_INTERVAL_MS`, then
      `sendEmail({ to, subject, replyTo, listUnsubscribe, react: EventAnnouncementEmail({...}) })`,
      counting `sent` / `failed` and continuing past a failure
- [ ] After a successful send only, call `sendPushToUser(recipient.userId, { title, body, url })`
      inside its own try/catch — never releasing or affecting the email outcome (AC7)
- [ ] Wrap the whole fan-out in its own try/catch placed **after** `createEvent` returned, so
      no mail failure can reach the event row (AC3); `unstable_rethrow(error)` stays first
- [ ] Redirect: `?added=1` on a clean send; `?added=1&error=announce-failed` when
      `failed > 0` or the fan-out threw; carry `&sent=N` when `sent > 0`
- [ ] Confirm `updateEventAction` and `deleteEventAction` are untouched (AC4)

---

## Phase 3: The page

- [ ] Add `export const maxDuration = 60;` to `src/app/t/[teamId]/schedule/page.tsx`, with
      the comment the invite and compose pages carry — this is the level that governs a
      Server Action's timeout, and it is coupled to `MAX_RECIPIENTS`
- [ ] Extend the page's `ERROR_MESSAGES` table (already `messageTable(...)`, keep it that
      way — never a bare object literal):
      - `"announce-failed": "The event was added, but the announcement email could not be sent to everyone."`
      - `"too-many": "This team has more parents than one announcement can reach at once."`
- [ ] The page already renders `added` and `errorMessage` independently, so a
      `?added=1&error=announce-failed` redirect shows both without further work — verify
      rather than assume, since the existing banner is gated on `added && !errorMessage`;
      change that gate if it suppresses the success line
- [ ] Add to `src/app/t/[teamId]/schedule/page.test.tsx`: `maxDuration === 60`, and the
      `announce-failed` banner rendering

---

## Phase 4: Action tests

- [ ] Extend `src/app/t/[teamId]/schedule/actions.test.ts`, mocking `@/lib/email`,
      `@/lib/push`, `@/lib/guardians`, `@/lib/teams`, `@/lib/memberships`:
      - creating a future game sends one email per distinct guardian (AC1, AC8)
      - the event still exists and the redirect still says `added=1` when every send fails
        (AC3)
      - creating an event whose `startsAt` is in the past sends nothing (AC6)
      - `updateEventAction` sends nothing (AC4)
      - push is attempted only after a successful email, and a throwing push does not change
        the redirect (AC7)
      - a recipient list over `MAX_RECIPIENTS` redirects to `too-many` with zero sends

---

## Pre-Commit Gate

From `AGENTS.md` § Commands:

- [ ] `pnpm lint` ✅
- [ ] `pnpm typecheck` ✅
- [ ] `pnpm test` ✅
- [ ] `pnpm check` (all three) ✅
- [ ] `pnpm exec next build` — **not** `pnpm build`, which runs `prisma migrate deploy`
      against the shared production `DATABASE_URL`

---

## Files Modified / Created

| File | Change |
|---|---|
| `src/lib/guardians.ts` | **New** — shared roster→guardian loader + single-team wrapper |
| `src/lib/guardians.test.ts` | **New** — loader grouping tests |
| `src/lib/announcements.ts` | **New** — recipient dedupe + past-event gate (pure) |
| `src/lib/announcements.test.ts` | **New** — AC6, AC8 |
| `src/emails/event-announcement-email.ts` | **New** — pure props/subject builder |
| `src/emails/event-announcement-email.test.ts` | **New** — AC2, AC5 |
| `src/emails/EventAnnouncementEmail.tsx` | **New** — React Email template |
| `src/emails/event-reminder-email.ts` | `buildHeadline` promoted to exported `buildEventHeadline` |
| `src/lib/reminder-data.ts` | Private loader removed; imports the shared one |
| `src/app/t/[teamId]/schedule/actions.ts` | Paced fan-out + push in `createEventAction` |
| `src/app/t/[teamId]/schedule/actions.test.ts` | AC1, AC3, AC4, AC6, AC7, AC8 |
| `src/app/t/[teamId]/schedule/page.tsx` | `maxDuration = 60`; two new `messageTable` entries |
| `src/app/t/[teamId]/schedule/page.test.tsx` | `maxDuration` pin + banner test |
| `AGENTS.md` | Add the schedule page as the **fourth** paced send loop in the "Three places send in a loop" note (the heading needs updating too) |
