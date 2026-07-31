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
src/app/           # Next.js App Router pages and layouts
src/lib/           # Domain logic. Pure, DB-free modules live here with co-located tests
src/emails/        # React Email templates plus their pure props builders
src/generated/     # Prisma client output — gitignored, regenerate with pnpm db:generate
.agents/           # Product brief and stack decisions (decision record — do not edit)
.claude/           # Agent config: workflow skills, agent defs, permissions (do not edit)
```

`src/app/` now has real routes: `/` (auth-gated landing), `/signin`, `/invite/[token]`
(unauthenticated invitation accept page — deliberately outside proxy.ts's matcher), and
`/t/[teamId]/` (team home, settings, roster, members, the owner-only returning-player
picker at `roster/returning`, the member directory, the schedule at `schedule` /
`schedule/[eventId]`, and the read-only chart at `view`) plus `/t/new` for owner-gated
team creation.

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
| Create + apply a migration | `pnpm db:migrate` |
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
when no session cookie is present, matching `/t/:path*`. It must stay that way.

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

**No migrations exist yet.** The schema validates and generates but has never been applied
to a real database, so `pnpm db:migrate` is documented and unproven. The first run needs a
live Postgres URL — a Neon dev branch (not `prisma dev`, which provisions Prisma Postgres,
a different service than Decision 3's choice) — and will create the initial migration.

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
- **`RosterEntry`'s unique indexes surface as Prisma `P2002`, not a friendly error, unless
  translated.** `src/lib/roster-rules.ts`'s `rosterWriteFailure` duck-types the error rather
  than importing `PrismaClientKnownRequestError` (the generated client is gitignored, so its
  internal export path isn't a stable import) and matches both `meta.target` shapes seen
  across Prisma versions — an array of column names and a single constraint-name string.
  **Which shape a real write actually returns is unverified** — this repo has not yet run a
  write against live Postgres that trips one of these constraints. Confirm it before relying
  on this in production, and adjust the matching in `roster-rules.ts` if it differs.
- Chart edits are permanent — no undo, no history. Patching the order because a kid is out
  makes that the order. This was chosen deliberately; flag it rather than silently adding
  per-game overrides.
