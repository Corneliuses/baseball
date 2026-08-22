# Proposal — ICS calendar subscription: put the schedule in parents' phone calendars (#57)

## Executive Summary

Serve each team's schedule as a standard ICS feed that parents subscribe to once in
Apple/Google Calendar, after which every game and practice — including later edits —
appears in their phone calendar automatically. Auth is a per-team capability token (an
unguessable 256-bit random string in the URL, the invitation-token pattern), because
calendar apps poll server-side with no cookies. The feed is read-only, contains event
data only (no roster, names, or RSVPs), and is built from three small pieces that follow
the repo's existing shape: a pure RFC 5545 builder in `src/lib/ics.ts`, a thin
team-scoped data layer in `src/lib/calendar-feed.ts`, and a Route Handler at
`GET /api/calendar/[token]` — deliberately outside `/t/` so the cookie-checking proxy
never intercepts a calendar app's fetch.

## Scope

### In Scope
- `Team.calendarToken` column (unique, non-nullable) + the repo's second migration, with
  a SQL backfill for existing teams; new teams get a token at creation
- Pure ICS builder: UTC `DTSTART`/`DTEND`, nominal durations (games 2h, practices 1.5h),
  stable UIDs, refresh-interval hints, RFC 5545 escaping and folding
- `GET /api/calendar/[token]` Route Handler with `text/calendar` + polling-friendly cache
  headers; unknown token → 404; archived teams served read-only
- "Subscribe in your calendar app" card on the schedule page (all roles): the feed URL +
  a `webcal://` link
- Unit tests at every layer; AGENTS.md route-inventory mention

### Out of Scope
- Token rotation/revocation UI (owner's call — the column is revocable by design; follow-up issue)
- Per-member tokens (owner chose per-team)
- Any per-event end-time field on `Event` (durations are display constants in the feed)
- Push/notification work of any kind

## Acceptance Criteria

1. Subscribing to the URL in Apple/Google Calendar shows all team events at correct local times
2. New and edited events appear on the next poll without re-subscribing
3. The URL works signed-out but is unguessable; no player or family data is in the feed
4. Archived teams' feeds keep working read-only (the schedule remains visible in-app too)

## Implementation Phases

| Phase | Description | Areas Affected |
|---|---|---|
| 1 | Schema & token — column, backfill migration, generator, `createTeam` wiring | `prisma/`, `src/lib/calendar-token.ts`, `src/lib/teams.ts` |
| 2 | ICS builder & feed data layer (pure + thin wrapper, fully unit-tested) | `src/lib/ics.ts`, `src/lib/calendar-feed.ts` |
| 3 | Route Handler & schedule-page subscribe card | `src/app/api/calendar/[token]/`, `src/app/t/[teamId]/schedule/page.tsx`, `AGENTS.md` |

One PR — the phases order the work; nothing here warrants separate PRs.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Migration authoring needs care (no local Postgres; Preview deploys migrate the shared prod db) | Med | Hand-author additive-only SQL offline via `prisma migrate diff`; `CREATE EXTENSION IF NOT EXISTS pgcrypto` for the backfill; validate on a Neon dev branch if available |
| Coach-entered text (`notes`, `opponent`, `location`) corrupting the feed | Med | RFC 5545 TEXT escaping + 75-octet folding, unit-tested against hostile input |
| A db outage serving an empty feed that calendar apps sync as "all events deleted" | High | Feed queries propagate errors (500) instead of swallowing to `[]` — apps keep their last good copy |
| Event duplication if UIDs drift across deploys | Med | UID = `<eventId>@` fixed domain string, never the request host |
| Leaked feed URL | Low (event data only) | Same capability-URL posture as `/invite/[token]`; rotation is a planned follow-up |

## Effort Estimate

**Overall:** Small (1–2 days)

| Phase | Estimate |
|---|---|
| Phase 1 | 0.5 day |
| Phase 2 | 0.5 day |
| Phase 3 | 0.5 day (incl. gate + PR) |

## Next Steps

1. Review and approve this proposal.
2. Follow `task-doc.md` to implement phase by phase.
3. After implementation, finalize with the `finalize-issue` skill (verify AC against the
   PR, archive `.agents/issue-planner/57/`, merge, and close the issue).
