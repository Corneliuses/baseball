# Stack Decisions — Youth Baseball Team Manager

## Team Profile & Constraints

Solo build by one developer who ships **TypeScript and React** and is comfortable in the
npm ecosystem. **Vercel paid plan already in place** — hosting is effectively a fixed
input, not an open decision. Willing to pay for a small managed database. **6 weeks** of
evenings and weekends to a usable app. **Single team, permanently** — roughly 40 total
user accounts, ever.

Two consequences shape every decision below. First, at 40 users **scale is irrelevant** —
every choice optimizes for build speed and low operational surface, never throughput.
Second, a solo developer on a 6-week clock cannot afford to learn two new things at once,
so the stack spends exactly one innovation token.

## Layer Requirements

Written before any technology is named.

| Layer | Requirements (technology-agnostic) |
|---|---|
| **Client** | Installable to a phone home screen. Mobile-first. Touch drag-and-drop with an activation delay so page scrolling never triggers a drag. Must render a labeled baseball diamond with arbitrary drop targets, plus a reorderable vertical list. Realtime sync **not** required — a refresh is acceptable. Offline read of the finalized lineup is desirable, not required, for MVP. |
| **Data** | Strongly relational with referential integrity that matters: guardians ↔ players is many-to-many, and RSVPs gate which players may appear in a lineup. Entities: `Team`, `Player`, `Guardian`, `GuardianPlayer`, `User`, `Invitation`, `Event`, `Rsvp`, `Lineup`, `LineupSlot`, `PositionAssignment`, `Message`, `PushSubscription`. Total data volume is measured in kilobytes — a season is ~40 events and ~600 RSVP rows. No full-text search. No analytics workload. |
| **Auth** | Passwordless. Invitation-gated: no self-serve signup exists. Onboarding is one-time, expiring email links. Three roles — owner, coach, parent — checked server-side on every mutation. Long-lived sessions so parents are not re-authenticating on a phone at a ballfield. |
| **Backgrounding** | Send transactional email (invites, coach broadcasts, parent→coaches). Fan out web push to stored subscriptions. Optionally, a scheduled pre-game RSVP reminder. Fan-out size is ~25 recipients — no queue, no worker infrastructure justified. |
| **Scale** | ~15 players, ~25 guardians, ~40 accounts. Peak concurrency is one coach and a handful of parents on a Saturday morning. Explicitly do not design for growth. |
| **Integrations** | A transactional email provider and browser Web Push. No payments, no AI, no third-party sports data. |

## Decisions

### Decision 1: Platform / Frontend Framework

**Options considered:**
- **Next.js (App Router)** — React framework with server components, server actions, and
  first-class Vercel deployment.
- **Vite + React SPA with a separate API** — the lightest client build, but requires a
  second deployable and a hand-maintained API contract.
- **Remix / React Router 7** — excellent form and mutation model, good PWA story, less
  seamless on Vercel than on other hosts.

**Decision:** **Next.js, App Router.**

**Rationale:** The Vercel plan is already paid for, and Next.js is the only option here
that treats it as a first-party target — zero deployment work is real time saved against
a 6-week clock. React and TypeScript are the stated home languages. Most decisively,
server actions collapse the frontend and backend into one codebase with one type system,
which eliminates the entire category of work that the Vite option would add (a second
deploy target, CORS, an API schema, client-side data fetching). Remix is arguably the
better mutation model but loses on host alignment and on the sheer volume of Next.js
material available when stuck at 11pm.

### Decision 2: Backend / API Layer

**Options considered:**
- **Next.js Server Actions + Route Handlers** — mutations as server functions in the same
  app; route handlers for the few things that need a real HTTP endpoint.
- **Separate Node API (Hono / Fastify)** — clean separation, own deployment, own auth
  wiring.
- **Backend-as-a-service with client-direct queries and row-level security** — no backend
  code at all, authorization expressed as database policies.

**Decision:** **Next.js Server Actions for mutations, Route Handlers for the webhook-ish
endpoints** (magic-link callback, push subscription registration, any future cron target).

**Rationale:** One codebase, one language, one deploy, and no API contract to keep in
sync — the correct shape for a solo 6-week build. Authorization lives beside the mutation
it guards, which is easier to audit by eye than a policy file. The BaaS/RLS option is
genuinely tempting for how little code it needs, but the role rules here ("coaches may
edit lineups for their team; parents may RSVP only for players they guard") are ordinary
imperative checks that read clearly in TypeScript and would become a nontrivial policy
language to learn — a cost with no payoff at 40 users.

### Decision 3: Database

**Options considered:**
- **Neon Postgres** (provisioned through the Vercel Marketplace) — serverless Postgres
  with connection pooling built for functions, scale-to-zero, generous free tier.
- **Supabase Postgres** — Postgres plus bundled auth, storage, and realtime.
- **SQLite via Turso** — smallest and cheapest, excellent read latency.

**Decision:** **Neon Postgres**, provisioned through the Vercel Marketplace integration.

**Rationale:** The data is unambiguously relational — a guardians↔players join table and
RSVP-gated lineups are exactly what foreign keys are for — so Postgres is the boring,
correct answer. Neon specifically because serverless functions open and discard
connections constantly, and its pooling handles that without a PgBouncer sidecar to
operate. Provisioning through Vercel means the connection string is injected as an
environment variable with no manual secret handling. Supabase loses because its main draw
is the bundle, and we've chosen our own auth (Decision 5) and need neither storage nor
realtime — leaving it as plain Postgres with an extra dashboard. Turso is cheaper and
faster, but SQLite is the less familiar operational model and buys nothing at kilobyte
scale.

### Decision 4: ORM / Data Access

**Options considered:**
- **Prisma** — schema-first, generated types, `prisma migrate`, and Prisma Studio.
- **Drizzle** — SQL-like TypeScript query builder, smaller bundle, faster cold starts.
- **Raw SQL via `postgres.js`** — no abstraction, full control.

**Decision:** **Prisma.**

**Rationale:** The schema file is the clearest place to express the many-to-many
guardian↔player relationship and have the types fall out for free, and `prisma migrate`
is a solved migration story that costs zero thought. The deciding factor is **Prisma
Studio**: seeding 15 players and 25 guardians and then poking at RSVP rows to debug the
lineup filter is real, repeated work in week one, and a free GUI for it is worth more
here than Drizzle's cold-start advantage — an advantage nobody in a 40-person audience
will ever perceive. Drizzle is the right call if this app ever grows a latency budget;
today it does not have one.

### Decision 5: Auth

**Options considered:**
- **Auth.js v5 (NextAuth)** with the Email provider and the Prisma adapter — magic links,
  tokens stored in the same Postgres, roles as columns on your own tables.
- **Clerk** — hosted auth, excellent components, free below 10k monthly active users.
- **Hand-rolled token table** — an `Invitation` row, a signed cookie, ~200 lines.

**Decision:** **Auth.js v5, Email (magic link) provider, Prisma adapter.** Invitations are
a first-class `Invitation` table that gates account creation, so there is no self-serve
signup path.

**Rationale:** Auth.js's Email provider *is* the mechanism the proposal describes — a
one-time, expiring link — so it's a direct fit rather than something bent into shape. It
keeps every user record in the same database as players and guardians, which matters
because the interesting relationships here are `User → Guardian → Player`; roles become
plain columns and joins rather than metadata in a second system. Clerk is faster to a
login screen and free at this scale, but it splits identity across two systems and would
require webhook syncing to keep the guardian graph aligned with Clerk's user list —
avoidable complexity for 40 accounts that never self-register. The hand-rolled option is
respectable at this scale and was close, but session handling and token expiry are
exactly the code where a subtle bug is a security bug.

### Decision 6: Hosting / Deployment

**Options considered:**
- **Vercel** — already paid for.
- **Fly.io / Railway** — container hosting, no serverless constraints.

**Decision:** **Vercel**, deploying from the GitHub repository, preview deploys on
branches.

**Rationale:** Pre-decided by the constraint. It is also the right answer independently:
Next.js's first-party host, cron jobs available for the deferred reminder feature, and
zero infrastructure to operate.

### Decision 7: Transactional Email

**Options considered:**
- **Resend** — modern API, React Email templating, 3,000 emails/month free.
- **Postmark** — best-in-class deliverability, ~$15/month.
- **AWS SES** — cheapest per email, most setup.

**Decision:** **Resend**, with React Email for templates.

**Rationale:** Email is the *primary* notification channel in this app (see the push
caveat below), so it has to work reliably from day one — but volume is trivial: invites
plus a broadcast to 25 parents a couple of times a week sits far inside the free tier.
Resend wins on integration cost specifically: templates are React components, which the
developer already writes, rather than a separate templating language. Postmark's
deliverability edge is real but doesn't justify $15/month at this volume; SES's savings
are meaningless when the bill is already zero.

**Setup caveat:** send from a verified custom domain with SPF/DKIM configured. Sending
from an unverified domain is the difference between parents seeing invitations and
parents never finding them in spam — and if parents don't get the invite, nothing else in
this app matters.

### Decision 8: Push Notifications *(deferred to post-MVP)*

**Options considered:**
- **`web-push` npm package** — standards-based Web Push with self-generated VAPID keys.
  No vendor, no cost.
- **Firebase Cloud Messaging** — mature, free, but adds a Google project and SDK weight.
- **OneSignal** — turnkey dashboard, free tier, another third party holding your users.

**Decision:** **`web-push` with self-generated VAPID keys**, sending from a route handler,
with subscriptions stored in a `PushSubscription` table.

**Rationale:** Web Push is a browser standard; for a fan-out of 25 subscriptions there is
nothing a vendor does that a ~40-line route handler doesn't. FCM and OneSignal both solve
scale and analytics problems this app does not have, at the cost of another account,
another SDK, and another party holding a roster of children's guardians.

**This is the one genuinely risky piece of the stack, and the reason it's deferred:**

- **On iOS, Web Push only works if the user has added the PWA to their Home Screen**
  (iOS 16.4+). A parent who opens the link in Safari and never installs will receive
  nothing, silently, forever. There is no API to detect and no way to prompt around it.
- Permission must be requested from a user gesture, and a declined prompt is effectively
  permanent — so the ask needs a deliberate in-app moment, not an on-load popup.
- Subscriptions expire and must be pruned on `410 Gone` responses.

The mitigation is architectural, not technical: **email is the channel of record, push is
an enhancement.** Every notification the app sends must be sent by email regardless of
push status, and the app must be fully usable by a parent who never installs it. Build
push in week 7+, after the email path is proven in a real game weekend.

### Decision 9: PWA Shell / Service Worker

**Options considered:**
- **Hand-written minimal service worker** — a web app manifest, icons, and a small `push`
  event handler. Perhaps 60 lines.
- **Serwist** — the maintained successor to `next-pwa`; Workbox-powered caching
  strategies, supports injecting custom service worker logic.

**Decision:** **Hand-written minimal service worker plus a web app manifest for MVP.**
Adopt Serwist later, if and when offline read caching becomes a priority.

**Rationale:** MVP needs installability (a manifest and icons) and, later, a push event
handler — neither requires a build-time service worker toolchain. Offline caching is
explicitly a *Later* item in the brief, and it's the only thing Serwist meaningfully
provides. Adding a Workbox build step now means debugging stale-cache behavior during the
6 weeks when the app is changing hourly, which is the worst possible time for it. This is
the boring choice: fewer moving parts, and the upgrade path stays open because Serwist
supports custom SW logic when we do want it.

### Decision 10: Drag and Drop

**Options considered:**
- **`@dnd-kit`** — sensor-based, `TouchSensor` with configurable activation delay and
  tolerance, sortable list preset plus arbitrary droppable containers, keyboard sensor
  for accessibility.
- **`@hello-pangea/dnd`** — the maintained fork of the archived `react-beautiful-dnd`.
  Superb for lists; models the world as lists only.
- **`react-dnd`** — flexible, but its HTML5 backend has poor touch support and needs a
  separate touch backend.
- **Native HTML5 drag-and-drop** — no dependency, effectively unusable on mobile.

**Decision:** **`@dnd-kit`**, with `TouchSensor` configured with an activation delay and
movement tolerance.

**Rationale:** This app needs two structurally different drag surfaces — a reorderable
vertical list (the batting order) and a set of arbitrary positioned drop targets on a
baseball diamond graphic (the defense). `@dnd-kit` is the only option that does both
well; `@hello-pangea/dnd`'s list-only model cannot express a diamond without fighting it.
It is also the only one that directly answers the proposal's explicit requirement that
parents be able to scroll a phone page without triggering a drag: that requirement *is*
`TouchSensor`'s `activationConstraint: { delay, tolerance }`, which is the difference
between a usable mobile page and an infuriating one.

**Recommended follow-on (listed as *Later* in the brief):** add a non-drag input mode —
tap a player, tap a slot — as an alternative path. Dragging on a phone one-handed at a
ballfield in sunlight is harder than it looks in a desktop browser, and a tap-tap fallback
is also the accessible path.

### Decision 11: Styling & UI Components

**Options considered:**
- **Tailwind CSS + shadcn/ui** — utility CSS plus copy-in, own-the-code components.
- **Mantine / MUI** — batteries-included component libraries.
- **Plain CSS Modules** — no dependency, all custom.

**Decision:** **Tailwind CSS + shadcn/ui.**

**Rationale:** shadcn/ui components are copied into the repo rather than imported, so the
team color and the diamond graphic can be styled without fighting a library's theme
system — and the app has exactly one hard custom-visual requirement (the baseball
diamond) that no component library will help with anyway. Tailwind's mobile-first
responsive utilities directly serve the "stacks vertically on phones" requirement. This
combination also has the deepest well of examples and AI-generated-code reliability of
any React styling choice, which matters for a solo build on a clock.

### Decision 12: Dates & Calendar Views

**Options considered:**
- **`date-fns` + custom month grid and list views.**
- **FullCalendar / `react-big-calendar`** — full-featured calendar components.

**Decision:** **`date-fns` with hand-built month-grid and chronological-list views.**

**Rationale:** The requirement is to *display* ~40 events a season in two layouts, not to
drag events around a week view or handle recurrence. A read-only month grid is roughly a
day of work; integrating a calendar library and overriding its styling to match the app
and work on a phone is not obviously less. Calendar libraries earn their weight on
editing interactions this app doesn't have.

## Stack Summary

| Layer | Choice | Team familiarity | Est. monthly cost | Notes |
|---|---|---|---|---|
| Framework | Next.js (App Router) | High (React/TS) | — | Server components + server actions |
| API | Server Actions + Route Handlers | Medium | — | No separate backend deploy |
| Database | Neon Postgres (via Vercel) | Medium | $0–19 | Free tier is genuinely sufficient at this scale |
| ORM | Prisma | Medium–High | $0 | Prisma Studio for roster seeding and debugging |
| Auth | Auth.js v5, magic link + Prisma adapter | Medium | $0 | Invitation-gated; no self-serve signup |
| Hosting | Vercel | High | $20 (already paid) | Preview deploys; cron available for later reminders |
| Email | Resend + React Email | Medium | $0 | 3,000/mo free; **requires domain verification** |
| Push *(later)* | `web-push` + VAPID | **Low** | $0 | iOS requires Home Screen install — see Decision 8 |
| PWA shell | Manifest + hand-written SW | Low–Medium | $0 | Serwist deferred until offline caching matters |
| Drag & drop | `@dnd-kit` | Medium | $0 | `TouchSensor` delay is a stated requirement |
| UI | Tailwind + shadcn/ui | High | $0 | Components copied in, not imported |
| Dates | `date-fns` + custom views | High | $0 | Read-only calendar; no library warranted |
| Domain | Registrar of choice | High | ~$1 | ~$12/year; needed for email deliverability |

**Innovation token:** **spent on Web Push** (`web-push`, VAPID, and a service worker) —
the one piece with no familiar alternative, since the fallback (email only) doesn't meet
the stated requirement. Every other layer is either already familiar or the most
conventional choice available. It is also the only layer deferred past MVP, which is
deliberate: the unfamiliar thing should land after the app is proven, not during the
6-week sprint.

**Estimated monthly cost at MVP scale:** **$0–19/month incremental**, on top of the Vercel
plan already being paid for. Realistically $0 for the first season — Neon's free tier,
Resend's free tier, and self-hosted push cover a 40-person audience with room to spare.
Plus roughly $12/year for a domain.

## Revisit Triggers

| Decision | Revisit if… |
|---|---|
| Single-team scope (whole architecture) | Another coach asks to use it. This is the expensive one — multi-tenancy is cheap to design in and costly to retrofit. If there's any real chance, say so *before* the schema is written. |
| Neon free tier | Cold-start latency on the autosuspended database becomes noticeable at the field, or storage passes the free limit. Upgrade to the paid tier; it's a plan change, not a migration. |
| Prisma | Serverless cold starts become a felt problem, or the bundle size starts to matter. Drizzle is the migration target. |
| Auth.js v5 | Wiring the magic-link flow eats more than ~4 days. Fall back to Clerk and accept the two-system user sync. |
| Hand-written service worker | Offline lineup viewing gets promoted from *Later* to required. Adopt Serwist then. |
| `web-push` | iOS Home-Screen-install adoption among parents proves too low to be useful. The answer is probably to lean harder on email, not to switch push vendors — no vendor can fix this. |
| Resend | Deliverability problems after domain verification, or volume passes 3,000/month. Postmark is the upgrade. |
| `@dnd-kit` | Touch dragging tests badly with real coaches. Ship the tap-to-place mode as primary rather than replacing the library. |

## Next Steps

1. Create the repository and copy `product-brief.md` and this document into `docs/`.
2. **Answer the open question about the defensive slot list** in the brief — the exact
   positions and labels — before any schema or diamond work begins.
3. Run `repo-setup` to generate a grounded `AGENTS.md`.
4. Run `milestone-planner` with the brief's MVP scope as the initiative, to break the
   build into phased, dependency-linked issues. Suggested phase order, which front-loads
   the riskiest assumption: auth + roster → schedule + RSVP → **validate with one real
   game weekend** → lineup → positions → view page → messaging → push.
