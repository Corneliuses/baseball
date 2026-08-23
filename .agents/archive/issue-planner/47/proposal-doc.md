# Proposal — Day-of reminders: email + push on the morning of any team activity (#47)

## Executive Summary

Every morning a team has a game or practice, the app will email every guardian on that
team a reminder — event type, time, location, notes, their own kids' current RSVP
states, and a link to the event page — driven by a daily Vercel cron hitting a new
route handler, with all "today" math done in `APP_TIMEZONE` through the existing
`calendar.ts` helpers. Duplicate protection is structural: a new `ReminderReceipt` table
with a unique `(eventId, userId)` constraint is claimed before each send, so a cron
re-run skips what already went out and retries only what failed.

Push notifications layer on top, exactly as Decision 8 prescribes: `web-push` with
self-generated VAPID keys, a `push` handler in the existing (deliberately minimal)
service worker, a session-authenticated subscription-registration route handler feeding
the already-existing `PushSubscription` table, and an opt-in card on `/profile`. Push
rides the same cron loop after each email, best-effort — its failure or absence never
gates the email, and a parent who never installs the PWA loses nothing. The email half
ships first as its own phase; the PWA-install work push depends on has already landed.

## Scope

### In Scope
- Daily reminder email per guardian per event (games **and** practices), morning,
  `APP_TIMEZONE`-correct
- `ReminderReceipt` dedup ledger + additive migration
- `vercel.json` cron config and a `CRON_SECRET`-guarded cron route handler
- New React Email template + pure props builder, paced sends like the bulk invite
- Push: `web-push` fan-out, service worker `push`/`notificationclick` handlers,
  subscription registration/removal route, `/profile` opt-in card, pruning of dead
  subscriptions

### Out of Scope
- Event-created announcement emails (the related, separate issue)
- Per-guardian notification preferences / unsubscribe from reminders
- Push for anything other than day-of reminders (broadcasts etc. — the plumbing will
  exist, but wiring other sends is follow-up work)
- The iOS standalone-container sign-in question (#14 verification, #60 sign-in codes)

## Acceptance Criteria

1. On the day of each game or practice, every guardian receives one reminder email in
   the morning, `APP_TIMEZONE`-correct
2. Guardians with a registered push subscription also receive a push with a deep link
3. A parent who never installs the PWA still gets full information by email
4. Duplicate protection: a cron re-run does not double-send for the same event/guardian
5. No reminder for events on archived teams

## Implementation Phases

| Phase | Description | Areas Affected |
|---|---|---|
| 1 | Email reminders: schema + migration, calendar helper, pure batch builder, data wrapper, email template, cron route, `vercel.json`, `CRON_SECRET` | `prisma/`, `src/lib/`, `src/emails/`, `src/app/api/cron/`, `vercel.json`, `.env.example`, `AGENTS.md` |
| 2 | Push: `web-push` + VAPID, push fan-out lib, subscription route, service worker handlers, `/profile` opt-in card, cron integration | `package.json`, `src/lib/`, `src/app/api/push/`, `public/sw.js`, `src/components/`, `src/app/profile/` |

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Cron re-run double-sends | High | Claim-first receipts on a unique `(eventId, userId)` constraint; release on failed send |
| UTC server misfiles a late-evening event's day | High | All day boundaries via `calendar.ts` zone helpers; new `endOfDayInZone` tested across DST |
| Morning run fails (Resend outage, misconfig) | Med | Failed claims are released; manual re-invocation from the Vercel dashboard retries only the unsent |
| iOS push requires Home-Screen install; a Safari-only parent silently gets none | Med | Architectural per Decision 8: email is the channel of record; opt-in card copy explains the requirement |
| iOS installed-app container may be signed out (unverified) | Med | Push opt-in inherits #60's remedy if #14 confirms it; email path unaffected |
| Send loop outgrows route timeout | Low | 600ms pacing + `maxDuration = 300` + capped per-run sends with the coupling documented, per the existing AGENTS.md rule |
| Expired push subscriptions accumulate | Low | Pruned on `404`/`410` during each fan-out |
| DST shifts the fixed-UTC cron hour by one | Low | Accepted: 7:00 AM CDT / 6:00 AM CST both read as "morning"; correctness never depends on the hour |

## Effort Estimate

**Overall:** Medium (3–5 days)

| Phase | Estimate |
|---|---|
| Phase 1 (email) | ~2 days |
| Phase 2 (push) | ~2–3 days |

## Next Steps

1. Review and approve this proposal.
2. Follow `task-doc.md` to implement phase by phase.
3. After implementation, finalize with the `finalize-issue` skill (verify AC against the
   PR, archive `.agents/issue-planner/47/`, merge, and close the issue).
