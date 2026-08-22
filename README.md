# Youth Baseball Team Manager

An invite-only PWA for coaching youth baseball. One person runs the team; parents RSVP
their kids and see the batting order and field positions on their phone, at the field,
often on one bar of signal.

It replaces a group text, a league website nobody checks, and a lineup card written in the
parking lot fifteen minutes before first pitch.

## Status

**Phase 10 complete — the batting order editor.** Phase 1 laid the data model, tooling, and
domain guards. Phase 2 added sign-in. Phase 3 added team scoping (`/t/[teamId]`,
`requireTeamAccess`). Phase 4 added the roster itself: players, jersey numbers, guardian
links, working invitations, and owner-only member/role management. Phase 5 added the
returning-player picker — the owner-only global `Player` read that pulls a kid and their
guardians onto a new team's roster in one step — plus the member directory. Phase 6 added
event create/edit/delete, a hand-built month grid and chronological list, and the
`nextGame` helper the view page (#8) and readiness check (#12) both depend on. Phase 7
added the tri-state RSVP model — attending, declined, and no-response (no row) are
distinct — a guarded per-kid toggle on the event detail page, and the pure contract
(`src/lib/rsvp.ts`) that #8 and #12 both consume. Phase 8 added the parent-facing payoff:
`/t/[teamId]/view`, a labeled diamond and the ordered batting lineup read in the context of
`nextGame`, with RSVP state as decoration only — a declined kid stays in their slot,
greyed, and no-response never reads as "out." Phase 10 adds the coach-only drag-and-drop
batting order editor at `/t/[teamId]/chart`: `@dnd-kit/sortable` with a touch activation
delay so scrolling on a phone never starts a drag, swap-on-drop semantics, and an explicit
Save/Cancel that writes through a two-phase transaction (null every `battingOrder`, then
write the new values) to clear the non-deferrable unique index on `(teamId, battingOrder)`
mid-swap. The positions chart is still hand-entered via `pnpm db:studio`; #11 builds that
editor. RSVP is reporting-only throughout: it never gates roster or chart placement.

What exists today:

- `prisma/schema.prisma` — the full domain model, migrated
- `src/lib/` — team access rules, next-game readiness, position labels, the sign-in gate
  and owner check, invitation creation/acceptance, roster and membership data access, the
  returning-player cascade, directory ordering, the schedule — Central-time-anchored
  calendar/date logic plus team-scoped event reads and writes — the RSVP tri-state
  contract plus its team-scoped, guardian-guarded data wrapper, the view page's pure
  chart render model (`chart-view.ts`), and the batting order editor's pure draft/drop/
  validation logic (`chart.ts`) — all unit-tested
- `src/auth.ts` — Auth.js v5 config: Prisma adapter, Resend provider, database sessions
- `src/proxy.ts` — redirects signed-out visitors away from `/t/:path*`
- `src/app/signin/` — the sign-in form and its confirmation page
- `src/app/invite/[token]/` — the (unauthenticated) invitation accept page
- `src/app/t/[teamId]/` — team home, settings, roster (list + player detail with guardian
  linking and phone), owner-only member management, an owner-only returning-player picker
  (`roster/returning`), the member directory (`directory`), the schedule — a month
  grid and chronological list with coach-only create/edit/delete, plus an Attendance card
  on the event detail page where any guardian can RSVP their own kids and coaches can
  record (or clear) any rostered player's response on a family's behalf, marked
  "Recorded by coach" (`schedule`, `schedule/[eventId]`), the read-only view page (`view`): a server-rendered SVG diamond and
  ordered batting lineup for the next game, RSVP state shown but never used to filter or
  reorder anyone — and the coach-only batting order editor (`chart`): drag-and-drop reorder
  via `@dnd-kit`, swap-on-drop, an unassigned pool when `allPlay` is off, and a two-phase
  transactional save
- `src/emails/` — React Email templates for invitations and the "you've been added to a
  team" notice, both sent through Resend
- `src/app/` — landing page displaying all public teams, responsive layout, theme setup
- `src/components/ui/` — shadcn/ui component library (Button, Card) with baseball-themed styling
- `src/components/` — reusable components (PageContainer, TeamCard, TeamSelector, TeamSwitcher)
- Tailwind CSS 4 with HSL color variables (baseball diamond green, field brown, sky blue, warning red)
- LazyMotion configured for efficient Motion animations
- Working `dev` / `build` / `lint` / `typecheck` / `test` pipeline with unit tests throughout

What does not exist yet: the drag-and-drop positions editor (#11) — positions are still
hand-entered via `pnpm db:studio` — next-game readiness (#12), and broadcast messaging
(#13).

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
pnpm db:deploy           # applies the existing migrations; needs a live database
pnpm dev
```

Open http://localhost:3000.

You need a Postgres database before `db:deploy` or `dev` will work. Point `DATABASE_URL`
at a [Neon](https://neon.tech) dev branch — not Prisma Postgres (`prisma dev`), which is a
different service than the one this project is built on (see Decision 3). See
`.env.example` for every variable and what it's for.

## Commands

| Purpose | Command |
|---|---|
| Dev server | `pnpm dev` |
| Production build (applies migrations — needs `DATABASE_URL`) | `pnpm build` |
| Build without touching the database | `pnpm exec next build` |
| Lint | `pnpm lint` |
| Type check | `pnpm typecheck` |
| Tests | `pnpm test` |
| Tests (watch) | `pnpm test:watch` |
| **Everything** | `pnpm check` |
| Regenerate Prisma client | `pnpm db:generate` |
| Create a new migration (dev only) | `pnpm db:migrate` |
| Apply existing migrations (production) | `pnpm db:deploy` |
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
