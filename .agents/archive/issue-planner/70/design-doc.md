# Design Doc — Repeat-weekly on event create (#70)

## Overview

A twelve-game season is currently twelve submits of a form that is already correct except
for the date (#51 made type/location/opponent sticky and added "Duplicate event").
Repeat-weekly removes those remaining submits: the coach fills the form once, says how many
weeks it repeats, and one submit writes the whole run in a single transaction. Everything
the issue flagged as "needs deciding first" was decided in planning Q&A — see Direction
decisions.

## Direction decisions (from planning Q&A)

- **Bound is a repeat count, not an end date.** The coach types "8", not a final date.
  (The issue leaned toward a date; the owner chose the count when asked.)
- **Cap is 30** — `MAX_REPEAT_WEEKS = 30`, matching the `MAX_ROWS` precedent from the bulk
  invite. More than a season and a half of weekly events; a forged POST cannot exceed it.
- **No per-date skip checklist.** Gaps (tournament weekends, holidays) are handled by
  creating every week and deleting the strays afterward — one field, one preview, one
  submit.
- **All-or-nothing.** The batch writes in one `$transaction`; if any row fails, none land.
  Unlike the bulk invite's emails, a create is cleanly reversible, so partial success has
  nothing to offer but ambiguity.
- **One combined announcement.** A guardian gets one email listing all the new dates, not
  N copies of the single-event announcement.

## Acceptance Criteria

- [ ] The add-event form gains an optional "Repeat weekly" count (1–30); blank or 1 means
      exactly today's behavior, byte for byte — one event, one announcement, same banner.
- [ ] With a count of N and a start date, the form shows what it is about to do before the
      coach commits: "N events, weekly through <last date>".
- [ ] Submit creates N events, 7 wall-clock days apart in `APP_TIMEZONE` — 6:00 PM stays
      6:00 PM across the March and November DST boundaries (stepping in the zone, never
      `+ 7×24h` on an instant).
- [ ] The N creates run in a single `$transaction`; a failure rolls all of them back and
      the coach sees an error with their typed values intact.
- [ ] A count outside 1–30 (or non-integer) is rejected as a typed validation state
      (`invalid-repeat`) naming the limit, with values echoed back.
- [ ] Guardians receive **one** email (and at most one push) announcing the batch, listing
      the dates, linking to the schedule page. Occurrences already in the past are not
      announced (same strictly-future rule as `shouldAnnounceEvent`).
- [ ] The coach's receipt email reports the batch send outcome, as it does for a single
      event today.
- [ ] The success banner names the batch ("8 games, Sat, Apr 4 – Sat, May 23 …") and keeps
      the same sticky-fields behavior; **the repeat count itself always clears** after a
      successful add.
- [ ] Out of scope, per the issue: anything beyond weekly — biweekly, per-day-of-week
      patterns, a recurrence model. No schema change of any kind.

## Architecture & Data Model

### Data Layer

**No schema change.** `Event` (`prisma/schema.prisma:219`) already holds everything; the
batch is N ordinary rows. `Event` has no unique constraint on `(teamId, startsAt)`, so
duplicate-time collisions cannot abort the transaction — the only transaction failures are
outages, which propagate exactly as `createEvent`'s do today.

New in `src/lib/schedule.ts`:

| Function | Type | Purpose |
|---|---|---|
| `createEvents(teamId, inputs: EventInput[])` | Internal, thin DB wrapper | Array-form `db.$transaction([...creates])`, each `create` carrying `teamId`, returning the created `ScheduleEvent[]`. Array-form (not interactive) because the statements are known up front — the same shape and the same reasoning as `saveBattingOrder` in `roster.ts`. `createMany` is rejected: it returns only a count, and the action needs the rows. |

New pure logic in `src/lib/calendar.ts` (per the repo rule: decision pure and DB-free,
loading in a thin wrapper):

| Function | Purpose |
|---|---|
| `MAX_REPEAT_WEEKS = 30` | The cap, exported so the action, the form, and the message table all read one number. |
| `weeklyOccurrences(startWallClock: string, total: number): Date[]` | Parses the wall clock once (same `WALL_CLOCK_PATTERN` rules as `wallClockToInstant`; throws `RangeError` on garbage or `total` outside 1–`MAX_REPEAT_WEEKS`), then builds occurrence *k* as `new TZDate(year, month−1, day + 7k, hour, minute, 0, APP_TIMEZONE)` — day-component arithmetic in the zone, so the wall clock is held fixed across DST by construction. Returns plain `Date`s via `getTime()` (the module's own `toISOString` rule). |

### API / Service Layer

| Endpoint / Function | Type | Auth | Purpose |
|---|---|---|---|
| `createEventAction` (extended, not a new action) | Server Action | COACH+ via `requireTeamAccess`, archived teams rejected | Grows a `repeat` form field. `repeat` absent/blank/`"1"` → the existing single-event path, untouched. N ≥ 2 → `weeklyOccurrences`, `createEvents`, combined announcement. |
| `announceEvents` (new, beside `announceEvent` in `schedule/actions.ts`) | Deferred (`after()`) | n/a (post-auth) | One paced email per guardian for the whole batch, then the receipt. Same three rules as `announceEvent`: cannot fail the events, recipients from the roster, push rides along and never gates. |

A `repeat` field on the existing action rather than a `createEventsAction`: the form, the
sticky-value state machine, the context fields, and the access-failure redirect are all
identical, and a second action would duplicate every one of them to vary a loop bound.

Announcement filtering: the batch announces only occurrences strictly in the future
(`shouldAnnounceEvent` applied per occurrence). A coach back-filling a half-played season
gets the remaining games announced and the played ones silent — a refinement of the
single-event rule, not a departure from it. If no occurrence is future, status is `none`.

**The caps do not couple.** The fan-out is still one email per guardian regardless of N —
the batch multiplies rows written, not messages sent — so `MAX_RECIPIENTS = 200`,
`MIN_SEND_INTERVAL_MS = 600`, and the page's `maxDuration = 300` are all untouched. The
transaction itself is bounded by `MAX_REPEAT_WEEKS = 30` rows, which is trivial next to
120s of send pacing. This is worth a comment at the constant so the AGENTS.md "cap ×
interval" rule visibly still holds.

### Emails

| Module | Purpose |
|---|---|
| `src/emails/events-announcement-email.ts` (new pure builder) | `buildEventsAnnouncementEmail`: subject `[Team] N new games: Sat, Apr 4 – Sat, May 23…`, headline via the shared `buildEventHeadline`, a `dateTimeLabel` per occurrence via `formatEventDateTime`, URL = the **schedule page**. The single-event announcement links to the event page because "the announcement's one action is answering"; a batch has no single event to answer, and the schedule shows the whole run. |
| `src/emails/EventsAnnouncementEmail.tsx` (new template) | Plain like the other five: team name, headline, the list of dates, location/notes once (they are the same for every occurrence by construction), one schedule link. Nothing about any other family. |
| Receipt | Reuses `AnnouncementReceiptEmail` + `buildAnnouncementReceiptEmail` unchanged, passing headline `"8 games"` and a range `dateTimeLabel` (`"Sat, Apr 4 – Sat, May 23, 2026"`); the existing summary sentence reads correctly with a range. |

`List-Unsubscribe` **is** set on the combined announcement, pointing at the creating coach
— the same RFC 2369 test the single-event announcement passes, unchanged by batching.

### UI

| Piece | Change |
|---|---|
| `AddEventForm.tsx` | New optional number input "Repeat weekly" (`min=1 max=30 step=1`, `inputMode="numeric"`), plus the pre-commit preview line when `repeat ≥ 2` and `startsAt` is set. Inside the existing `fieldset disabled={pending}`. |
| `schedule/repeat-preview.ts` (new, co-located, pure) | `repeatPreview(startsAt, repeat): string \| null` — client-safe calendar math on the `YYYY-MM-DDTHH:mm` string (adding 7 days to date components is zone-free; the weekday of a pure calendar date is zone-independent). **Deliberately not in `calendar.ts`**: that module reads `process.env` and imports a generated-Prisma enum, neither of which belongs in a client bundle. |
| `event-form-state.ts` | `EventFormValues` gains `repeat: string` (default `""`); `AddEventField` gains `"repeat"`; `stickyValues` **clears `repeat`** — like the date it is the field it would be dangerous to keep, since a sticky "8" turns the next add into eight more events. Success summary text covers the batch. |
| `schedule-messages.ts` | `invalid-repeat: "Repeat must be a whole number between 1 and 30 weeks."` via the existing `messageTable`. |
| `page.tsx` | `duplicate=` prefill leaves `repeat` blank (a duplicated event is one event). |

## Key Decisions

### Decision 1: Where DST-safety lives

**Options considered:**
- A: Step the instant by `7 × 24h` and correct for DST after.
- B: Step day components in `APP_TIMEZONE` via `TZDate`, so each occurrence is
  independently "this wall clock on this date".

**Decision:** B.
**Rationale:** The wall clock is held fixed by construction rather than by correction —
there is no offset math to get wrong, and it reuses the exact trick `wallClockToInstant`
already pins with tests (the `TZDate` constructor normalizes day overflow across
month/year ends, which that function's own guard documents). The issue names A as "the
trap here".

### Decision 2: Extend `createEventAction` vs. a new `createEventsAction`

**Decision:** Extend, with `repeat ≤ 1` short-circuiting into the existing single path.
**Rationale:** One form posts it; the validation, sticky values, context carrying, and
access redirect are shared; and "repeat = 1 is byte-for-byte today's behavior" becomes a
testable property instead of a parallel-implementation promise.

### Decision 3: Batch announcement is a new email, not N sends

**Decision:** One `EventsAnnouncementEmail` per guardian listing all announceable dates.
**Rationale:** Owner's call in Q&A, and it is also what `buildAnnouncementRecipients`'s
own comment warns about — mailing a family N times about one coach action "is how a family
learns that this app's email is noise". Keeps the fan-out cost identical to a single
event's, which is why no cap or `maxDuration` moves.

### Decision 4: The preview is client-side string math

**Decision:** A tiny pure `repeat-preview.ts` beside the form, not a server round trip and
not an import from `calendar.ts`.
**Rationale:** "Same wall clock, +7 days" needs no timezone to *name the dates* — only the
instant conversion does, and that stays server-side in `weeklyOccurrences`. Importing
`calendar.ts` into the client bundle would drag `process.env` reads and a generated-Prisma
import across the boundary.

## Security & Permissions

- COACH+ via the existing `requireTeamAccess(teamId, { intent: "write", minRole: "COACH" })`;
  archived teams reject the write there, unchanged.
- `repeat` is parsed and capped server-side (Zod + `weeklyOccurrences`' own range check);
  the form's `max=30` is a convenience, not the boundary.
- Every `create` in the transaction carries `teamId` — same cross-team-forgery posture as
  every other write in `schedule.ts`.
- Recipients still resolve from the roster, never from the POST.

## Error Handling

| Failure | Behavior |
|---|---|
| `repeat` non-integer / out of 1–30 | `{status: "invalid", code: "invalid-repeat", field: "repeat", values}` — typed state, values intact, message names the limit. |
| Bad wall clock | Existing `invalid-datetime` path, unchanged. |
| Transaction failure (outage) | Propagates like `createEvent` today — no partial batch exists to report. |
| Roster unreadable at announce-resolve | Existing `announcement: {status: "failed"}` banner + "Tell parents from Messages", unchanged. |
| Send failures | Counted and reported in the receipt, never thrown — `announceEvents` follows `announceEvent`'s "nothing here may throw" rule verbatim. |

## Testing Strategy

| Layer | Test Type | File(s) | Notes |
|---|---|---|---|
| `weeklyOccurrences` | Unit | `src/lib/calendar.test.ts` | total 1 and N; **spring-forward (Mar 8 2026) and fall-back (Nov 1 2026) crossings hold the wall clock**; month/year rollover; cap and garbage throw `RangeError`. |
| Batch announce rule | Unit | `src/lib/announcements.test.ts` | Per-occurrence future filter: all past → none; mixed → future subset only. |
| Email builder | Unit | `src/emails/events-announcement-email.test.ts` | Subject count + range, per-date labels via `formatEventDateTime`, schedule URL. |
| `createEvents` | Unit (mocked db) | `src/lib/schedule.test.ts` | Array-form `$transaction`; `teamId` on every create. |
| Action | Unit | `schedule/actions.test.ts` | `repeat` blank/`"1"` → single path unchanged (pin it); N → transaction + one combined announcement; `invalid-repeat` state; past-occurrence filtering. |
| Preview | Unit | `schedule/repeat-preview.test.ts` | Dates, count wording, null when inputs incomplete. |
| Form | Component | `schedule/AddEventForm.test.tsx` | Field renders, preview appears at N ≥ 2, repeat clears after add, error attribution to the `repeat` field. |

Static imports throughout, per AGENTS.md.

## Config Changes

- [ ] Schema / index changes — **none** (deliberately; Decision 16's warning stands).
- [ ] Access rule changes — none.
- [ ] Environment variables — none.
- [ ] Dependency changes — none (`@date-fns/tz` already present).

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| DST boundary inside the run | High if wrong | Day-component stepping in zone; both 2026 boundaries pinned by tests. |
| Sticky repeat count multiplying the next add | High | `stickyValues` clears `repeat`; pinned by a form test. |
| Coach typos 30 instead of 3 | Med | Pre-commit preview names the count and last date; chart-less cleanup is per-event delete (accepted in Q&A: create-all-delete-after). |
| Two events at the same instant (overlapping runs) | Low | Already representable today; no unique constraint exists; out of scope. |
| First occurrences past, rest future | Low | Announce the future subset; past rows still created (back-fill is legitimate). |
| Forged `repeat=500` | Low | Server-side cap; `weeklyOccurrences` throws before any write. |
