# Design Doc — Phase 9: Validation gate — one real game weekend (#9)

## Overview

Run the cheapest possible test of the product's core assumption — that parents will RSVP
in an app without being chased by text — before building the expensive half of the app
(both drag-and-drop editors, messaging, PWA install). **No code ships in this issue.**
It is an operational plan that exercises everything built in #1–#8 against one real team
and one real game weekend, and ends in an explicit go / fix-notifications-first decision.

All eight prerequisite phases are closed (verified 2026-08-01). #9 blocks #10, #11, #13,
and #14 by design: if the RSVP assumption fails, the fix is notification design, not more
features.

## Acceptance Criteria

From the issue, unchanged:

- [ ] Create the real team and seed the real roster through the UI
- [ ] Invite the real parents and confirm invitation emails actually arrive — check spam
- [ ] Set `battingOrder` and `position` on `RosterEntry` by hand via `pnpm db:studio`
- [ ] Add the weekend's real game to the schedule
- [ ] Send **one** email announcing the game
- [ ] **Do not follow up by text** — a text reminder invalidates the result
- [ ] Record: what percentage of parents RSVP'd before game day
- [ ] Record: how many "what time / where / is he playing" texts arrived on game day
- [ ] Record: anything parents got confused by, especially around the three RSVP states
- [ ] Write the findings into this issue as a comment before closing it
- [ ] Decide explicitly: proceed to the chart editors, or fix notification design first

## Architecture & Data Model

No schema, route, or module changes. This section maps each operational step to the
built surface it exercises, so the weekend doubles as an end-to-end audit of #1–#8.

### Operational flow map

| Step | Surface | Built in |
|---|---|---|
| Create team | `/t/new` (owner-gated) | #3 |
| Seed roster + jersey numbers | `/t/[teamId]/roster` | #4 |
| Link guardians, send invitations | Roster player detail → `InvitationEmail` via Resend → `/invite/[token]` | #4 |
| Hand-seed the chart | `pnpm db:studio` → `RosterEntry.battingOrder` / `RosterEntry.position` | schema (#3/#4) |
| Add the game | `/t/[teamId]/schedule` (event create) | #6 |
| Parents RSVP | `/t/[teamId]/schedule/[eventId]` tri-state toggle | #7 |
| Parents check the chart | `/t/[teamId]/view` (read-only diamond + order, RSVP as decoration) | #8 |
| Measure | `pnpm db:studio` read of `Rsvp` rows on game-day morning | — |

### Data written by hand (db:studio)

`RosterEntry.battingOrder` and `RosterEntry.position` only. Three unique constraints can
trip during hand-editing (`@@unique([teamId, battingOrder])`, `@@unique([teamId, position])`,
`@@unique([teamId, jerseyNumber])` — `prisma/schema.prisma:156-178`). Studio writes bypass
`roster-rules.ts`'s friendly `P2002` translation, so a collision surfaces as a raw Prisma
error. Mitigation: assign values in a single pass with no swaps; to swap two players later,
null one side first.

Positions are the `Position` enum — `C` is **Catcher**, `CF` is **Center Field**
(`src/lib/positions.ts`).

## Key Decisions

### Decision 1: How the announcement email is sent

**Options considered:**
- Option A: Coach's personal email client, one message to the parent list
- Option B: Build a minimal in-app broadcast now

**Decision:** Option A.
**Rationale:** In-app messaging is #13, which this gate deliberately *blocks*. Building
any of it now inverts the phase ordering the milestone exists to protect. The one
announcement email is manual and personal; it should link parents to the game's event
page (`/t/[teamId]/schedule/[eventId]`), because the RSVP toggle — the behavior under
test — lives there. Signed-out recipients pass through the magic-link sign-in and land
back on the page via the callback URL handling from #2.

### Decision 2: How "RSVP'd before game day" is measured

**Options considered:**
- Option A: Query `Rsvp.updatedAt` after the fact
- Option B: Snapshot the `Rsvp` table on game-day morning, before first pitch

**Decision:** Option B.
**Rationale:** `Rsvp` has `updatedAt @updatedAt` but no `createdAt`
(`prisma/schema.prisma:219-231`) — a parent who toggles again on game day overwrites the
evidence of when they first responded. A snapshot taken on game-day morning *is* the
metric, with no timestamp archaeology. **A response = any `Rsvp` row** — attending *and*
declined both count; the failure mode being measured is no-response (the absent row,
per `src/lib/rsvp.ts`). Denominator = rostered players; a family responding for their kid
counts that player once.

### Decision 3: What the decision rule is

**Decision:** Apply the brief's Success Criteria verbatim, as directional signals — one
team, one weekend is not a sample:

| Signal | Target |
|---|---|
| Players with an RSVP recorded before game day | ≥ 70% |
| "what time / where / is he playing" texts on game day | → 0 |

Clearly at-or-above targets → close #9 and proceed to #10/#11. Clearly below → run a
second game weekend; still low after two games → **fix notification design before
building features** (the brief's explicit instruction). Mixed → record the confusion
findings and decide in the issue comment with reasoning. The under-5-minute lineup
target is explicitly *not* measured here — editors don't exist; measure it at the end
of #11.

### Decision 4: Production pre-flight is part of this issue

**Decision:** Treat "the app is live, migrated, and can deliver email in production" as
Phase 1 of the task doc rather than an assumption.
**Rationale:** Nothing in the repo proves a production deploy has ever served a real
user or that the single migration (`prisma/migrations/20260728053521_001`) has been
applied to the production Neon branch. A dry run with a secondary email account —
invitation → spam check → accept → sign in → RSVP → view page — is cheap and protects
the one-shot weekend: real parents are a resource you can't re-run.

## Security & Permissions

No changes. The weekend exercises the existing boundaries as designed: owner-gated team
creation, invitation-only accounts, `requireTeamAccess` inside every scoped loader and
action, RSVP writes restricted to linked guardians. Any hole found is a finding, not a
fix, for this issue.

## Error Handling → Operational contingencies

| Failure | Response |
|---|---|
| Invitation email in spam | Expected enough that the issue calls it out. Verify the Resend sending domain (SPF/DKIM) during pre-flight; if a real parent's invite lands in spam, telling them to check spam is allowed — it's not an RSVP reminder |
| Parent can't sign in (magic link friction) | Help them; log it as a confusion finding. Fixing auth UX is legitimate follow-up work, not a violation of the experiment |
| Chart edit trips a unique constraint in Studio | Null the colliding field first, then set. No app code involved |
| Game postponed / rained out | The gate needs a real game; re-run the following weekend with the same seeded data. Do not close on a practice |
| A text reminder slips out (spouse, assistant coach, team group chat) | The result is invalidated per the issue; record it honestly and re-run |

## Testing Strategy → Measurement plan

No code, no tests. The measurements, their instruments, and when they're taken:

| Metric | Instrument | When |
|---|---|---|
| % players with an `Rsvp` row | `pnpm db:studio` (or the event page's own state map) | Game-day morning, before first pitch |
| Game-day question texts | Coach's phone, tallied by hand | Game day |
| Confusion reports | Anything parents say or ask, esp. about the three RSVP states | All weekend |
| Email arrival / spam placement | Pre-flight dry run + asking one or two parents *after* game day | Pre-flight; post-game |

## Config Changes

- [ ] Schema / index changes — none
- [ ] Access rule changes — none
- [ ] Environment variables — none added; production values for `DATABASE_URL`,
      `AUTH_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, and the app URL must be verified
      live in Vercel during pre-flight. `APP_TIMEZONE` defaults to `America/Chicago`
- [ ] Dependency changes — none

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| Deliverability failure masquerades as apathy (emails unseen, not ignored) | High — wrong conclusion from the whole gate | Pre-flight dry run to a personal secondary address; post-game spot-check with 1–2 parents about whether the email arrived |
| Event displays under the wrong day (UTC vs `America/Chicago`) | High — parents shown wrong date | Known gotcha; `calendar.ts` helpers handle it, but verify the created event's rendered date/time on the production site before announcing |
| Hand-seeded chart contains an error (wrong kid at SS) | Med — parents' first impression is wrong data | Proofread `/t/[teamId]/view` on a phone against the paper chart before sending the announcement |
| One-team sample over-read | Med | Decision 3 treats results as directional; two-game rule before the notification-redesign verdict |
| Coach reflexively answers a "what time" text with the answer instead of a link | Low — but each one is a data point | Answering is fine (they're real parents); *tally it* — those texts are the metric, and answering by text is not an RSVP reminder |
