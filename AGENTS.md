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
`signOut`), and `/t/[teamId]/` (team home, settings, roster, members, the
owner-only returning-player picker at `roster/returning`, the coach-only bulk parent
invite at `roster/invite`, the coach-only member directory, the coach-only roster entry
detail at `roster/[entryId]`, the schedule at `schedule` / `schedule/[eventId]`, the
read-only chart at `view`, the two coach-only drag-and-drop chart editors — the
batting order at `chart` and the positions diamond at `chart/positions` — and team
email messaging at `messages` (coach-only broadcast history) and `messages/new`
(the compose form every role uses) plus `/t/new` for owner-gated team creation.

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

## Architecture

Server Actions for mutations; Route Handlers only for things needing a real HTTP endpoint
(magic-link callback, push subscription registration). No separate API layer.

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

## Setup & Prerequisites

Node 22, pnpm 10.

```bash
pnpm install
pnpm db:generate     # required — the client is gitignored
```

Copy `.env.example` to `.env` and fill it in — it documents every variable and where its
name comes from. `DATABASE_URL` and `AUTH_SECRET` are the two needed to boot.

**One migration exists** — `prisma/migrations/20260728053521_001`, the initial schema (14
tables). Creating further migrations needs a live Postgres URL: a Neon dev branch, not
`prisma dev`, which provisions Prisma Postgres, a different service than Decision 3's
choice.

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
- **`public/sw.js` caches nothing, and must not start.** It is `skipWaiting` plus
  `clients.claim` and no `fetch` handler — Decision 9, and the reason there is no Workbox
  build step. Adding a `fetch` handler is not a small change: every page under `/t/[teamId]`
  is a different family's roster, so a cache keyed on URL alone would serve one signed-in
  parent's data to the next person on a shared phone. It is also where the `push` handler
  lands if Decision 8 is revisited. The manifest's two colours are frozen hex copied from
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
- Chart edits are permanent — no undo, no history. Patching the order because a kid is out
  makes that the order. This was chosen deliberately; flag it rather than silently adding
  per-game overrides.
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
- **The bulk invite action is the only place that sends in a loop, and three constants are
  coupled across two files.** `bulkInviteGuardiansAction` paces sends `MIN_SEND_INTERVAL_MS`
  (600ms) apart to stay under Resend's 2 req/s limit, caps a batch at `MAX_ROWS` (30), and
  the page — not the action — declares `maxDuration = 60`, since that is the level governing
  a Server Action's timeout. `MAX_ROWS × MIN_SEND_INTERVAL_MS` must stay well under
  `maxDuration`, or an oversized batch times out half-finished instead of being rejected
  cleanly. Raising the cap or the interval means revisiting the ceiling too.
