# Proposal — Email parents when a new event is added to the schedule (#45)

## Executive Summary

The product brief's core loop is three steps: the coach adds a game, **parents get an
email**, parents RSVP. Step 2 does not exist. Today a coach can add a Saturday game and no
family learns of it until someone happens to open the app — the exact failure mode the app
was built to replace, and the one the brief's validation plan singles out ("if RSVPs don't
come in, the fix is notification design, not more features").

This adds a per-guardian announcement email fired when `createEventAction` succeeds, with a
Web Push riding along for anyone who has opted in. The approach is deliberately unoriginal:
**#47's day-of reminder is already this exact fan-out** (roster → guardians → one paced email
per household, degrading quietly), and **#4's bulk invite and #13's broadcast are already
this exact paced loop inside a Server Action**. The work is a third instance of two tested
patterns, one new pure module, and one new email template. No schema change, no migration,
no new environment variable.

## Scope

### In Scope
- One email per **distinct** guardian of a rostered player when a game or practice is created
- Subject and body carrying type, full date/time, location, opponent and notes, with a deep
  link to the event page where the RSVP buttons live
- A Web Push to the same guardians, sent after the email and never able to affect it
- Paced sending (600ms, Resend's 2 req/s limit) with a `MAX_RECIPIENTS` cap coupled to a new
  `maxDuration = 60` on the schedule page
- Non-blocking failure reporting: a send failure never touches the created event
- Extraction of the reminder cron's private guardian loader into a shared module

### Out of Scope
- **Editing an event sends nothing** (AC4). A change-notification — "the Saturday game moved
  to 4pm" — is arguably more valuable than the announcement and is the natural follow-up, but
  it needs a diff ("what changed?") the announcement does not.
- Cancellation notices (deleting an event).
- Digesting several events created in one sitting into a single "3 new games this week"
  email. Real, but it changes the trigger from per-create to scheduled.
- Per-parent notification preferences / opt-out beyond the `List-Unsubscribe` mailto.

## Acceptance Criteria

1. Creating a game or practice sends one email per distinct guardian, with when/where/what
   and a link to `/t/[teamId]/schedule/[eventId]`
2. Times render in `APP_TIMEZONE`, never the server zone
3. Email send failure does not roll back or fail the event creation; the coach sees a
   non-blocking notice
4. Editing an event does not send
5. The pure props builder has co-located tests, matching the existing email modules
6. *(clarified)* An event created with a start time already in the past sends nothing;
   creation itself still succeeds normally
7. *(clarified)* A guardian with a push subscription also gets a Web Push, after the email
   and never able to affect it
8. *(clarified)* A household guarding two rostered kids receives one email, not two

## Key Decisions

| # | Decision | Why |
|---|---|---|
| 1 | Send **blocks** the redirect rather than deferring to `after()` | AC3 needs the outcome to reach the coach; a deferred send has nowhere to put it. `after()` bills `maxDuration` anyway, so it does not escape the coupling |
| 2 | **New template**, not a variant of `EventReminderEmail` | The reminder's whole middle section is per-kid RSVP state, which is definitionally empty at creation. Only the headline (`"Game vs Hawks"`) is genuinely shared, so only that is extracted |
| 3 | Push rides along, **never gates** | AGENTS.md's rule, enforced in code by the cron's structure: nothing about push may decide whether an email goes |
| 4 | A **past-dated** event announces nothing, silently | Back-filling last week's game should not mail 25 families. Cost flagged below |
| 5 | **No receipt ledger** | The cron's claim/release exists because a cron re-runs and can overlap. This fires once, from one POST. Copying the mechanism without its failure mode would be cargo-culting |
| 6 | `List-Unsubscribe` **is** set, pointing at the creating coach | Same test the broadcast passes — one body fanned out to a whole audience is list mail, and here there is a real human sender to name |
| 7 | Recipients from the **roster**, never `Membership` | A coach with no kid on the team does not need telling about an event they just created. Preserves "people are global, participation is team-scoped" |

## Implementation Phases

| Phase | Description | Areas affected |
|---|---|---|
| 1 | Pure modules + shared guardian loader, with tests. Carries most of the ACs and lands independently | `src/lib/guardians.ts`, `src/lib/announcements.ts`, `src/emails/` |
| 2 | Wire the paced fan-out + push into `createEventAction` | `src/app/t/[teamId]/schedule/actions.ts` |
| 3 | `maxDuration = 60` and the two new `messageTable` entries on the schedule page | `src/app/t/[teamId]/schedule/page.tsx` |
| 4 | Action-level tests for the full path | `src/app/t/[teamId]/schedule/actions.test.ts` |

Phase 1 is separable and reviewable on its own; 2–4 are one change and should land together.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The fan-out outruns the function timeout, half-sending | High | `MAX_RECIPIENTS` (30) × `MIN_SEND_INTERVAL_MS` (600ms) = 18s against `maxDuration = 60` — the ratio AGENTS.md pins for the two existing loops. A page test pins the value; the constants move together |
| **A silent skip confuses a coach who typos the year** | Medium | *Accepted, per Decision 4.* The coach sees a normal "Event added." with nothing explaining why no announcement went. The remedy (a distinct notice) is a one-line follow-up if it shows up in real use |
| Duplicate mail to a two-kid household | Medium — teaches parents to ignore the app | Dedupe on `userId`, unit-tested (AC8) |
| Late-evening Central event files under the wrong day | High — the app's recurring timezone bug | Format only via `calendar.ts` helpers; a test asserts it with `TZ=UTC` |
| Moving the guardian loader breaks the reminder cron | Medium | Pure move, no signature change; the cron's existing suite is the regression gate and runs before anything else in Phase 1 |
| A coach adds five events in a row and waits five times | Medium | Accepted. Digesting is a separate ticket with a different trigger |
| Coaches expect edits to notify too | Low | Explicitly out of scope; worth naming in the follow-up issue so the gap is recorded rather than discovered |

## Effort Estimate

**Overall: Medium (3 days).**

| Phase | Estimate |
|---|---|
| 1 — pure modules, loader move, email template + tests | 1.5 days |
| 2 — action wiring | 0.5 day |
| 3 — page changes | 0.25 day |
| 4 — action tests | 0.5 day |
| Docs (`AGENTS.md` loop note) + PR review cycles | 0.25 day |

The estimate is mid-range rather than small because the tests are the bulk of it and because
`AGENTS.md`'s "Three places send in a loop" note becomes four — a documentation change that
is load-bearing here, not a courtesy.

## Next Steps

1. Review and approve this proposal.
2. Follow `task-doc.md` phase by phase.
3. Finalize with the `finalize-issue` skill — verify each AC against the PR, archive
   `.agents/issue-planner/45/`, merge when green, and close the issue.
