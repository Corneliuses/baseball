# Proposal — Coach-recorded absences: let staff set a player's RSVP on their behalf (#54)

## Executive Summary

RSVP is structurally guardian-only today, so when a parent texts "Mason's out Saturday"
the coach has no way to record it and readiness keeps reporting "No response" — eroding
trust in the one screen built to be trusted. This change adds a staff path to the
existing `rsvpAction`: COACH+ can set (Going / Not going) or clear any rostered player's
RSVP from the event page, while parents' own controls are untouched.

The approach follows the issue's proposal directly. One nullable column,
`Rsvp.recordedById`, carries provenance: every write sets it (staff) or nulls it
(family) in the same upsert, so last-write-wins covers both state and provenance with no
special casing — the same ownership policy as profile phone numbers. The event page
shows "Recorded by coach" next to staff-recorded badges. Readiness needs zero changes:
it reads `Rsvp` rows regardless of author, so coach-recorded absences flow into it
immediately.

## Scope

### In Scope
- Staff (COACH/OWNER) Going / Not going / Clear controls on every roster row of the
  event page's attendance list
- `recordedById` column + migration; provenance written on every RSVP write
- "Recorded by coach" note on the event page for staff-recorded responses
- A `clear` response (deletes the row → back to "No response"), surfaced in the staff UI
- Server-side two-path authorization: guardian path unchanged; staff path skips
  guardianship but never team/event scoping (new `isPlayerRostered` check)

### Out of Scope
- Provenance display on team home, `/view`, or `/readiness` (the column exists; cheap
  follow-up if families ask — Decision 3 in the design doc)
- Coach controls on team home's one-tap RSVP (event page only, per the AC; also avoids
  new grace-window write surfaces)
- Showing *which* coach recorded it (data is stored; UI deferred)
- A Clear button for parents (the action accepts it; UI stays as-is)
- Any change to readiness, notifications, or the chart

## Acceptance Criteria

1. A coach can mark any rostered player Going / Not going / clear on any open event,
   from the event page
2. A staff-recorded response is visually distinguishable from a family-recorded one
3. A guardian's own tap overwrites a coach entry (and vice versa) with no special casing
4. Parents still cannot set other families' RSVPs; archived teams and past events still
   reject all writes (archived via `requireTeamAccess`; the started-event gate on
   `from=home` posts is preserved, and the event page keeps accepting deliberate late
   answers exactly as it does for guardians today)
5. Readiness reflects coach-recorded absences immediately (holds by construction — it
   consumes the provenance-blind tri-state map)

## Implementation Phases

| Phase | Description | Areas Affected |
|---|---|---|
| 1 | Schema & data layer: `recordedById` migration, `upsertRsvp`/`clearRsvp`/`isPlayerRostered`, pure `staffRecordedPlayerIds` | `prisma/`, `src/lib/rsvp.ts`, `src/lib/rsvps.ts` |
| 2 | Action & UI: two-path authorization in `rsvpAction`, `clear` response, staff controls + provenance note on the event page | `src/app/t/[teamId]/schedule/` |
| 3 | Docs: optional one-line AGENTS.md note | `AGENTS.md` |

One PR; the phases order the work, not the review.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Cross-team write via crafted form (coach names another team's player) | Med | `isPlayerRostered(teamId, playerId)` mirrors the guardian path's roster intersection; `getEvent(teamId, eventId)` already pins the event |
| Coach/guardian race on the same kid | Low | Single upsert on `@@unique([eventId, playerId])` writes state + provenance atomically; last write wins |
| Migration/deploy ordering | Low | Column is additive and nullable; `pnpm build` runs `migrate deploy` before the app ships |
| Coach who guards the player sees "Recorded by coach" on their own kid | Low | Guardian path resolves first — records as family |
| Creating the migration needs a live DB | Low | Neon dev branch, or hand-written SQL verified with `prisma migrate diff` (documented in task-doc) |

## Effort Estimate

**Overall:** Small (1–2 days)

| Phase | Estimate |
|---|---|
| Phase 1 | 0.5 day |
| Phase 2 | 0.5–1 day (action tests are the bulk) |
| Phase 3 | minutes |

## Next Steps

1. Review and approve this proposal.
2. Follow `task-doc.md` to implement phase by phase.
3. After implementation, finalize with the `finalize-issue` skill (verify AC against the
   PR, archive `.agents/issue-planner/54/`, merge, and close the issue).
