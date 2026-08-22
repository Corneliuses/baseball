# Design Doc — ICS calendar subscription: put the schedule in parents' phone calendars (#57)

## Overview

Parents live in their phone calendars; today the schedule exists only inside the app. A
read-only ICS feed, authenticated by an unguessable capability token in the URL, puts
every game and practice where families already look — with zero notification
infrastructure and no session requirement, since calendar apps poll server-side with no
cookies.

## Acceptance Criteria

From the issue, with clarifications from planning:

- [ ] Subscribing to the URL in Apple/Google Calendar shows all team events at correct local times
- [ ] New and edited events appear on the next poll without re-subscribing
- [ ] The URL works signed-out but is unguessable; no player or family data is in the feed
- [ ] Archived teams' feeds keep working read-only (the schedule remains visible in-app too)

Clarified during planning:

- **Token scope is per-team** (owner's call): one `calendarToken` on `Team`, one URL
  shared by the whole team. The known trade-off — a departed family keeps the feed until
  the token is rotated — is accepted; the feed contains event data only, which the
  schedule page already showed them.
- **No rotation UI in this ticket** (owner's call): generation + surfacing only. The
  token is a plain unique column, so revocation/rotation is a one-column update when a
  follow-up issue picks it up. Nothing here paints that into a corner.

## Architecture & Data Model

### Data Layer

**Schema change** — one column on `Team`:

```prisma
model Team {
  // ...
  /// Capability credential for the ICS feed URL. Treat like Invitation.token:
  /// unguessable (32 random bytes, base64url), revocable by overwriting.
  calendarToken String @unique
}
```

Non-nullable. `createTeam` generates it in app code; the migration backfills existing
rows in SQL (`translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_')`, via
pgcrypto — `translate` drops the `=` padding since the third argument is shorter). Adding
the column nullable-with-lazy-generation was rejected: the lazy "ensure" is a write, and
archived teams reject every write — a rule this feature must not carve an exception into.
This is the repo's **second migration** (`add_team_calendar_token`).

**New modules** (both follow the pure-logic / thin-data-wrapper split):

- `src/lib/calendar-token.ts` — `generateCalendarToken()`: 32 random bytes base64url,
  mirroring `invitation-token.ts` exactly.
- `src/lib/ics.ts` — **pure, DB-free** ICS 5545 builder: `buildTeamCalendar(team, events, now)`
  → string. Owns escaping, line folding, UTC date formatting, durations.
- `src/lib/calendar-feed.ts` — the thin data layer: `getTeamByCalendarToken(token)`
  (selects `id`, `name`, `season` only — resolving by unique token IS the authorization)
  and `listAllEvents(teamId)` (every event, past and future, `teamId` in the where clause
  like every `schedule.ts` query; selects only `EVENT_SELECT`-shaped fields).

### API / Service Layer

| Endpoint / Function | Type | Auth | Purpose |
|---|---|---|---|
| `GET /api/calendar/[token]` | Route Handler | Capability token in path | Serve `text/calendar` feed for the token's team |
| `getTeamByCalendarToken` | Internal (`src/lib/calendar-feed.ts`) | — | Resolve token → team, or null |
| `listAllEvents` | Internal (`src/lib/calendar-feed.ts`) | — | All events for one team, ascending |
| `buildTeamCalendar` | Internal, pure (`src/lib/ics.ts`) | — | Render VCALENDAR text |

The route lives under `/api/`, **not** `/t/[teamId]/…` as the issue sketched: `proxy.ts`
matches `/t/:path*` and redirects cookie-less requests to `/signin` — which is every
request a calendar app will ever make. `/api/` paths are outside the matcher, exactly
like the magic-link callback (the sanctioned Route Handler precedent in AGENTS.md). The
URL also carries no `teamId`; the token alone resolves the team, so the path leaks
nothing.

Response headers:

- `Content-Type: text/calendar; charset=utf-8`
- `Cache-Control: private, max-age=3600` — friendly to polling, stale by at most an hour
  (calendar apps poll on multi-hour cycles anyway), `private` keeps shared caches out of
  a capability URL.
- Unknown token → plain 404. No redirect to sign-in, no hint.

### UI

One addition to `src/app/t/[teamId]/schedule/page.tsx` (all roles — parents are the
audience): a "Subscribe in your calendar app" card showing the feed URL built with
`absoluteUrl(`/api/calendar/${token}`, process.env)`, as selectable text in a read-only
input, plus an `href="webcal://…"` link (same URL, scheme swapped) that opens straight
into Apple Calendar. Server-rendered; no client component, no clipboard JS.

## Key Decisions

### Decision 1: Feed route lives at `/api/calendar/[token]`, not under `/t/`

**Options considered:**
- Option A: `GET /t/[teamId]/calendar.ics` (as the issue sketches) with a proxy matcher exclusion
- Option B: `GET /api/calendar/[token]` — outside the matcher naturally

**Decision:** Option B.
**Rationale:** The proxy's matcher is the app's optimistic auth line; carving a negative
lookahead exception into `["/t/:path*"]` makes the *matcher* express an authorization
rule, which AGENTS.md explicitly keeps out of proxy. `/api/` already hosts the app's one
other real HTTP endpoint. The token also fully determines the team, so a `teamId` path
segment would be redundant input that the handler must cross-check or ignore.

### Decision 2: Per-team token, non-nullable, backfilled in the migration

**Options considered:**
- Option A: Per-member token (revocation per family, dies with membership)
- Option B: Per-team token (one URL for everyone)

**Decision:** Option B — the owner chose per-team during planning.
**Rationale:** One coach, small teams, event-data-only payload. Non-nullable with SQL
backfill (rather than nullable + lazy generation) keeps the read path pure and avoids a
write on archived teams — see Data Layer above.

### Decision 3: Nominal event durations

`Event` stores only `startsAt`. ICS events want an end; a zero-length event renders
poorly. Constants in `ics.ts`: **games 2 hours, practices 1.5 hours**, expressed as
`DTEND = startsAt + duration`. These are display hints, documented as such — nothing
else in the app derives from them.

### Decision 4: UID and DTSTAMP strategy for "edits appear on next poll"

`UID: <eventId>@youth-baseball-team-manager` — keyed on the event's cuid with a fixed
domain string, **not** the deploy host: a UID that changes when `AUTH_URL` changes would
duplicate every event in subscribers' calendars. `Event` has no `updatedAt`, so `DTSTAMP`
is the serve time (passed as `now` — the builder stays pure); calendar apps reconcile by
UID and take the changed properties. Deleted events simply leave the feed, which
subscription semantics handle (the calendar drops VEVENTs no longer present).

### Decision 5: Correct local times without touching `calendar.ts`

`Event.startsAt` is already a true UTC instant (`wallClockToInstant` converted it on
write). The feed formats it directly as `YYYYMMDDTHHMMSSZ` — UTC form with `Z` — and the
subscriber's calendar app converts to the viewer's zone. No `APP_TIMEZONE`, no `TZDate`,
no VTIMEZONE block. The test proves the boundary case the issue names: a 8:00 PM
Central event (01:00Z next day) must carry the next-day UTC date and still land on the
right local evening when a calendar app renders it in `America/Chicago`.

## Security & Permissions

- **Authorization is the token.** 32 random bytes (256 bits) base64url via
  `node:crypto`, same strength as the invitation token; the unique-column lookup is the
  entire check. No session, no membership, no role — signed-out is the point.
- **Minors'-data posture:** the feed selects only `Event` fields (`type`, `startsAt`,
  `location`, `opponent`, `notes`). No roster, no names, no RSVP states, no user data.
  A test asserts the queries' selects and the rendered output contain none of these.
- **Archived teams serve read-only:** the feed is a read; `getTeamByCalendarToken`
  doesn't consult `archivedAt`. No write path exists in this feature after the
  migration backfill (token generation happens only inside `createTeam`).
- Token appears in server logs wherever URLs are logged — inherent to capability URLs,
  same posture as `/invite/[token]`, accepted.
- Coach-entered `notes`/`location`/`opponent` are untrusted text in a structured format —
  the escaper (`\` `;` `,` newline) is what prevents ICS property injection.

## Error Handling

| Failure | Behaviour |
|---|---|
| Unknown / rotated token | 404, empty body — no information about why |
| Database error resolving token or events | Propagates → 500. NOT swallowed: an outage must not serve an empty calendar that apps would happily sync, erasing every event client-side (`schedule.ts`'s `nextGame` non-swallow rationale, sharpened) |
| Team with zero events | Valid empty VCALENDAR, 200 — a real product state |

## Testing Strategy

| Layer | Test Type | File(s) | Notes |
|---|---|---|---|
| ICS builder | Unit (pure) | `src/lib/ics.test.ts` | Escaping (`,` `;` `\` newline in notes), 75-octet folding, CRLF endings, UTC `DTSTART` incl. late-evening Central → next UTC day, durations, UID stability, refresh hints, empty calendar, **no roster/user fields anywhere** |
| Token | Unit | `src/lib/calendar-token.test.ts` | Length, URL-safety, uniqueness — mirror of `invitation-token.test.ts` |
| Data layer | Unit (mocked db) | `src/lib/calendar-feed.test.ts` | `teamId` in the where clause; select lists contain only event/team display fields |
| Route Handler | Unit (mocked lib) | `src/app/api/calendar/[token]/route.test.ts` | 404 unknown token, 200 + `text/calendar` + cache headers, archived team still served, db error propagates |
| Schedule page | Component | `src/app/t/[teamId]/schedule/page.test.tsx` | Subscribe card renders the token URL and webcal link (extend existing suite; static imports per convention) |

## Config Changes

- [x] Schema / index changes — `Team.calendarToken String @unique` + migration `add_team_calendar_token` with pgcrypto backfill
- [ ] Access rule changes — none (capability token is the access rule)
- [ ] Environment variables — none (`absoluteUrl` reuses `AUTH_URL` precedence)
- [ ] Dependency changes — none; the ICS builder is hand-rolled (small, pure, testable — a dependency for ~100 lines of RFC 5545 isn't warranted)

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| Migration needs a live Postgres URL to create (AGENTS.md) | Med | Hand-author the migration directory + SQL (`prisma migrate diff --from-schema-datamodel … --to-schema-datamodel … --script` works offline); `prisma migrate deploy` applies it on next deploy. Validate SQL against a Neon dev branch if one is available |
| pgcrypto extension absent | Low | `CREATE EXTENSION IF NOT EXISTS pgcrypto;` first line of the migration — Neon supports it |
| Coach notes containing `,` `;` or newlines corrupt the feed | Med | RFC 5545 TEXT escaping + folding, unit-tested |
| Long lines break strict parsers | Low | Fold at 75 octets with CRLF + space |
| UID changes across deploys duplicating events | Med | Fixed-domain UID, never derived from request host |
| Empty schedule syncs as "delete everything" after a db outage | High | Feed queries do NOT swallow db errors — outage = 500, calendar apps keep their last good copy |
| Preview deploy applying this migration to production db | Known repo posture | Single pre-planned migration, additive only; consistent with AGENTS.md's documented acceptance |
