# Task Doc — Phase 9: Validation gate — one real game weekend (#9)

No code ships in this issue. Every task below is operational, executed by the coach
(Brian) against the production deployment. Phases are ordered by calendar: pre-flight
early in the week, seeding by mid-week, the announcement once everything is verified,
then a hands-off weekend.

## Prerequisites

- [x] #1–#8 all closed (verified 2026-08-01)
- [ ] Production deployment live on Vercel and reachable at its real URL
- [ ] Production env vars set in Vercel: `DATABASE_URL` (Neon), `AUTH_SECRET`,
      `RESEND_API_KEY`, `EMAIL_FROM`, app URL / `APP_TIMEZONE` as applicable
- [ ] Migration `prisma/migrations/20260728053521_001` applied to the production Neon
      branch (`prisma migrate deploy` semantics, not a dev migration)
- [ ] Resend sending domain verified (SPF/DKIM) so invitations don't start life in spam

## Phase 1: Production pre-flight dry run (T-4 days or earlier)

Use a personal secondary email address as a fake parent. Real parents are one-shot; this
walk-through is the rehearsal.

- [ ] Sign in as owner on the production site; confirm magic-link email arrives and works
- [ ] Create a throwaway team via `/t/new`
- [ ] Add a test player, link the secondary email as guardian, send the invitation
- [ ] Confirm the invitation email arrives — note inbox vs spam placement
- [ ] Accept via `/invite/[token]`, sign in as the fake parent, RSVP on the event page,
      and load `/t/[teamId]/view` — the full path a real parent will walk
- [ ] Create a test event; verify its rendered date/time is correct on the production
      site (the `TZ=UTC` vs `America/Chicago` gotcha is invisible on a dev machine)
- [ ] Delete the throwaway team (cascades take roster, events, RSVPs with it —
      `onDelete: Cascade` throughout `prisma/schema.prisma`)
- [ ] Fix anything broken before proceeding — deployment/config fixes are in scope;
      feature code is not

## Phase 2: Seed the real team (T-3 days)

- [ ] Create the real team via `/t/new`
- [ ] Seed the real roster with jersey numbers via `/t/[teamId]/roster`
- [ ] Link each kid's real guardian email(s) and send invitations
- [ ] Confirm with a light touch that invitations arrived (asking "did you get the
      invite email?" is allowed — the no-reminder rule applies to the *game
      announcement*, not to account setup)
- [ ] Add the weekend's real game via `/t/[teamId]/schedule` (date, time, location,
      opponent); verify its displayed date/time
- [ ] Set `battingOrder` and `position` on each `RosterEntry` via `pnpm db:studio`
      pointed at the **production** `DATABASE_URL`. Single pass, no swaps —
      `@@unique([teamId, battingOrder])` and `@@unique([teamId, position])` will reject
      collisions with a raw error. To swap later: null one side, save, then set both.
      `C` = Catcher, `CF` = Center Field
- [ ] Proofread `/t/[teamId]/view` on a phone against the intended chart: all nine
      positions labeled and filled as expected, batting order correct, benched kids
      shown as expected
- [ ] Verify the invariant: a player with no RSVP (or a declined one) still appears in
      their batting slot and at their position — greyed/marked, never removed. RSVP
      must never change the chart; only the coach does, by hand

## Phase 3: Announce, then hands off (T-2 days)

- [ ] Send **one** email from the coach's personal email client to all parents:
      what the app is, the link to the game's event page
      (`/t/[teamId]/schedule/[eventId]`), and a sentence asking them to RSVP their kid
      (in-app broadcast is #13 and does not exist yet — see design doc, Decision 1)
- [ ] From this moment: **no texts, no reminders, no nudges**, from anyone with the
      chart — including spouse or assistant coaches. Tell them the rule
- [ ] Answering an *incoming* parent question is fine — but every "what time / where /
      is he playing" text gets tallied; those are the metric

## Phase 4: Game-day measurement

- [ ] Morning of the game, before first pitch: snapshot RSVPs via `pnpm db:studio` —
      count players with an `Rsvp` row (attending **and** declined both count as
      responses) over total rostered players
- [ ] Tally every "what time / where / is he playing" text received on game day
- [ ] Note every confusion report all weekend, especially anything about the three RSVP
      states (attending / declined / no-response) on the view page — in particular
      whether anyone read a no-response or declined kid as removed from the lineup
- [ ] If the chart gets patched during the weekend, that's a coach decision made by hand
      in `db:studio` — record what changed and why in the findings (the edit is
      permanent; there is no undo)

## Phase 5: Findings and the gate decision

- [ ] Write the findings as a comment on #9 (template below)
- [ ] Decide explicitly, in the comment: **proceed to #10/#11**, or **run a second game
      weekend**, or (only after two low-participation games) **fix notification design
      before building more features**
- [ ] Close #9 only alongside a proceed decision; a "second weekend" verdict keeps it open

### Findings comment template

```markdown
## Validation weekend findings — [date]

**Game:** [opponent, date, time]
**Roster size:** [N players / N families]

| Signal | Target | Actual |
|---|---|---|
| Players with an RSVP before game day | ≥ 70% | X of N (Y%) |
| "what time / where / is he playing" texts on game day | → 0 | X |

**RSVP breakdown:** X attending / X declined / X no response

**Confusion observed:**
- [what, from whom, about which screen]

**Deliverability:** [invitations + any spot-check on whether the announcement was seen]

**Protocol violations:** [none | what slipped]

**Decision:** [Proceed to #10/#11 | Second game weekend | Fix notification design first]
**Reasoning:** [1–3 sentences]
```

## Pre-Commit Gate

Not applicable — no code ships in this issue. The only repo change is these planning
docs; `pnpm check` (lint → typecheck → test) is unaffected by markdown under `.agents/`.

## Files Modified / Created

| File | Change |
|---|---|
| `.agents/issue-planner/9/design-doc.md` | Created — this plan |
| `.agents/issue-planner/9/task-doc.md` | Created — this checklist |
| `.agents/issue-planner/9/proposal-doc.md` | Created — proposal summary |
