# Proposal — Repeat-weekly on event create (#70)

## Executive Summary

The add-event form gains an optional "Repeat weekly" count (1–30). One submit writes the
whole run of events in a single all-or-nothing `$transaction`, stepping 7 wall-clock days
at a time in `APP_TIMEZONE` so 6:00 PM stays 6:00 PM across DST boundaries. Families get
**one** combined announcement email listing all the new dates (never N copies), the coach
gets the usual receipt, and a blank or `1` count is byte-for-byte today's single-event
behavior. No schema change, no new caps to couple to `maxDuration` — the fan-out is still
one email per guardian regardless of how many events were written.

The decision surface the issue asked to settle first was settled in planning Q&A: repeat
**count** (not end date), cap **30**, **no** per-date skip checklist (create all, delete
strays), **transactional** failure mode, **combined** announcement.

## Scope

### In Scope
- `weeklyOccurrences(startWallClock, total)` + `MAX_REPEAT_WEEKS` in `src/lib/calendar.ts`
  (pure, DST-safe, co-located tests)
- `createEvents` in `src/lib/schedule.ts` — array-form `$transaction`, `teamId` on every row
- `repeat` field on `createEventAction` (no new action); `invalid-repeat` typed validation
- Combined batch announcement: new `EventsAnnouncementEmail` + pure builder, one email and
  at most one push per guardian, receipt reused; past occurrences filtered per
  `shouldAnnounceEvent`'s strictly-future rule
- Form: repeat input + pre-commit preview ("N events, weekly through <date>") via a pure
  client-safe helper; repeat always clears after a successful add

### Out of Scope
- Anything beyond weekly (biweekly, per-day-of-week, general recurrence — the issue's own
  exclusion, backed by Decision 16)
- Per-date skip checklist (owner chose create-all-delete-after)
- Any schema or migration work
- Changes to single-event announcement behavior

## Acceptance Criteria

1. Optional "Repeat weekly" count (1–30) on the add-event form; blank/1 is exactly today's
   single-event behavior.
2. Pre-commit preview names the count and last date once repeat ≥ 2 and a start is set.
3. N events land 7 wall-clock days apart in `APP_TIMEZONE`; DST crossings hold the wall
   clock (pinned by tests at both 2026 boundaries).
4. The batch is one `$transaction` — any failure rolls back all rows, typed values intact.
5. Out-of-range/non-integer counts return a typed `invalid-repeat` state naming the limit.
6. Guardians get one combined announcement listing the dates, linking to the schedule;
   only strictly-future occurrences are announced; coach gets the receipt.
7. Success banner names the batch; the repeat count clears after every successful add.
8. No schema change; existing caps (`MAX_RECIPIENTS`, `maxDuration`) untouched and the
   non-coupling documented at the new constant.

## Implementation Phases

| Phase | Description | Areas Affected |
|---|---|---|
| 1 | Pure logic: occurrences, announce filter, email builder + template | `src/lib/calendar.*`, `src/lib/announcements.*`, `src/emails/` |
| 2 | Data + action: `createEvents` transaction, `repeat` parsing, `announceEvents` | `src/lib/schedule.*`, `schedule/actions.*` |
| 3 | Form + state: input, preview, sticky-clear, message table | `schedule/AddEventForm.*`, `event-form-state.ts`, `repeat-preview.*`, `schedule-messages.ts` |

One PR; the phases are an implementation order, not separate deliverables — none is
independently shippable in a way that reduces risk.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| DST math done on instants instead of wall clocks | High | Day-component stepping via `TZDate`; both 2026 boundaries pinned by tests |
| Sticky repeat count silently multiplying the next add | High | `stickyValues` clears it; form test pins the clear |
| Batch announcement regressing to N emails per family | Med | One resolver, one send loop, one template; action test asserts a single scheduled announcement |
| Coach typos the count | Med | Preview names count + last date before commit; per-event delete is the accepted cleanup |
| Client bundle dragging in `calendar.ts` (env + generated Prisma) | Low | Preview helper is a separate pure module beside the form |

## Effort Estimate

**Overall:** Small–Medium (~2–3 days including tests and review cycles)

| Phase | Estimate |
|---|---|
| Phase 1 | ~1 day |
| Phase 2 | ~1 day |
| Phase 3 | ~0.5–1 day |

## Next Steps

1. Review and approve this proposal.
2. Follow `task-doc.md` phase by phase; `pnpm check` before reporting done.
3. After implementation, finalize with the `finalize-issue` skill (verify AC against the
   PR, archive `.agents/issue-planner/70/`, merge, and close the issue).
