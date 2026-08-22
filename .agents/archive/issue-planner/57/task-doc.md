# Task Doc — ICS calendar subscription (#57)

## Prerequisites

- [ ] None blocking. (A Neon dev branch URL is *nice to have* to validate the migration
      SQL; the migration itself is hand-authored offline — see Phase 1.)

## Phase 1: Schema & token

- [ ] Add `calendarToken String @unique` to `Team` in `prisma/schema.prisma`, with a
      doc comment tying it to the Invitation-token posture (unguessable, revocable)
- [ ] Create `prisma/migrations/<timestamp>_add_team_calendar_token/migration.sql`:
      `CREATE EXTENSION IF NOT EXISTS pgcrypto;` → add column nullable → backfill
      `translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_')` → `SET NOT NULL`
      → unique index. Generate the shape with
      `pnpm exec prisma migrate diff --from-schema-datamodel <old> --to-schema-datamodel prisma/schema.prisma --script`
      and splice in the backfill (the diff alone would fail on existing rows)
- [ ] `pnpm db:generate` to refresh the client
- [ ] Create `src/lib/calendar-token.ts` — `generateCalendarToken()` (32 bytes,
      base64url), mirroring `src/lib/invitation-token.ts`
- [ ] Write `src/lib/calendar-token.test.ts` (mirror `invitation-token.test.ts`)
- [ ] Wire `generateCalendarToken()` into `createTeam` in `src/lib/teams.ts` (add
      `calendarToken` to the nested create data; check `TEAM_SELECT` needs no change)
- [ ] Update `src/lib/teams.test.ts` for the new create field

## Phase 2: ICS builder & feed data layer

- [ ] Create `src/lib/ics.ts` — pure `buildTeamCalendar(team, events, now)`:
      VCALENDAR wrapper (`VERSION`, `PRODID`, `CALSCALE`, `X-WR-CALNAME` from team
      name + season, `REFRESH-INTERVAL;VALUE=DURATION:PT12H`, `X-PUBLISHED-TTL:PT12H`);
      per-event VEVENT (`UID:<id>@youth-baseball-team-manager`, `DTSTAMP` from `now`,
      `DTSTART`/`DTEND` in UTC `YYYYMMDDTHHMMSSZ`, summaries `Game vs Hawks` / `Game` /
      `Practice`, `LOCATION`, `DESCRIPTION` from notes); TEXT escaping; 75-octet CRLF
      folding; duration constants GAME = 2h, PRACTICE = 1.5h
- [ ] Write `src/lib/ics.test.ts` — escaping, folding, CRLF, late-evening Central
      instant lands on next UTC day, UID stability, empty calendar, no
      roster/user/RSVP strings in output
- [ ] Create `src/lib/calendar-feed.ts` — `getTeamByCalendarToken(token)` (select
      `id, name, season` only) and `listAllEvents(teamId)` (all events ascending,
      `teamId` in the where clause, `EVENT_SELECT`-shaped select); module docstring on
      why db errors propagate (outage must not sync an empty calendar)
- [ ] Write `src/lib/calendar-feed.test.ts` (mocked `db`, per `schedule.test.ts` pattern)

## Phase 3: Route Handler & schedule-page surface

- [ ] Create `src/app/api/calendar/[token]/route.ts` — `GET`: resolve token → 404 or
      build feed; headers `Content-Type: text/calendar; charset=utf-8`,
      `Cache-Control: private, max-age=3600`; doc comment on why it is a Route Handler
      and why it lives outside `/t/` (proxy matcher)
- [ ] Write `src/app/api/calendar/[token]/route.test.ts` — 404, 200 + headers,
      archived team served, db error propagates
- [ ] Add the "Subscribe in your calendar app" card to
      `src/app/t/[teamId]/schedule/page.tsx`: load `calendarToken` (extend the page's
      team read or a small `calendar-feed.ts` helper), build the URL with
      `absoluteUrl` (`src/lib/absolute-url.ts`), render read-only input + `webcal://`
      link. Visible to all roles
- [ ] Extend `src/app/t/[teamId]/schedule/page.test.tsx` for the card (static imports)
- [ ] Update AGENTS.md's route inventory sentence to mention the feed endpoint (it
      enumerates `src/app/` routes; the decision record under `.agents/` is untouched)

## Pre-Commit Gate

Per AGENTS.md `## Commands`:

- [ ] `pnpm check` (lint → typecheck → test) ✅
- [ ] `pnpm exec next build` ✅ (never `pnpm build` off-Vercel — it runs `prisma migrate deploy` first)

## Files Modified / Created

| File | Change |
|---|---|
| `prisma/schema.prisma` | `Team.calendarToken String @unique` |
| `prisma/migrations/<ts>_add_team_calendar_token/migration.sql` | New — pgcrypto backfill migration |
| `src/lib/calendar-token.ts` (+test) | New — token generator |
| `src/lib/ics.ts` (+test) | New — pure RFC 5545 builder |
| `src/lib/calendar-feed.ts` (+test) | New — token→team + all-events reads |
| `src/lib/teams.ts` (+test) | Generate token in `createTeam` |
| `src/app/api/calendar/[token]/route.ts` (+test) | New — the feed endpoint |
| `src/app/t/[teamId]/schedule/page.tsx` (+test) | Subscribe card |
| `AGENTS.md` | Route inventory mention |
