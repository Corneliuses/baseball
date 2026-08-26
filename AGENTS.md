<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Youth Baseball Team Manager

An invite-only PWA for one person who coaches youth baseball teams across seasons. The
coach sets a schedule and a standing batting order and positions chart; parents RSVP their
kids and see where and when their kid is playing, on a phone, at a field.

**Read `.agents/app-brainstorm/youth-baseball-team-manager/` before non-trivial work.**
`product-brief.md` is the scope and `stack-decisions.md` is 16 numbered decisions with
rationale. Both are a decision record — change them only when a decision is actually
being revised, not to reflect code.

## Repository Structure

```
prisma/            # schema.prisma — the domain model, heavily commented
public/            # Static assets: the crest, the PWA icon set, and sw.js (see Gotchas)
src/app/           # Next.js App Router pages and layouts
src/lib/           # Domain logic. Pure, DB-free modules live here with co-located tests
src/emails/        # React Email templates plus their pure props builders
src/generated/     # Prisma client output — gitignored, regenerate with pnpm db:generate
src/components/    # Shared UI: shadcn primitives in ui/, plus the diamond and its geometry
docs/design/       # The design plan and its SVG mockups — kept in step with the code by a test
.agents/           # Product brief and stack decisions (decision record — do not edit)
.claude/           # Agent config: workflow skills, agent defs, permissions (do not edit)
```

`src/app/` now has real routes: `/` (auth-gated landing), `/signin`, `/invite/[token]`
(unauthenticated invitation accept page — deliberately outside proxy.ts's matcher),
`/profile` (the signed-in person's own name and phone — global, not team-scoped, since
those are `User` columns — and the app's only sign-out, a server action wrapping Auth.js
`signOut`), and `/t/[teamId]/` (team home — the parent dashboard: a player card per kid
(`MiniDiamondHero` field art, jersey dot, slab name plate, chart-line marquee) and the
next three events, every one of them answerable in one tap — settings, roster,
members, the owner-only returning-player picker at `roster/returning`, the coach-only
bulk parent invite at `roster/invite`, the coach-only member directory, the coach-only
roster entry detail at `roster/[entryId]`, the schedule at `schedule` /
`schedule/[eventId]`, the read-only chart at `view`, the two coach-only drag-and-drop
chart editors — the batting order at `chart` and the positions diamond at
`chart/positions` — and team email messaging at `messages` (coach-only broadcast
history) and `messages/new` (the compose form every role uses) plus `/t/new` for
owner-gated team creation. Outside `/t/` entirely — because `proxy.ts` would bounce a
cookie-less calendar app to sign-in — `/api/calendar/[token]` serves each team's ICS
feed, authorized by the capability token in the URL (`Team.calendarToken`) rather than a
session; the subscribe URL is surfaced on the schedule page. `/api/cron/reminders` is the
other cookie-less endpoint — a Vercel Cron target that mails day-of reminders, authorized
by a `CRON_SECRET` bearer token. `/api/push/subscription` is session-authenticated and
per-person rather than per-team: it registers and removes the caller's own Web Push
subscriptions for the opt-in card on `/profile`.

**Contact details are staff-facing.** A parent never sees another family's phone or
email: `/directory` and `roster/[entryId]` are both COACH+, and the team home page gives
parents a coaching-staff-only contact card (`listCoachContacts`) so "ask your coach" is
an actual route. `/profile` is the counterpart — the one place a person reads back, and
fixes, what the team has on file for them.

## Tech Stack

- **Language**: TypeScript 5.9, `strict: true`
- **Framework**: Next.js 16.2 (App Router), React 19.2
- **Database**: Neon Postgres (via Vercel Marketplace) — *not* Prisma Postgres
- **ORM**: Prisma 7.9 with the `@prisma/adapter-pg` driver adapter
- **Auth**: Auth.js v5 beta (`next-auth@5.0.0-beta.32`) + Prisma adapter, magic-link only
- **Styling**: Tailwind CSS 4
- **Drag & drop**: `@dnd-kit` (core, sortable, utilities)
- **Animation**: `motion` v12 — import via `LazyMotion` + `m`, not the top-level `motion`
- **Email**: Resend + React Email
- **Push**: `web-push` + self-generated VAPID keys (Decision 8) — an enhancement layered
  on email, never a replacement
- **Validation**: Zod 4
- **Testing**: Vitest 4 + Testing Library, jsdom
- **Hosting**: Vercel
- **Package manager**: pnpm 10 — never npm or yarn

## Commands

| Purpose | Command |
|---|---|
| Dev server | `pnpm dev` |
| Build | `pnpm build` |
| Lint | `pnpm lint` |
| Type check | `pnpm typecheck` |
| Tests | `pnpm test` |
| Tests (watch) | `pnpm test:watch` |
| **All checks** | `pnpm check` |
| Regenerate Prisma client | `pnpm db:generate` |
| Create + apply a migration (dev only) | `pnpm db:migrate` |
| Apply existing migrations (production) | `pnpm db:deploy` |
| Browse data | `pnpm db:studio` |

`pnpm check` runs lint → typecheck → test and is what to run before reporting work done.

`.github/workflows/ci.yml` runs the same three on every pull request and every push to
main, plus a build — the half `pnpm check` cannot cover, since it never asks Next to
compile. **CI builds with `pnpm exec next build`, never `pnpm build`.** The package script
is `prisma migrate deploy && next build`, which is right on Vercel and wrong in CI:
Preview and Production share one `DATABASE_URL`, so the migrate step would apply
migrations to the production database from any branch, on every pull request. Nothing is
lost by skipping it — every route under `/t/[teamId]` is server-rendered on demand, so the
build reads no data and needs no `DATABASE_URL`. If that ever stops being true (a route
becomes static and queries at build time), CI needs a throwaway database, not the shared
URL.

## Architecture

Server Actions for mutations; Route Handlers only for things needing a real HTTP endpoint
(magic-link callback, the ICS feed, push subscription registration, the reminder cron
target). No separate API layer.

### Team scoping

Team ID lives **in the URL** (`/t/[teamId]/…`), never in a cookie or session. Hidden
"active team" state is how you open last season in one tab and write this season's chart
into it. Every scoped page loader and server action resolves access first.

`src/lib/team-access.ts` holds the pure decision function. Archived teams (`archivedAt`
non-null) reject **every** write regardless of role, owner included.

### Proxy is optimistic-only

`proxy.ts` (Next 16's renamed Middleware) does exactly one job here: redirect to sign-in
when no session cookie is present, matching `/t/:path*` and `/profile`. It must stay
that way — matching another signed-in-only path is fine, reading the database there is
not.

Do **not** move the membership, role, or archived check into it. Proxy runs on every
request including prefetches, so a database lookup there fires on link hover; the Next.js
docs explicitly say to keep it to cookie reads and not to use it as an authorization
solution. More fundamentally it cannot be the boundary: a server action POSTs to the
current page URL, so Proxy can see `/t/team-A/roster` but not which record the action
mutates. Only the action knows that, which is why `requireTeamAccess` runs inside it.

### The data model — three rules that are easy to break by being helpful

These are structural, not stylistic. Read the comments in `prisma/schema.prisma`.

1. **People are global; participation is team-scoped.** `User` and `Player` carry no
   team column. Never add `jerseyNumber`, `preferredPosition`, or `battingOrder` to
   `Player` — a kid can be on two active teams at once and holds different values on
   each. Jersey, batting slot, and position all live on `RosterEntry`.

2. **The chart is standing, not per-game.** There is no `Lineup`, `LineupSlot`, or
   `PositionAssignment` model, deliberately. The batting order and positions chart are
   nullable `battingOrder` / `position` columns on `RosterEntry`; null means benched.
   A batting slot is therefore a property of a roster spot, which makes "player in a
   lineup for a team they aren't rostered on" unrepresentable rather than merely
   rejected. Do not reintroduce per-game lineup rows — see Decision 16 first.

3. **Roles never inherit across teams.** Adding a returning player upserts
   `Membership(user, team, PARENT)` for each linked guardian and must **never** modify an
   existing membership. Someone who coached last season arrives as a parent and is
   elevated on the new team individually.

### The readiness check

`src/lib/readiness.ts` derives, for the team's **next game only**, who is absent and which
positions that leaves uncovered. It is read-only: it stores nothing, writes nothing, and
never rearranges the chart. The instinct to "materialize the effective lineup" reintroduces
per-game rows through the back door — don't.

**Deriving it for display is not materializing it.** `effectiveOrder` — the order with
declined players removed and ranks closed up — is rendered on `/readiness` (#55), computed
fresh on every read and gated on a decline having actually moved the order (a fielder who
doesn't bat empties a position without changing an at-bat). The forbidden thing is a
*stored* effective lineup, not a printed one; the page still has no write path and none may
be added.

Practices have RSVPs but no chart. Later games are ignored.

## Coding Conventions

- **Named exports only.** No default exports outside `src/app/` files, where Next.js
  requires them for pages and layouts.
- **Path alias `@/` → `src/`.** Use it for every non-relative import.
- **Co-locate tests**: `readiness.test.ts` sits next to `readiness.ts`.
- **Import the module under test statically, not with `await import()` inside a test.**
  Module loading is lazy, so a dynamic import bills the whole module graph to whichever
  test happens to run first — the page suites were spending 0.8–1.8s in one trivial
  assertion and 0–5ms in every other test in the file, and on a loaded runner that first
  test blew past Vitest's 5s default and turned `pnpm check` red at random. A static import
  moves the cost into the collection phase, which no timeout governs. Use the dynamic form
  only when a test genuinely needs fresh module state (with `vi.resetModules`); `vi.mock`
  is hoisted above imports, so static imports do not weaken mocking.
- **Keep domain logic pure and DB-free** so it tests without a database. Data loading
  belongs in a thin wrapper; the decision belongs in a pure function. Both existing
  modules in `src/lib/` follow this and are the pattern to copy.
- **Never call Prisma directly from a component.** Scoped queries go through `src/lib/`
  so there is one place to audit for `teamId` filtering.
- **Positions**: `C` is Catcher and `CF` is Center Field. Use `POSITION_LABELS` from
  `src/lib/positions.ts` rather than writing labels by hand.
- **Mutating forms get a pending state and typed feedback, never a bare
  `<form action={...}>`.** `SubmitButton` (`useFormStatus`) and `StatusBanner` are the
  shared components; every mutating form in the app uses them. A form where people
  actually type — as opposed to a one-tap RSVP or a role-select — converts its action to
  `useActionState`: a validation failure returns `{status: "invalid", ...}` with the typed
  values intact, instead of redirecting with `?error=` and losing them.
  `roster/AddPlayerForm.tsx` + `roster/actions.ts` is the annotated reference.

## Setup & Prerequisites

Node 22, pnpm 10.

```bash
pnpm install
pnpm db:generate     # required — the client is gitignored
```

Copy `.env.example` to `.env` and fill it in — it documents every variable and where its
name comes from. `DATABASE_URL` and `AUTH_SECRET` are the two needed to boot.

**Migrations live in `prisma/migrations/`** — `20260728053521_001` is the initial
14-table schema, and everything after it is small and additive (the team calendar token,
the RSVP `recordedById` column and its index). Creating further migrations needs a live
Postgres URL: a Neon dev branch, not `prisma dev`, which provisions Prisma Postgres, a
different service than Decision 3's choice — or hand-write the SQL and verify it against
the schema with `prisma migrate diff`.

**Migrations apply automatically on deploy.** `pnpm build` is
`prisma migrate deploy && next build`, so every Vercel deploy brings the database up to
date before the app ships. Re-running is a no-op once migrations are applied, and a
failure exits non-zero *before* `next build` runs — a database problem fails the deploy
loudly instead of shipping an app that crashes on its first query.

The cost is deliberate: **`pnpm build` now requires `DATABASE_URL`**, unlike
`src/lib/db.ts` and `src/auth.ts`, which still defer their secrets to request time. A bare
checkout with no `.env` cannot `pnpm build` — run `pnpm check` (lint → typecheck → test),
which needs no database, or use `pnpm exec next build` to skip the migration step.

Because Preview and Production share one `DATABASE_URL`, **a preview deploy applies
migrations to the production database.** With one operator and a schema that already
covers every planned feature this is acceptable, but if branch-level schema work ever
starts, guard the migrate step on `VERCEL_ENV=production` first.

Use `db:deploy` (`prisma migrate deploy`), never `db:migrate` (`prisma migrate dev`) against
production — the dev command can prompt, generate new migrations, and reset the database.

## Gotchas & Notes

- **Prisma 7 ships no bundled query engine.** `new PrismaClient()` with no argument is a
  type error. It needs an explicit driver adapter — see `src/lib/db.ts`. Nearly every
  Prisma example predating v7 is wrong on this point.
- **A `"use server"` file may only export async functions.** The directive marks *every*
  export as a server function, so a runtime constant — a `useActionState` initial value, a
  shared type — cannot live in an actions file. It fails at `next build`, not at
  `pnpm check`, which is easy to miss until a deploy breaks. The convention is a sibling
  `<feature>-state.ts` module holding the state type and its `*_INITIAL_STATE` constant
  (see `add-player-state.ts`, `event-form-state.ts`, `bulk-invite-state.ts`); the action
  file imports from it, never the other way around.
- **Middleware is called `proxy.ts` in Next.js 16.** It was renamed from
  `middleware.ts` — same functionality, `export function proxy(request: NextRequest)`.
  Training data will confidently tell you otherwise. See
  `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`.
- **`src/generated/prisma` is gitignored.** A fresh clone will not typecheck until
  `pnpm db:generate` runs.
- **`prisma init` installs vendored agent skills without asking** — into `.claude/skills/`,
  `.agents/skills/`, and `.windsurf/`, plus `skills-lock.json`. Nine packages were
  installed; seven were removed as irrelevant or as marketing for Prisma Postgres and
  Prisma Compute, which contradict the Neon and Vercel decisions. Only `prisma-cli` and
  `prisma-client-api` were kept (from `github:prisma/skills`, MIT). **If anyone re-runs
  `prisma init`, remove the rest again.** `prisma-cli/SKILL.md` was edited locally to drop
  a dangling reference to the uninstalled `prisma-compute` skill.
- **Three surfaces paint `FieldArt`, and their fences are the banana budget.** design-plan.md
  §2 allows exactly one Banana Yellow element per screen. `FieldArt` takes a `fence` prop
  because the wall is the loudest thing it paints: the positions editor spends its banana
  there, and `/view` spends its own on the guarded-player halo instead — but only for a
  reader who has a kid on that team, so `fence` is conditional there, not a constant. §2
  asks for *exactly* one, and a reader with no kid and a chalk fence would see zero, which
  is as much a deviation as two. Note the halo and the fence share the class
  `fill-none stroke-banana`, so a test telling them apart has to key on the radius.
  `guarded-style.ts`, `FieldArt.test.tsx` and the no-guard case in the view page's suite
  are where that budget is written down. One known hole, judged not worth a third branch:
  an allPlay board with 13+ players in the zone draws no ring, so a reader whose only
  guarded kid is there and has no batting slot sees a chalk fence and no banana at all.
  That needs an 18+ roster, past what this app is built for.

  The third caller is **`MiniDiamondHero`** (team home's player cards), and it passes
  `fence="chalk"` unconditionally — not a judgement call, a consequence of when it renders
  at all: the hero is drawn only for a kid the chart seats, and that card has already spent
  the banana on the halo and the marquee strip. Its crop is also so tight that the fence
  is usually outside the viewBox entirely. Two things follow, and both are the `/view`
  precedent rather than new rules. The treatment **follows the child**, so a parent with
  two kids gets it twice — two haloed markers and two marquees — exactly as `/view` already
  draws two halos, two row borders and two chips for that family. And a reader with **no**
  guarded kid gets no banana at all on team home, which is deliberate: unlike `/view` there
  is no field art to hand the yellow back to, and team home without a kid on it is one of
  §7's calm pages, not a fun page missing its accent.
- **Both diamonds shorten names through `buildDiamondNames` (`src/lib/diamond-names.ts`).**
  Never re-add a local `shortName`: the editor had one, so with two Avas on the roster
  `/view` drew "Ava C."/"Ava R." while the coach's board drew two chips both reading "Ava" —
  on the screen where confusing them gets *written* to the chart. It keys on an opaque `id`
  because the viewer keys markers on `playerId` and the editor keys chips on `entryId`.
- **The guarded halo's radius is not a constant, and the reason is silent.** Fixed positions
  use `DIAMOND_GEOMETRY.haloRadius`, but the allPlay outfield zone packs its markers closer
  as the roster grows — 58px apart at 11–12 players, 48.7px at 13–14, 41.4px at 15–16 — so
  `zoneHaloRadius(count)` shrinks the ring and returns **null** once none fits. A constant
  25px ring merged two siblings' halos at 13 and, at 15, painted a ring overlapping the
  *next kid's* marker: a highlight pointing at the wrong child. Nothing failed, because the
  geometry suite's `ZONE_SIZES` stopped at 12 — exactly the last passing count. Keep
  `CROWDED_ZONE_SIZES` reaching well past any real roster.
- **A CSS `transform` overrides an SVG `transform` attribute.** The view page's markers
  position themselves with `<g transform="translate(x y)">`, so `animate-step-up` goes on an
  *inner* `<g>`. Put it on the positioning element and every guarded marker renders at the
  origin — silently, with no error and no failing snapshot. Same trap applies to anything
  else animating an SVG child later.
- **Motion and `@dnd-kit` must never animate the same element.** dnd-kit positions drags
  by writing `transform`, and Motion's `layout` prop animates `transform` too — together
  the item lags or snaps back. dnd-kit owns everything during a drag; Motion owns page
  transitions, confirmations, and reveals.
- **Every `Event.startsAt` is anchored to `APP_TIMEZONE` (default `America/Chicago`), not
  the server's zone.** Vercel runs `TZ=UTC`, and plain `date-fns` resolves against the
  *system* zone — so `format`/`startOfMonth` on a late-evening Central event silently
  files it under the wrong day or month in production while looking correct on a
  Central-set dev machine. Never read or format `Event.startsAt` directly; go through
  `src/lib/calendar.ts`'s `TZDate`-based helpers (`wallClockToInstant`,
  `formatEventDateTime`, `dayKey`, `buildMonthGrid`, etc.).

  **Adding days is the sharpest case, and `weeklyOccurrences` is the one to copy.**
  Repeat-weekly creation (#70) steps the *day component* in `APP_TIMEZONE` —
  `new TZDate(y, m, d + 7k, hh, mm, 0, APP_TIMEZONE)` — rather than adding `7 × 24h` to an
  instant, because a week is not a fixed number of hours across a DST boundary: 6 PM on 7
  March 2026 and 6 PM on the 14th are 167 hours apart, and millisecond arithmetic files
  every game after the boundary an hour out. Nothing fails loudly; the season is just
  wrong. Both 2026 crossings are pinned in `calendar.test.ts`. The same trap applies to any
  future "every other week" or "same time next month".

  Two smaller notes on that function. Its day arithmetic **overflows its month on purpose**
  (day 38 of January is 7 February), which is the same rolling-forward `wallClockToInstant`
  rejects — so the does-this-date-exist check applies to the typed date only, never to a
  later occurrence. And `weeklyOccurrences(wc, 1)` is defined to equal
  `[wallClockToInstant(wc)]`, which is what makes "a repeat of one is the single-event
  behaviour that was already there" a property rather than a promise.
- **`MAX_REPEAT_WEEKS` is in its own module (`src/lib/repeat-weekly.ts`) and has to stay
  there.** It reads like it belongs in `calendar.ts` beside `weeklyOccurrences`, and it
  cannot: `AddEventForm` needs it for the input's `max`, and `schedule-messages.ts` — which
  that client component renders — names it in the `invalid-repeat` sentence. `calendar.ts`
  reads `process.env.APP_TIMEZONE` at module scope and pulls in date-fns, `@date-fns/tz`
  and its timezone data, so importing one number from there puts all of it in the browser
  bundle. `AddEventForm` is the only client component that imports from `@/lib/calendar` at
  all, and it must not start. Same reasoning as `event-form-state.ts`: a value that has to
  cross a boundary gets its own module rather than dragging its neighbours across.
  `repeat-preview.ts` exists for the other half of that split — the form's "Creates 8
  events, weekly through Sat, May 23" line is pure calendar-component arithmetic on the
  `YYYY-MM-DD` string, needing no zone, because naming a *date* seven days on is
  zone-independent. Only the conversion to an instant needs the zone, and that stays
  server-side. If that preview ever grows a time, it moves to the server rather than
  growing a copy of the zone rules.
- **`.env.example` is gitignore-exempt** via an explicit `!.env.example` negation, since
  the Next.js scaffold ignores `.env*`. Keep that negation if you touch `.gitignore`.
- **Declaring `metadata.icons` at all turns off file-convention icons entirely.** Next
  gates the whole static-icon merge on that key being unset (`resolve-metadata.js`:
  `if (!resolvedMetadata.icons)`), so with the block present in `src/app/layout.tsx` both
  `src/app/icon.*` and `src/app/apple-icon.*` are dropped from the markup — Next still
  serves them as routes, it just stops linking them. `favicon.ico` is the sole exception,
  prepended by a separate unconditional special case, which is why it still appears
  without being named. **Anything that is not favicon.ico must be listed in the `icons`
  object**, so adding `src/app/icon.png` and expecting it to show up will not work.
  `icons.apple` is declared for exactly this reason; dropping it breaks nothing visible —
  the build passes and every page renders — and only an actual iPhone shows it, by putting
  a screenshot of the page on the home screen instead of the crest. `layout.test.tsx` pins
  the declaration and `manifest.test.ts` pins the file it points at.
- **An installed iOS Home Screen app may not share Safari's cookies — and this app is
  magic-link only.** iOS gives a standalone web app its own storage container. If that
  holds here, the sequence is a dead end: a parent installs from Safari, opens the app,
  finds it signed out, requests a magic link, and the link opens in *Safari* — iOS has no
  way to route it back to a Home Screen web app — so the session lands in the container
  the app cannot read, every time, forever. **This is unverified**, it is the first thing
  the real-device test in #14 must check, and it is why the app has to stay fully usable
  without installing. If it is confirmed, the remedy is an emailed sign-in *code* the
  person types into whichever container they are standing in, not a link; that is an auth
  change well beyond the PWA work, designed and costed in #60. Until it is checked, treat
  the iOS half of `InstallPrompt` as provisional.
- **`public/sw.js` caches nothing, and must not start.** It is `skipWaiting`,
  `clients.claim`, and the `push` / `notificationclick` pair — no `fetch` handler, which is
  Decision 9 and the reason there is no Workbox build step. Adding a `fetch` handler is not
  a small change: every page under `/t/[teamId]` is a different family's roster, so a cache
  keyed on URL alone would serve one signed-in parent's data to the next person on a shared
  phone. The `push` handler always calls `showNotification`, even on a malformed payload:
  on iOS a push event that resolves without showing anything can cost the site its push
  permission outright, so there is deliberately no silent push. The manifest's two colours are frozen hex copied from
  the **light** theme (a manifest cannot express a media query); `manifest.test.ts` redoes
  the HSL-to-hex conversion from `globals.css` and fails if either token moves.
- **`RosterEntry`'s unique indexes surface as Prisma `P2002`, not a friendly error, unless
  translated.** `src/lib/roster-rules.ts`'s `rosterWriteFailure` duck-types the error rather
  than importing `PrismaClientKnownRequestError` (the generated client is gitignored, so its
  internal export path isn't a stable import) and matches both `meta.target` shapes seen
  across Prisma versions — an array of column names and a single constraint-name string.
  **Which shape a real write actually returns is unverified** — this repo has not yet run a
  write against live Postgres that trips one of these constraints. Confirm it before relying
  on this in production, and adjust the matching in `roster-rules.ts` if it differs.
- **Two things write the session cookie, and Auth.js is only one of them.** Accepting an
  invitation at `/invite/[token]` signs the parent in directly — Auth.js v5 has no
  "sign this user in" API under the database strategy, so `src/lib/sessions.ts` inserts the
  `Session` row the way `@auth/core` does (a `randomUUID()` token, `expires` at now + max
  age) and the action sets the cookie itself. Name and attributes come from
  `src/lib/session-cookie.ts`, which restates Auth.js's defaults once for all three
  consumers — Auth.js, that action, and `proxy.ts`. If `src/auth.ts` ever grows a `cookies`
  block or a `session.generateSessionToken`, that module has to move with it or a parent
  accepting an invitation gets a cookie the app cannot read. Accepting is a **POST**, never
  a GET: it consumes the invitation, and corporate mail scanners follow every link in a
  message before the recipient sees it.
- **`docs/design/design-plan.md` is checked against the code by a test.**
  `src/design-plan-drift.test.ts` reads that document and asserts its colour-token values
  against `globals.css` and its ``FIELD_ART.key = n`` geometry claims against
  `diamond-geometry.ts`, because the document drifted from the code four times in its
  first week. Changing a design token or a field radius will fail `pnpm check` until the
  document is updated to match. Fix whichever side is wrong — usually the document — and
  never delete the claim to silence the test. §13 of the document explains the format.
- **`GAME_GRACE_MS` keeps an event current for three hours after it starts, which is safe
  for a display and not for a write.** `nextGame` and `nextEvents` both apply it, so the
  event named by `/view`, `/readiness` and team home is often one already in progress —
  right, because that is the game the coach is standing at. Team home is the first page to
  make that same id the target of a *write*: its one-tap RSVP posts the selected event's
  id. On a doubleheader morning, "Not going" at 11am would decline the 9am game already
  played, so the buttons are gated on `startsAt > now`, asked per event, while the cards
  keep the grace window — the game in progress loses its buttons and the noon game keeps
  them. **The render is not the boundary**: `rsvpAction` re-checks the start time for
  `from=home` posts, because a dashboard left open through first pitch still holds a form
  that submits. That check is deliberately origin-scoped — it disambiguates a
  page-selected event, it does not authorize, and the event page still records a late
  answer on purpose. Anything else writing against a grace-window selection needs both
  halves.
- **An RSVP row has two possible authors, and `recordedById` is provenance, not
  ownership.** Since #54 `rsvpAction` has a staff path — COACH+ may set or clear any
  rostered player's response from the event page (`isPlayerRostered` replaces the
  guardianship check there; team/event scoping is never skipped). `Rsvp.recordedById`
  is set on staff writes and nulled on family writes *in the same upsert*, which is the
  whole of last-write-wins: the family stays the owner of the state, and "Recorded by
  coach" on the event page keys on that column. Guardianship is checked first, so a
  coach RSVPing their own kid records as family. Readiness and the state tri-state
  (`rsvp.ts`) are deliberately provenance-blind.
- **"Substitute" is a claim about a player in neither column, and three pages have to
  agree.** (The label was softened from "Bench" everywhere a person reads it — team home's
  marquee, /view's Substitutes card, the positions editor's zone — but the code and its
  comments still say bench/`isBenched`/`benchLabel` for the state itself.) A kid batting
  third with no fielding spot is *in the order* — the view page's substitutes list
  filters on `battingOrder === null` and says so, and `chartRole`'s `benchLabel` applies
  under the same condition. Printing "Bats 3rd · Substitute" misdescribes a kid who is
  playing.
  The prior question is whether the team has a chart at all: with none, every position a
  page prints is one nobody assigned, which is why `hasChartSet` (`chart-view.ts`) gates
  the line on team home and the whole panel on `/view` and `/readiness`.
- **A `?error=` key is attacker-chosen, so never build its lookup table by hand.** On a
  plain object literal `?error=constructor` resolves an `Object.prototype` member — truthy,
  so the `??` fallback never fires — and React throws "Functions are not valid as a React
  child" on the way out, crashing the page from a hand-typed URL. Every page goes through
  `messageTable` / `messageFor` (`src/lib/error-messages.ts`), which null-prototypes the
  table **and** refuses to return a non-string from the lookup — two layers, because
  fifteen pages hand-rolling the first is precisely how three ended up hardened and twelve
  did not. A new `?error=` page adds `messageTable({…})`, never `= {…}`.
  `src/error-message-tables.test.ts` enforces it — it **parses** every file in `src/` and
  fails on any element access whose index mentions `error`, in any spelling, after two
  regex versions leaked five of them. It cannot see a helper that indexes the table under
  another name, which is why `messageFor`'s own string check is the thing that actually
  holds.
- Chart edits are permanent — no undo, no history. Patching the order because a kid is out
  makes that the order. This was chosen deliberately; flag it rather than silently adding
  per-game overrides.
- **The chart editors know who declined, and must never be able to act on it.** Since #55
  both editors badge a declined player's chip for the next game, but the declined set
  arrives as a `declinedEntryIds` prop — a list of entry ids beside the rows — and never as
  a field on `ChartEditorEntry` / `PositionsEditorEntry`. That separation is the whole
  guarantee: `src/lib/chart.ts` consumes those rows and decides every drag and every save,
  so RSVP state being absent from them is what makes "this board cannot be filtered by who
  replied" structural rather than a promise in a comment. Adding `rsvpState` to either
  entry type undoes it. The badge is static markup on a dnd-kit element (no Motion, no
  animation class), and a declined player stays fully draggable and fully in the payload —
  the chart is standing, and one Saturday's absence is not a reason to rewrite it.
  `src/lib/chart-declines.ts` holds the derivation, split pure/thin like the rest of
  `src/lib/`; it skips the RSVP query entirely with no game or an empty roster.
- **Both chart writes replace the whole chart, they do not merge into it.** `saveBattingOrder`
  and `savePositions` null every value for the team and then write the submitted board, so a
  second coach saving a board they loaded earlier would erase the first one's work outright —
  and with no history, unrecoverably. A team can have up to four coaches. Each editor
  therefore posts the chart *as it loaded it* in a `baseline` field, and the action compares
  that against its own fresh read before writing, refusing on a mismatch (`chart-changed`).
  The baseline comes from `storedBattingOrder` / `storedPositions` in `chart.ts`, never from
  the draft: both draft builders normalize (pooling stale outfield rows, packing sparse
  orders), so a draft-derived baseline would look stale on every save. If you add a third
  chart column, it needs the same guard. The read-then-write gap is knowingly left open —
  see the comment in the positions action.
- **Save and Cancel answer different questions in both chart editors**, and it is not
  redundancy. Cancel is "has the coach changed anything" (draft vs. the loaded draft); Save is
  "would writing change the database" (draft vs. `stored*`). They diverge on first render
  whenever the draft builder normalized something — a stale `CENTER_FIELD` row under allPlay,
  or nine slots holding what used to be ten batters — and gating Save on the Cancel question
  leaves the coach looking at a change they cannot commit.
- **`List-Unsubscribe` is set on two sends, and which two is a claim, not an oversight.**
  `sendEmail` takes an optional `listUnsubscribe` address; the all-parents broadcast and
  the day-of reminder cron pass one, and nothing else does. RFC 2369 says the header
  describes a *list the recipient belongs to*: an invitation goes to someone not on the
  team yet, and the two remaining message shapes are one-to-one correspondence (a coach
  mailing one parent, a parent mailing the staff). Adding it everywhere to quiet a
  deliverability report would be a lie in a header. The address differs by sender because
  the senders differ: a broadcast has a human sending it, so it reuses that coach (the
  same address as `Reply-To`), while the cron runs as the system and has to *choose* one —
  `pickUnsubscribeContact` (`reminders.ts`) takes the team's owner over an assistant coach
  and breaks ties on `userId`, so two runs of the same day name the same person. A team
  with no staff address sends no header rather than one mailing nowhere. Deliberately
  **not** RFC 8058 one-click — one-click needs an unauthenticated HTTPS POST and a suppression store,
  which is how a parent silently drops themselves off "tonight is cancelled". Routing it
  to a human who can ask why is the chosen trade; revisit only by deciding about that
  failure mode, not to chase a checkmark. Callers pass a bare address — `email.ts` owns
  the angle-bracket framing so it exists in one tested place.
- **Four places send in a loop, and each couples a cap, an interval and a timeout.**
  `bulkInviteGuardiansAction` paces sends `MIN_SEND_INTERVAL_MS` (600ms) apart to stay under
  Resend's 2 req/s limit, caps a batch at `MAX_ROWS` (30), and the page — not the action —
  declares `maxDuration = 60`, since that is the level governing a Server Action's timeout.
  `MAX_ROWS × MIN_SEND_INTERVAL_MS` must stay well under `maxDuration`, or an oversized batch
  times out half-finished instead of being rejected cleanly. Raising the cap or the interval
  means revisiting the ceiling too. `sendTeamMessageAction` repeats the pattern with
  `MAX_RECIPIENTS` (30, deliberately equal to `MAX_ROWS`), and the reminder cron with
  `MAX_SENDS_PER_RUN` (200) against its own `maxDuration = 300` — a Route Handler declares
  that itself, unlike a Server Action. Same rule in all four: cap × interval well under the
  ceiling, and the two move together.

  `createEventAction` is the fourth, and its numbers are deliberately **not** the other
  actions': `MAX_RECIPIENTS` is 200 against the schedule page's `maxDuration = 300`. The
  other two block a coach who is watching a spinner, so a cap that rejects cleanly beats one
  that times out half-finished. This one runs in `after()` with nobody waiting, where 30
  bought nothing and cost everything — recipients dedupe per guardian `User`, not per
  household, so a 16-player roster with both parents linked is 32 and *every* announcement
  would have failed, permanently, with no retry path.

  **`MAX_REPEAT_WEEKS` (30) is the one cap that does *not* couple to a `maxDuration`, and
  that is a claim rather than an oversight.** The rule above governs loops that send **per
  row**; repeat-weekly creation (#70) writes per row and sends per *batch* — the
  announcement is one email per guardian whether the coach created one event or thirty, so
  30 rows in a transaction sit beside an unchanged `MAX_RECIPIENTS` of 200 and the same
  120s of pacing. Raising it does not move the ceiling. What it *is* bounded by is
  honesty about a forged POST: 30 is the `MAX_ROWS` precedent, enforced in `parseRepeat`
  and again inside `weeklyOccurrences`, because the form's `max=30` is a convenience for
  the coach and never a boundary.
- **Adding an event announces it; editing one does not.** `createEventAction` mails every
  guardian on the roster (#45) and pushes to whoever has a subscription, which is step 2 of
  the brief's core loop. Three things hold it in place. The fan-out runs **after**
  `createEvent` has returned — literally, in Next's `after()` — so there is no path from a
  Resend outage back to the event row: a coach whose game vanished because an email bounced
  would have every reason to distrust the app. Recipients come from the **roster**
  (`RosterEntry → Player → GuardianPlayer → User`) via `listTeamGuardians`, never from
  `Membership` and never from the POST. And an event whose `startsAt` is already past
  announces nothing, so back-filling last Saturday's game does not mail the team —
  deliberately **not** `GAME_GRACE_MS`, which keeps an in-progress game current for a
  *display* and is wrong for a send. That skip is silent, which is a known cost: a coach who
  typos the year gets no announcement and no explanation. `updateEventAction` sends nothing
  at all, pinned by a test, because a change-notification needs a diff this does not compute.
  `List-Unsubscribe` **is** set here (unlike the invitation), pointing at the coach who
  created the event — one body fanned out to every family is list mail by the same test the
  broadcast passes, and unlike the cron there is a real human sender to name.
  `src/lib/announcements.ts` holds the two rules worth testing without any of this: one email
  per household, and whether to announce at all.

  **A repeat-weekly run announces once, not once per event** (#70), and the same
  one-per-household argument is why. A twelve-game season entered in one submit would
  otherwise put twelve messages in every family's inbox, which is exactly how
  `buildAnnouncementRecipients`' own docstring says a family learns that this app's email
  is noise. `EventsAnnouncementEmail` lists every date and links at the **schedule** rather
  than an event, because a batch has no single event to answer. Both paths now share one
  paced send loop (`fanOut`), differing only in the `AnnouncementMessage` handed to it — so
  the pacing, the push-rides-along rule and the receipt cannot drift apart. The
  already-past rule applies **per occurrence** via `announceableOccurrences`: back-filling
  a season that has started creates every date and mails about none of the played ones, and
  when that leaves exactly one, it gets the ordinary single-event message and its event
  link back.
- **The announcement is deferred, so the returned state cannot report it — a receipt email
  does.** `createEventAction` returns the moment the event exists, because a fan-out is not
  something to make a person watch. The cost is that everything after that has no response
  left to report into, which is why `AnnouncementReceiptEmail` exists: a fan-out nobody hears
  the outcome of is worse than a slow one, since three families silently not told about
  Saturday is exactly the failure the feature was built to prevent. It is sent on success as
  well as failure — silence-means-success makes every quiet evening ambiguous, because a
  coach cannot tell "it worked" from "the receipt itself bounced". Recipients are resolved
  **before** the action returns even though the sending is deferred: two parallel indexed reads
  (the team's name and its roster) buy an honest "Emailing 24 parents now" instead of a vague
  reassurance, and an unreadable roster is the last announcement failure that can still be
  shown on the page. `AddEventState` carries
  that as a typed `announcement` field rather than a search param — which is also why there is
  no `?announcing=` to sanitize. The banner is deliberately present tense; not one message has
  been sent when the coach reads it. Nothing in `announceEvent` may throw: a deferred rejection
  is an unhandled error in a background task nobody is watching, strictly worse than a
  swallowed one that mails itself in.
- **Day-of reminders are a cron, and their duplicate protection is a claim, not a check.**
  `/api/cron/reminders` (schedule in `vercel.json`, authorized by a `CRON_SECRET` bearer
  token, failing closed when that variable is unset) mails every guardian on the morning of
  each game or practice. `ReminderReceipt` is the ledger: `claimReminder` **inserts** the
  `(eventId, userId)` row before the send and `releaseReminder` deletes it if the send
  fails, so the unique index — not application logic — is what stops a re-run double-sending,
  and two overlapping invocations race at Postgres. Read-then-write would not hold. The
  accepted cost is the other way round: a crash between claim and send loses one reminder,
  which is the right trade against mailing every family twice. Recipients come from the
  **roster** (`RosterEntry → Player → GuardianPlayer → User`), never from `Membership` — a
  coach with no kid on the team has no RSVP state to be told about — and one household with
  two kids gets one email naming both. The cron runs as the system with no
  `requireTeamAccess`, so the archived-team exclusion (`team: { archivedAt: null }`) lives in
  `loadTodaysReminderWork`'s query and must stay there. "Today" is
  `[now, endOfDayInZone(now)]`, never a UTC day.
- **Push is an enhancement and every layer has to keep it one.** `sendPushToUser`
  (`src/lib/push.ts`) returns counts and never throws — unconfigured VAPID keys, no
  subscription, a dead endpoint and a push-service outage are all quiet returns — and the
  reminder cron sends it *after* a successful email, inside its own try/catch, never
  releasing the claim on a push failure. Nothing about push may ever decide whether an
  email goes. Endpoints answering `404`/`410` are deleted in the same pass (Decision 8:
  subscriptions expire and must be pruned); any other status is transient and the row
  stays. `VAPID_PUBLIC_KEY` is read at request time and passed to `PushOptInCard` as a
  prop rather than being a `NEXT_PUBLIC_` variable — the key is not a secret, but inlining
  it would make the build depend on the environment, which `src/lib/email.ts` and
  `src/auth.ts` both avoid on purpose. `/api/push/subscription`'s `DELETE` matches on
  endpoint **and** `userId`: the endpoint is unique table-wide, so without the user filter
  it would be a fine deletion key for anyone who learned one.
