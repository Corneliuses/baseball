# Proposal — Phase 9: Validation gate — one real game weekend (#9)

## Executive Summary

Phases #1–#8 are all closed: auth, teams, roster, invitations, schedule, tri-state RSVP,
and the read-only view page exist. Before building the expensive half of the milestone —
both drag-and-drop editors, email messaging, PWA install — this issue runs the brief's
cheapest test of the core assumption: **will parents RSVP in an app without being chased
by text?** No code ships. The real team, roster, and weekend game are seeded through the
production UI; the standing chart is hand-set via `pnpm db:studio` (the editors don't
exist yet, deliberately); one announcement email goes out from the coach's personal
account; then nobody sends a single text. Game-day morning, the RSVP table is
snapshotted and the weekend's question-texts are tallied. The findings land as a comment
on #9 with an explicit decision: proceed, re-run, or fix notification design first.

The plan adds one thing the issue implies but doesn't spell out: a **production
pre-flight dry run** with a throwaway team and a secondary email address, because real
parents are a one-shot resource and nothing in the repo proves the production deploy,
migration, or email delivery has ever been exercised end to end.

## Scope

### In Scope
- Production pre-flight: deploy/env/migration verification and a full fake-parent walk-through
- Seeding the real team, roster, guardians, invitations, game, and hand-set chart
- One announcement email (personal email client — in-app broadcast is #13)
- The no-text discipline, measurement, findings comment, and gate decision

### Out of Scope
- Any feature code, including "small" notification improvements (that's the *other* branch of the gate decision)
- The under-5-minute lineup-editing target — unmeasurable until #11's editors exist
- #10, #11, #13, #14 — all blocked on this gate's outcome

## Acceptance Criteria

1. Real team created and roster seeded through the UI
2. Real parents invited; invitation arrival (and spam placement) confirmed
3. `battingOrder` / `position` hand-set on `RosterEntry` via `pnpm db:studio`
4. Weekend's real game on the schedule
5. Exactly one announcement email sent; zero texts afterward
6. Recorded: % of players with an RSVP before game day
7. Recorded: count of "what time / where / is he playing" texts on game day
8. Recorded: parent confusion, especially around the three RSVP states
   — verified invariant: RSVP state never removes a player from the roster, lineup, or
   diamond; declined and no-response players stay in place, and any chart change is the
   coach's manual decision
9. Findings written as a comment on #9
10. Explicit decision: proceed to the chart editors, or fix notification design first

## Implementation Phases

| Phase | Description | Areas Affected |
|---|---|---|
| 1 | Production pre-flight dry run (fake parent, throwaway team) | Vercel env, Neon migration, Resend domain — no repo changes |
| 2 | Seed real team, roster, invitations, game, hand-set chart | Production data only |
| 3 | One announcement email, then hands off | — |
| 4 | Game-day measurement (RSVP snapshot, text tally, confusion log) | — |
| 5 | Findings comment on #9 + gate decision | GitHub issue |

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Email deliverability failure read as parent apathy | High | Pre-flight dry run to a secondary address; post-game spot-check with 1–2 parents |
| Timezone bug shows the game under the wrong day in production | High | Verify rendered event time on the production site during pre-flight and after creating the real game |
| Hand-seeded chart error is parents' first impression | Med | Proofread `/t/[teamId]/view` on a phone before announcing |
| Unique-constraint collisions while editing in Studio | Low | Single-pass assignment; null-then-set for swaps |
| A reminder text slips from spouse/assistant coach | Med — invalidates the result | Tell everyone with the chart about the rule; record violations honestly |
| Rain-out | Low | Re-run next weekend with the same seeded data; the gate needs a real game |

## Effort Estimate

**Overall:** Small in effort, ~1 week in calendar time (dominated by waiting for the game).

| Phase | Estimate |
|---|---|
| 1 — Pre-flight | 1–2 hours (plus fixes if the dry run finds deployment issues) |
| 2 — Seeding | 1–2 hours |
| 3 — Announcement | 15 minutes |
| 4 — Measurement | 30 minutes across game day |
| 5 — Findings + decision | 30–60 minutes |

## Next Steps

1. Review and approve this proposal.
2. On approval, this proposal is posted as a comment on #9, and the coach executes
   `task-doc.md` phase by phase against the real weekend.
3. After the findings comment and a proceed decision, close #9 with the `finalize-issue`
   skill (no PR to verify — archive `.agents/issue-planner/9/` and close the issue),
   unblocking #10, #11, #13, #14.
