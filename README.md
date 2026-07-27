# Youth Baseball Team Manager

An invite-only PWA for coaching youth baseball. One person runs the team; parents RSVP
their kids and see the batting order and field positions on their phone, at the field,
often on one bar of signal.

It replaces a group text, a league website nobody checks, and a lineup card written in the
parking lot fifteen minutes before first pitch.

## Status

**Pre-alpha — scaffold only.** The data model, tooling, and domain guards are in place;
the application itself is not built yet. `src/app/` is still the starter page.

What exists today:

- `prisma/schema.prisma` — the full domain model
- `prisma/migrations/` — the initial migration, verified against a local Postgres 16 but
  **not yet applied to the project's Neon database**
- `src/lib/` — team access rules, next-game readiness, position labels, all unit-tested
- Working `dev` / `build` / `lint` / `typecheck` / `test` pipeline

What does not exist yet: any UI, auth wiring, or email sending.

## How it works

**The chart is standing, not per-game.** Most team apps make you build a lineup before
every game. Here the coach sets a batting order and a positions chart once and it persists
until they change it. A normal week needs no lineup work at all.

RSVPs earn their keep by flagging the weeks that *aren't* normal: for the next game only,
the app reports who is out and which field positions that leaves uncovered. It never
rearranges the chart on the coach's behalf — it says what's broken and lets the coach
decide.

Other things worth knowing:

- **`allPlay` is a team setting.** When on, every kid bats and fields — the norm in
  recreational youth leagues, and something the big products treat as an exception.
- **Parents never create an account.** They click a link in an email and they're in.
  There is no self-serve signup anywhere in the app.
- **Multiple teams, one owner.** A team per season, with past seasons kept read-only.
  Players and guardians persist across seasons, so adding a returning kid to a new roster
  also brings their parents onto that team.

## Getting started

Requires **Node 22** and **pnpm 10**.

```bash
pnpm install
cp .env.example .env     # then fill in DATABASE_URL and AUTH_SECRET
pnpm db:generate         # required — the Prisma client is gitignored
pnpm db:migrate          # applies prisma/migrations to your database
pnpm dev
```

Open http://localhost:3000.

You need a Postgres database before `db:migrate` or `dev` will work. Point `DATABASE_URL`
at a [Neon](https://neon.tech) dev branch — not Prisma Postgres (`prisma dev`), which is a
different service than the one this project is built on (see Decision 3). See
`.env.example` for every variable and what it's for.

**Migrating needs the unpooled URL.** Set `DATABASE_URL_UNPOOLED` as well — Neon's pooled
endpoint is PgBouncer in transaction mode and cannot hold the advisory lock `prisma
migrate` takes, so migrating through it hangs. It is the same connection string with
`-pooler` dropped from the hostname, and the Prisma CLI picks it up automatically via
`prisma.config.ts`. The app itself keeps using the pooled `DATABASE_URL`.

## Commands

| Purpose | Command |
|---|---|
| Dev server | `pnpm dev` |
| Production build | `pnpm build` |
| Lint | `pnpm lint` |
| Type check | `pnpm typecheck` |
| Tests | `pnpm test` |
| Tests (watch) | `pnpm test:watch` |
| **Everything** | `pnpm check` |
| Regenerate Prisma client | `pnpm db:generate` |
| Create + apply a migration | `pnpm db:migrate` |
| Browse data | `pnpm db:studio` |

Run `pnpm check` before pushing — it chains lint, typecheck, and tests.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Prisma 7 on Neon
Postgres · Auth.js v5 magic links · `@dnd-kit` · Motion · Resend · Vitest · deployed on
Vercel.

Every one of those was chosen deliberately, with alternatives considered and rejected in
writing — see the stack decisions below.

## Documentation

- **[`AGENTS.md`](AGENTS.md)** — conventions, commands, and the model rules that are easy
  to break by accident. Read this before changing code.
- **[Product brief](.agents/app-brainstorm/youth-baseball-team-manager/product-brief.md)** —
  scope, the core loop, and what is deliberately out of scope.
- **[Stack decisions](.agents/app-brainstorm/youth-baseball-team-manager/stack-decisions.md)** —
  16 numbered decisions with options considered, rationale, and the conditions under which
  each should be revisited.

## A note on the data

The app stores children's names and jersey numbers alongside guardian contact details. It
is invite-only by design, should stay out of search engine indexes, and any future photo
feature is a consent decision before it is a feature decision.
