# Design Doc — Email parents when a new event is added to the schedule (#45)

## Overview

Step 2 of the product brief's core loop — "the coach adds a game, parents get an email" —
does not exist. A coach can add a game and no parent learns of it until they happen to open
the app, which is the exact failure mode the app was built to replace. This adds a paced,
per-guardian announcement email (plus a Web Push that rides along) fired from
`createEventAction`.

The work is unusually well-precedented: **#47's day-of reminder is the same fan-out**
(roster → guardians → one email per household, paced at 600ms, degrading quietly), and
**#4's bulk invite and #13's broadcast are the same paced loop inside a Server Action**.
This ticket is mostly a third instance of two patterns the repo already tests, plus one
genuinely new pure module.

## Acceptance Criteria

Copied from the issue; ACs 6–8 are clarifications settled in planning.

- [ ] **AC1** — Creating a game or practice sends one email per *distinct* guardian, with
      what/when/where and a link to `/t/[teamId]/schedule/[eventId]`
- [ ] **AC2** — Times render in `APP_TIMEZONE`, never the server zone
- [ ] **AC3** — Email send failure does not roll back or fail the event creation; the coach
      sees a non-blocking notice
- [ ] **AC4** — Editing an event does not send (out of scope; change-notification is a
      follow-up)
- [ ] **AC5** — The pure props builder has co-located tests, matching the existing email
      modules
- [ ] **AC6** *(clarified)* — An event created with a start time **already in the past**
      sends nothing; creation itself still succeeds normally
- [ ] **AC7** *(clarified)* — A guardian who gets the email and holds a push subscription
      also gets a Web Push, sent *after* the email and never able to affect it
- [ ] **AC8** *(clarified)* — A household guarding two rostered kids receives **one** email

## Architecture & Data Model

**No schema change.** No migration, no new table, no new column. Everything needed —
`RosterEntry → Player → GuardianPlayer → User` — already exists, and unlike the reminder
cron there is no idempotency ledger to keep (see Decision 5).

### Data Layer

One new query, and it is a *move* rather than a new one. `reminder-data.ts` already holds a
private `loadRostersByTeamId(teamIds)` returning exactly the shape needed
(`{ playerId, playerName, guardians: [{ userId, email, name }] }`). It gets promoted to a
shared module:

| Module | Function | Notes |
|---|---|---|
| `src/lib/guardians.ts` *(new)* | `loadGuardianRostersByTeamId(teamIds)` | Moved verbatim from `reminder-data.ts`; multi-team because the cron batches a whole day |
| `src/lib/guardians.ts` *(new)* | `listTeamGuardians(teamId)` | Thin single-team wrapper for the announcement path |
| `src/lib/reminder-data.ts` | — | Now imports the loader instead of defining it |

`getRosterWithGuardians` in `roster.ts` is deliberately **not** reused: it projects
guardians down to bare `email[]`, and this path needs `userId` (for push) and `name` (for
the greeting).

### Pure Decision Layer

| Module | Export | Purpose |
|---|---|---|
| `src/lib/announcements.ts` *(new)* | `buildAnnouncementRecipients(roster)` | Roster rows → deduped, deterministically ordered `{ userId, email, name }[]`. Drops empty emails, collapses a two-kid household to one row |
| `src/lib/announcements.ts` *(new)* | `shouldAnnounceEvent(startsAt, now)` | `startsAt > now`. One line, but it is the AC6 rule and belongs where it can be tested |
| `src/emails/event-announcement-email.ts` *(new)* | `buildEventAnnouncementEmail(...)` | Subject, headline, date-time label, absolute event URL |
| `src/emails/event-reminder-email.ts` | `buildEventHeadline(type, opponent)` | Existing private `buildHeadline`, promoted to an export and shared |

### Email Layer

| File | Change |
|---|---|
| `src/emails/EventAnnouncementEmail.tsx` *(new)* | React Email template: headline, full date + time, location, opponent, notes, CTA link |
| `src/emails/event-announcement-email.ts` *(new)* | Pure builder + co-located test (AC5) |

Subject shape, mirroring the reminder's `[Team] Today: …` framing:

```
[Wildcats] New game: Sat, Aug 29 at 5:30 PM vs Cubs
[Wildcats] New practice: Tue, Sep 2 at 5:30 PM
```

The team name leads for the same reason it does on the reminder — a parent with kids on two
teams needs to tell them apart in a notification shade.

### Action Layer

| Function | Type | Auth | Change |
|---|---|---|---|
| `createEventAction` | Server Action | COACH+ on a non-archived team | Fan out after `createEvent` succeeds |
| `updateEventAction` | Server Action | COACH+ | **Unchanged** — AC4 |
| `deleteEventAction` | Server Action | COACH+ | Unchanged |

## Key Decisions

### Decision 1: The send is deferred to `after()`; a receipt email reports it

> **Revised after implementation, at the maintainer's direction.** The original decision was
> to block the redirect on the fan-out. It shipped that way and was reversed: ~15s of waiting
> to add a game is not acceptable, and the reason for blocking — that AC3's notice had
> nowhere else to land — is answered by giving it somewhere to land instead. Both halves of
> the reversal are below; the superseded reasoning is kept because it is why the receipt
> email exists at all.

**Options considered:**
- **A** *(originally chosen, now superseded)* — Fan out inside `createEventAction` before the
  redirect; `maxDuration = 60`. AC3's outcome rides on the redirect.
- **B** *(chosen)* — Resolve recipients synchronously, hand the paced fan-out to Next's
  `after()`, redirect immediately, and report the outcome by email to the coach.

**Decision:** B.
**Rationale:** The objection to B was that a deferred send has nowhere to put its outcome.
That is true and it is the whole design problem — so the answer is a channel, not a wait.
`AnnouncementReceiptEmail` is that channel: it reaches the coach wherever they are, survives
them navigating away, and needs no schema. `after()` is documented to run even when the
response was a `redirect`, and to run for the route's configured `maxDuration`.

Three consequences worth naming:
1. **Recipients are resolved before the redirect** even though sending is deferred. One
   indexed query buys an honest "Emailing 24 parents now" instead of a vague reassurance, and
   it keeps one announcement failure — an unreadable roster — reportable on the page.
2. **The banner is present tense.** Not one message has been sent when the coach reads it, so
   "24 parents emailed" would be a claim the page cannot know to be true.
3. **The receipt is sent on success too**, not only failure. Silence-meaning-success makes
   every quiet evening ambiguous: a coach cannot tell "it worked" from "the receipt bounced".

**Rebased onto #71.** After this was written, #71 rewrote `createEventAction` into a
`useActionState` action returning `AddEventState` rather than redirecting. The announcement
was re-wired onto that shape rather than merged into it, and the result is strictly better
than what this decision originally described: the outcome is a typed `announcement` field on
the returned state, so the `?announcing=` search param — and the whole business of refusing
to print a non-positive-integer from an attacker-chosen URL — no longer exists.

**Cost, accepted:** one extra email per event created. If it reads as noise in real use,
gating `sendReceipt` on `needsAttention` is a one-line change — at the price of that
ambiguity.

### Decision 2: A new template, not a variant of `EventReminderEmail`

**Options considered:**
- **A** — New `EventAnnouncementEmail.tsx` + pure builder.
- **B** — Add a `kind` prop to `EventReminderEmail` that swaps the heading and hides the
  RSVP block.

**Decision:** A, with `buildEventHeadline` promoted to a shared export.
**Rationale:** The reminder's entire middle section is per-kid RSVP state
(`"Jimmy — you said yes"`), which is *definitionally* empty the instant an event is created:
nobody has answered. B would leave a template whose largest branch is dead in half its
callers, and every future edit to either message would have to reason about both audiences.
The genuinely shared part is one function — `"Game vs Hawks"` / `"Practice"` — so that gets
exported and the rest stays separate. This also keeps the announcement's *full date*
("Sat, Aug 29 at 5:30 PM") away from the reminder's time-only label, which is correct
because the reminder already established "today".

### Decision 3: Push rides along; it never gates the email

**Decision:** After a successful email, call `sendPushToUser` inside its own try/catch.
**Rationale:** Verbatim the discipline in `src/app/api/cron/reminders/route.ts`, which
AGENTS.md states as a rule: "Nothing about push may ever decide whether an email goes."
`sendPushToUser` already returns counts and never throws — no VAPID keys, no subscription,
a dead endpoint and a push-service outage are all quiet returns — so most guardians cost
nothing. A new game landing on a lock screen is the strongest available form of the brief's
step 2.

### Decision 4: A past-dated event announces nothing, silently

**Options considered:**
- **A** — Announce every created event.
- **B** — Gate on `startsAt > now`, silently.
- **C** — Gate on `startsAt > now` and redirect with a distinct notice explaining why.

**Decision:** B (user's call in planning).
**Rationale:** A coach back-filling last week's game should not mail twenty-five families
about it. The gate mirrors team home's `startsAt > now` RSVP gate, and lives in
`shouldAnnounceEvent` so it is one tested predicate rather than an inline comparison.

> **Flagged cost, accepted:** B is silent, so a coach who typos the *year* gets a normal
> "Event added." and no announcement, with nothing on screen explaining the difference. C
> exists precisely to close that, at the price of a fourth outcome on the form. If this
> surfaces as confusion in real use, C is a one-line follow-up.

### Decision 5: No receipt ledger

**Decision:** No `ReminderReceipt`-style claim/release around the announcement send.
**Rationale:** The ledger exists because a *cron* re-runs and two invocations can overlap.
An announcement fires exactly once, from one authenticated POST, at the moment of creation,
and there is no retry path that would re-enter it. Adding a ledger here would be cargo-culting
the mechanism without the failure mode it defends against. The trade goes the other way from
the cron's: a send that fails is simply reported to the coach, who can use
`/t/[teamId]/messages/new` to say it by hand.

### Decision 6: `List-Unsubscribe` is set, pointing at the creating coach

**Decision:** Pass `listUnsubscribe: <creating coach's email>`, matching the broadcast.
**Rationale:** AGENTS.md's rule is that the header is a claim, not a courtesy: it describes
*a list the recipient belongs to*. An announcement fans one body out to every family on the
team — that is list mail by the same test the broadcast passes, and unlike the cron there is
a real human sender to point at, so no `pickUnsubscribeContact` equivalent is needed.
`Reply-To` is that same coach, so a parent's "we're away that weekend" reaches a person.

### Decision 7: Recipients come from the roster, never `Membership`

**Decision:** `RosterEntry → Player → GuardianPlayer → User`, exactly as the reminder does.
**Rationale:** A coach with no kid on the team does not need to be told about an event they
just created (or that a co-coach created — they see the schedule). This also preserves
"people are global, participation is team-scoped": the roster is what selects the audience.
The issue's phrasing about "skipping members with no signed-in account" resolves to a
non-issue under this rule — a guardian row exists from the moment they are linked, carries a
real address, and the invitation email is a separate flow.

## Security & Permissions

- **Who can trigger a send:** COACH+ only, and only on a non-archived team. Nothing new is
  needed — `createEventAction` already calls
  `requireTeamAccess(teamId, { intent: "write", minRole: "COACH" })`, and archived teams
  reject every write there.
- **Recipient list is never taken from the POST.** It is derived server-side from the team's
  roster, so a forged form cannot redirect the fan-out at an arbitrary address. This is the
  same posture as `resolveRecipients` in the broadcast and is what makes `MAX_RECIPIENTS`
  a runaway guard rather than a security control.
- **No other family's data leaves the team.** The email names the *event* only — no roster,
  no attendance, no other guardian's contact details. Per-recipient sends, never a shared
  `To:` line, so addresses are not disclosed to each other.
- **Header injection** is already handled one layer down: `email.ts` validates the
  `List-Unsubscribe` address against `BARE_ADDRESS` and drops a suspect one rather than
  framing it.

## Error Handling

| Failure | Behaviour |
|---|---|
| `requireTeamAccess` throws | `?error=access`, no event created — unchanged |
| `createEvent` throws | Propagates — unchanged; **no email is attempted** |
| Guardian load throws | Caught; event stands, redirect carries `announce-failed` |
| One recipient's `sendEmail` fails | Counted, loop continues (one bad mailbox must not lose the batch) |
| Every send fails | Event stands, redirect carries `announce-failed` |
| Partial failure | Event stands, redirect carries `announce-failed` **and** the sent count |
| `sendPushToUser` throws | Swallowed and logged; email outcome untouched |

The whole fan-out sits in its own try/catch *after* `createEvent` has returned, so AC3 is
structural rather than a promise: there is no path from a mail failure back to the event
row. `unstable_rethrow` stays first in every catch so Next's redirect signal is not
swallowed.

## Testing Strategy

| Layer | Test type | File | Notes |
|---|---|---|---|
| Recipient dedupe | Unit | `src/lib/announcements.test.ts` | Two-kid household → one row (AC8); empty email dropped; deterministic order |
| Past-event gate | Unit | `src/lib/announcements.test.ts` | `shouldAnnounceEvent` boundary, incl. `startsAt === now` (AC6) |
| Props builder | Unit | `src/emails/event-announcement-email.test.ts` | Subject shape, game-with/without-opponent, practice, absolute URL (AC5) |
| Timezone | Unit | `src/emails/event-announcement-email.test.ts` | Late-evening Central event formats to the Central day, with `TZ=UTC` (AC2) |
| Shared headline | Unit | `src/emails/event-reminder-email.test.ts` | Existing suite still green after `buildHeadline` is exported |
| Guardian loader | Unit | `src/lib/guardians.test.ts` | Mocked `db`; grouping by team, guardians per player |
| Action | Unit | `src/app/t/[teamId]/schedule/actions.test.ts` | Send fires; event survives a total send failure (AC3); no send when past (AC6); `updateEventAction` sends nothing (AC4); push after email only |
| Page | Unit | `src/app/t/[teamId]/schedule/page.test.tsx` | `maxDuration === 60`; `announce-failed` banner renders |
| Cron regression | Unit | `src/app/api/cron/reminders/route.test.ts` | Unchanged and must stay green after the loader move |

Mock `@/lib/email` and `@/lib/push` at the module boundary, as the existing action and cron
suites do. Import modules under test **statically** — AGENTS.md's rule about dynamic imports
billing the whole graph to whichever test runs first.

## Config Changes

- [ ] Schema / migration — **none required**
- [ ] Access rule changes — **none required** (existing COACH+ gate covers it)
- [ ] Environment variables — **none new**; reuses `RESEND_API_KEY`, `EMAIL_FROM`,
      `APP_TIMEZONE`, and the VAPID pair, all already documented in `.env.example`
- [ ] Dependency changes — **none**
- [ ] `maxDuration = 60` exported from `src/app/t/[teamId]/schedule/page.tsx` — new, and
      load-bearing (see Risks)

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| Fan-out outruns the function timeout | High — a half-sent batch with no clean rejection | `MAX_RECIPIENTS = 30` × `MIN_SEND_INTERVAL_MS = 600` = 18s of pacing against `maxDuration = 60`. Same ratio AGENTS.md pins for the invite and message loops; a page test asserts the value and the constants move together |
| Team roster exceeds the cap | Low | **Was a real defect at 30**: recipients dedupe per guardian `User`, so a 16-player roster with both parents linked is 32 and every announcement would have been rejected permanently. At 200 nothing real approaches it, and the overflow is truncated and reported in the receipt rather than refused |
| Coach adds five events in a row | Low — five deferred fan-outs, no waits, five receipts | The waiting half is gone with Decision 1's reversal; the remaining cost is five receipt emails. A digest ("3 new games this week") is still a real follow-up, but it changes the trigger from per-create to scheduled |
| Household with two rostered kids | Medium — duplicate mail teaches parents to ignore the app | `buildAnnouncementRecipients` dedupes on `userId`; unit-tested (AC8) |
| Late-evening Central event files under the wrong day | High — the app's recurring timezone bug | Format only through `calendar.ts` helpers; a test asserts it under `TZ=UTC` |
| Resend 429s the tail of a batch | Medium | 600ms pacing keeps under the 2 req/s limit; failures are counted and surfaced, never silent |
| Guardian loader move breaks the reminder cron | Medium | Pure move, no signature change; the cron's existing suite is the regression test and must stay green |
| Coach expects the email to also announce *edits* | Low | Explicitly out of scope (AC4). Worth a line in the follow-up issue |
