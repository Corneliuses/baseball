# Stack Decisions — Youth Baseball Team Manager

## Team Profile & Constraints

Solo build by one developer who ships **TypeScript and React** and is comfortable in the
npm ecosystem. **Vercel paid plan already in place** — hosting is effectively a fixed
input, not an open decision. Willing to pay for a small managed database. **6 weeks** of
evenings and weekends to a usable app. **Multiple teams under a single owner** — one team
active at a time with a switcher for past seasons — so roughly 40 accounts per team and a
low hundreds across a decade of archived seasons.

Two consequences shape every decision below. First, at that size **scale is irrelevant** —
every choice optimizes for build speed and low operational surface, never throughput.
Second, a solo developer on a 6-week clock cannot afford to learn two new things at once,
so the stack spends exactly one innovation token.

## Layer Requirements

Written before any technology is named.

| Layer | Requirements (technology-agnostic) |
|---|---|
| **Client** | Installable to a phone home screen. Mobile-first. Touch drag-and-drop with an activation delay so page scrolling never triggers a drag. Must render a labeled baseball diamond with arbitrary drop targets, plus a reorderable vertical list. Realtime sync **not** required — a refresh is acceptable. Offline read of the current chart is desirable, not required, for MVP. |
| **Data** | Strongly relational with referential integrity that matters: guardians ↔ players is many-to-many, and RSVPs for a single upcoming event are read against the team's standing chart to flag gaps. **Two tiers** — people (`User`, `Player`) persist across seasons and hold no team-specific attributes; participation (`Membership`, `RosterEntry`) is team-scoped, as is everything a team produces (`Event`, `Message`, `Invitation`, `Rsvp`). A player may be on two active teams at once, so jersey number, batting slot, and position are per-team by necessity, not merely by preference. The batting order and positions chart are **standing per team, not per game**, and live as columns on `RosterEntry` — see Decisions 15 and 16. Entities: `Team`, `Membership`, `Player`, `RosterEntry`, `GuardianPlayer`, `User`, `Invitation`, `Event`, `Rsvp`, `Message`, `PushSubscription`. Total data volume is measured in kilobytes — a season is ~40 events and ~600 RSVP rows, and a decade of archived seasons is still kilobytes. No full-text search. No analytics workload. |
| **Auth** | Passwordless. Invitation-gated: no self-serve signup exists. Onboarding is one-time, expiring email links; recurring sign-in is a short-lived emailed code the person types (revised from a tapped link — see Decision 5). Three roles — owner, coach, parent — assigned **per team** and checked server-side on every mutation, against the team that owns the record being touched. Long-lived sessions so parents are not re-authenticating on a phone at a ballfield. |
| **Backgrounding** | Send transactional email — invitations, **added-to-team notices** (sent to existing accounts when a returning player pulls their guardians onto a new team; a heads-up and a link, *not* a magic link), coach broadcasts, and parent→coaches. Fan out web push to stored subscriptions. Optionally, a scheduled pre-game RSVP reminder. Fan-out size is ~25 recipients — no queue, no worker infrastructure justified. |
| **Scale** | ~15 players, ~25 guardians, ~40 accounts *per team*, growing by one team a season. Peak concurrency is one coach and a handful of parents on a Saturday morning, all on the active team. Archived teams are cold data that must remain readable. Explicitly do not design for growth. |
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

**Decision:** **Auth.js v5, Email provider, Prisma adapter.** Invitations are
a first-class `Invitation` table that gates account creation, so there is no self-serve
signup path.

> **Revised (#60, 2026-08):** the emailed credential is now a **typed 8-character code**
> (`generateVerificationToken` + a 10-minute `maxAge` on the same Email provider), not a
> tappable magic link. The link flow had a structural dead end on phones: the link is
> redeemed by whichever browser the OS hands it to, and an installed PWA can hold a
> separate cookie container from that browser — confirmed in the field on Android
> (sign-in from the installed app looped back to the email form forever), and the
> designed-for case on iOS Home Screen apps. A typed code is the one credential that
> crosses a container boundary, because the human carries it instead of the OS routing
> it. Everything below the credential — the Invitation gate, the Prisma adapter, database
> sessions — is unchanged; the code redeems through the same Auth.js callback the link
> did.

**Rationale:** Auth.js's Email provider *is* the mechanism the proposal describes — a
one-time, expiring link — so it's a direct fit rather than something bent into shape. It
keeps every user record in the same database as players, which matters because the
interesting relationships here are `User → GuardianPlayer → Player` and
`User → Membership → Team`; roles become plain joins rather than metadata in a second
system. It also tolerates the `User` rows that exist before anyone signs in (Decision 15). Clerk is faster to a
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

### Decision 13: Team Scoping & Active-Team Context

*Belongs with Decision 5 (Auth); numbered last because it was settled after the rest.*

**Options considered:**
- **Team ID in the URL** — every scoped route lives under `/t/[teamId]/…`, and server
  code reads the team from route params.
- **Active team in the session/cookie** — one "current team" stored server-side, switched
  by a mutation, with URLs staying team-free.
- **Postgres row-level security** — scope enforced in the database via policies and a
  session variable.

**Decision:** **Team ID in the URL**, with a single `requireTeamAccess(teamId, minRole)`
helper called at the top of every scoped page loader and server action. It resolves the
caller's `Membership` for that team, throws on absence, and returns the role for finer
checks. Archived teams additionally reject mutations.

**Rationale:** Hidden active-team state is the bug factory here — a coach opens last
season in one tab and this season in another, and a cookie-based "current team" silently
writes the lineup to the wrong one. Putting the team in the URL makes every request
self-describing, makes tabs independent, and makes links shareable. It also means the
authorization check has a parameter to check *against*, rather than having to trust
ambient state. RLS is the most rigorous option and the wrong one for a solo 6-week
build — it's a second authorization language to learn (the same reason the BaaS option
lost in Decision 2), and Prisma's support for it would need threading a session variable
through every connection.

**The discipline this requires:** every Prisma query on a scoped entity must filter by
`teamId`, and every mutation must call the helper first. This is a convention, not a
compiler guarantee — the mitigation is to keep all scoped queries behind a thin data
module rather than calling Prisma directly from components, so there's one place to audit.

**Scoped is not the same as global.** Per Decision 15, `Player` and `User` deliberately
have no `teamId` — they're people. Reading a roster means querying `RosterEntry` filtered
by team, not `Player`. The only place a global read is legitimate is the returning-player
picker, which is owner-only by definition; every other path reaches people *through* the
team's `RosterEntry` or `Membership` rows.

**Archived teams are read-only**, which the helper enforces in the same place: a team with
`archivedAt` set rejects every mutation regardless of the caller's role, owner included.
One check beside the role check, rather than scattered guards on individual actions.

### Decision 14: Animation & Motion

**Options considered:**
- **Motion** (`motion`, formerly `framer-motion`) — declarative animation for React with
  gesture support, layout animation, and a hardware-accelerated engine.
- **`@formkit/auto-animate`** — a ~2 kB zero-config plugin that animates list add/remove/
  reorder automatically with a single hook.
- **`react-spring`** — physics-based, powerful, more API surface to learn.
- **Tailwind transitions + `tailwindcss-animate`** — CSS only, no runtime dependency.

**Decision:** **Motion**, imported via its `LazyMotion` + `m` API so the shipped bundle is
roughly 6 kB rather than the full ~34 kB. Tailwind transitions stay the default for
trivial hover and focus states — don't reach for a library to fade a button.

**Rationale:** This app has a genuine, non-decorative use for motion: the moment a coach
saves a chart change, and the moment a parent opens the view page and sees where their kid is
playing. Those deserve to feel good, and they're the app's emotional payoff. Motion is the
most familiar-shaped option for a React developer (`<m.div animate={…}>` needs no new
mental model), has by far the largest body of examples, and its `AnimatePresence` is the
only clean answer for animating elements *out* — which plain Tailwind cannot do at all.
`auto-animate` is a delightful 20-second win and genuinely tempting, but it's list-only
and can't touch the diamond. Consider adding it alongside Motion for the roster and
directory lists if Motion's `layout` prop feels like too much ceremony there.

**⚠️ The caveat that matters — Motion and `@dnd-kit` must not both animate the same
element.** `@dnd-kit` positions a dragging item by writing `transform`, and Motion's
`layout` prop animates `transform` too. Put both on one node and the item lags the finger,
drifts, or snaps back. The rule: **`@dnd-kit` owns everything during a drag; Motion owns
everything else.** Concretely — no `layout` prop on sortable items or diamond drop targets;
use `@dnd-kit`'s own `transition` for drag settling; use Motion for page and route
transitions, the chart-saved confirmation, RSVP toggles, empty-state and toast entrances, and
the diamond's initial reveal on the view page. If a reorder animation outside of dragging
is wanted later, `dnd-kit`'s `DragOverlay` plus its sortable transition is the supported
path, not `layout`.

**Budget note:** animation is the first thing to cut if week 4 is tight. It's genuinely
additive, and nothing else depends on it.

### Decision 15: Person & Roster Identity Model

**The requirement:** the owner builds a new season's roster by picking returning kids from
past teams. Doing so must pull their guardians onto the new team automatically, as
parents, without re-inviting anyone.

**Options considered:**
- **People are global; participation is team-scoped.** `Player` and `User` are person
  records that outlive any team. `RosterEntry` puts a player on a team; `Membership` puts
  a user on a team with a role.
- **Everything is team-scoped.** A returning kid is a fresh `Player` row each season, and
  "adding a returning player" copies fields from an old row.
- **Global with a season pointer.** One `Player` row carrying `currentTeamId`, rewritten
  each season.

**Decision:** **People are global; participation is team-scoped.**

```
User      (person: email, name, phone — may exist before ever signing in)
Player    (person: name, DOB — no team column)
Team      (season, archivedAt)
Membership   (userId, teamId, role)          -- per-team access + role
RosterEntry  (playerId, teamId, jerseyNumber) -- per-team roster spot
GuardianPlayer (userId, playerId)             -- family link, NOT team-scoped
```

**Rationale:** The requirement is a join-table shape. Once `Player` has no `teamId`,
"add a returning kid" is one `RosterEntry` insert plus a `Membership` upsert per linked
guardian — and the guardian link is already there because it was never team-scoped in the
first place. The copy-rows alternative has to duplicate the kid, re-derive the family
links, and then answer "which of these three Jimmy Kelleher rows is the real one" forever.
The `currentTeamId` variant can't represent a kid on two teams at once and destroys last
season the moment you write to it.

Jersey number lives on `RosterEntry`, not `Player`, because numbers get reassigned every
season — that placement is the small detail that makes the model correct rather than
merely tidy.

**A player may be on two active teams simultaneously**, which is the case that turns that
detail into a hard rule: **`Player` carries no team-specific attribute, ever.** A kid
playing travel and rec at once has two jersey numbers, two batting orders, and two
position assignments live on the same Saturday, and every one of them belongs to a team.
The temptations to resist are a `jerseyNumber`, a `preferredPosition`, or a
`battingOrderDefault` on `Player` — each looks harmless, each is wrong here. `Player`
holds only what's true of the child: name and date of birth.

Where the batting order and position assignments live is Decision 16 — and because the
chart turns out to be team-level rather than per-game, **roster containment stops being a
rule to enforce and becomes a fact of the schema**. See below.

**Corollary — `Guardian` is gone, folded into `User`.** The earlier entity list had both,
which forced an awkward question: a parent invited but not yet signed in still needs a
`Membership`, so does membership point at the guardian or the account? Collapsing them
answers it — a `User` row is created when the owner enters an email, carries name and
phone, and simply hasn't verified yet. Auth.js's Prisma adapter attaches the session on
first magic-link click. This also handles the coach-who-is-also-a-parent case for free,
since a role is a `Membership`, not a property of the person. **What it gives up:** a
guardian with no email address cannot exist. That's already true of an invite-by-email
app, but it's a real constraint if a grandparent should ever be a phone-only contact.

**The cascade, precisely.** Adding player P to team T:
1. Insert `RosterEntry(P, T)`, prompting for a jersey number.
2. For each `GuardianPlayer` of P, upsert `Membership(user, T, role: parent)`.
3. Never touch an existing `Membership` — roles do not inherit. A guardian who coached
   last season arrives as a parent and is elevated on T individually.
4. Email each guardian whose membership was newly created a plain "you've been added to
   T" notice. No magic link — they have an account already. Skip anyone who was already
   a member, so re-adding a sibling doesn't re-notify the household.

Step 3 is the one an implementer will get wrong by being helpful, so it belongs in
`AGENTS.md` as a rule, not just here. Step 4 keys off *newly created* memberships rather
than the guardian list, which is what keeps it quiet when adding two kids from one family.

### Decision 16: Where the Lineup and Positions Live

**The requirement, once settled:** the batting order and positions chart are **standing,
not per-game**. A coach sets them once and they persist until edited; edits are permanent.
There is no per-game authoring step and no per-game override. Attendance meets the chart
in exactly one place — a readiness check for the **next game only**, which reports who's
out and which positions are uncovered but never rearranges anything itself.

**Options considered:**
- **`Lineup` / `LineupSlot` / `PositionAssignment` tables hanging off `Event`** — the
  original shape, one chart per game.
- **A team-level `Chart` table plus per-game override rows** — a standing default that
  game-day patches don't disturb.
- **Columns on `RosterEntry`** — `battingOrder` and `position` become attributes of a
  player's spot on a team, and "the chart" is just the roster read in order.

**Decision:** **Columns on `RosterEntry`.** Three tables disappear.

```
RosterEntry (playerId, teamId, jerseyNumber, battingOrder?, position?)
```

`battingOrder` and `position` are nullable, which is exactly how `allPlay = false`
expresses a bench: no slot, no position, still on the roster. The chart *is* the roster
ordered by `battingOrder`.

**Rationale:** A standing chart is one-per-team, and a roster entry is already
one-per-player-per-team, so the chart has no identity of its own to model — inventing
tables for it would be modelling a UI screen instead of the data. Per-game rows were the
right shape for a per-game chart and are simply the wrong shape now; keeping them would
mean writing near-identical rows every game to represent something that didn't change.
The override variant was the real alternative and was explicitly rejected: the ask is that
game-day patches *do* stick.

**The consequence worth naming:** this dissolves the roster-containment problem entirely.
The previous draft specified three enforcement layers — a filtered UI, a server-side
re-derivation, and a composite foreign key — to stop a coach putting a kid from another of
their teams into this team's lineup. None of that is needed now. A batting slot is a
column on a roster row, so **being in the lineup and being on the roster are the same
fact**. There is no write that could express the invalid state, which is a stronger
guarantee than any check could have given. Cross-team leakage is now impossible rather
than merely prevented.

**What it gives up:** there is no record of what the lineup was for any particular past
game, ever. Given that stats, box scores, and season history are all explicitly out of
scope, that costs nothing today — but it is a genuine one-way door, and the moment anyone
wants "what did we run last Saturday", the per-game tables have to come back and be
populated going forward. Noted in Revisit Triggers.

**Two things the readiness check must get right:**
- It reads the **next game** for the active team — not practices, which have RSVPs but no
  chart, and not later games, whose RSVPs will keep changing anyway.
- It is a **read-only derivation**, computed on the fly by joining the roster's chart
  columns against that event's `Rsvp` rows. It stores nothing and writes nothing. The
  instinct to "materialize the effective lineup" is the one to resist — that's how the
  per-game rows sneak back in.

## Stack Summary

| Layer | Choice | Team familiarity | Est. monthly cost | Notes |
|---|---|---|---|---|
| Framework | Next.js (App Router) | High (React/TS) | — | Server components + server actions |
| API | Server Actions + Route Handlers | Medium | — | No separate backend deploy |
| Database | Neon Postgres (via Vercel) | Medium | $0–19 | Free tier is genuinely sufficient at this scale |
| ORM | Prisma | Medium–High | $0 | Prisma Studio for roster seeding and debugging |
| Auth | Auth.js v5, emailed sign-in code + Prisma adapter | Medium | $0 | Invitation-gated; no self-serve signup |
| Hosting | Vercel | High | $20 (already paid) | Preview deploys; cron available for later reminders |
| Email | Resend + React Email | Medium | $0 | 3,000/mo free; **requires domain verification** |
| Push *(later)* | `web-push` + VAPID | **Low** | $0 | iOS requires Home Screen install — see Decision 8 |
| PWA shell | Manifest + hand-written SW | Low–Medium | $0 | Serwist deferred until offline caching matters |
| Drag & drop | `@dnd-kit` | Medium | $0 | `TouchSensor` delay is a stated requirement |
| UI | Tailwind + shadcn/ui | High | $0 | Components copied in, not imported |
| Dates | `date-fns` + custom views | High | $0 | Read-only calendar; no library warranted |
| Animation | Motion (`LazyMotion` + `m`) | Medium–High | $0 | **Never `layout` on a `@dnd-kit` node** — see Decision 14 |
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
| Single-**owner** scope | Another coach asks for their own teams in the same instance. Per-team scoping (Decision 13) already covers most of the work; what's missing is team ownership, a creation flow, and billing. Still the most expensive change on this list. |
| URL-based team scoping | The `/t/[teamId]/…` prefix makes URLs ugly enough to complain about. The fix is a default-team redirect at the root, not moving the scope into a cookie. |
| Folding `Guardian` into `User` | A guardian needs to exist without an email address — a phone-only emergency contact, say. Re-introducing a contact record is additive and doesn't disturb `Membership`. |
| Chart as columns on `RosterEntry` | Anyone wants per-game lineup history, or the permanence of chart edits proves annoying in real use ("I only moved him to shortstop because Ben was out"). The fix is to reintroduce per-game rows that default from the standing chart — additive, but only records games from that point forward. This is the one-way door on this list. |
| Global `Player` identity | Never — this is the load-bearing one. Adding returning kids to a new team depends on it (Decision 15), and reversing it means reconstructing family links per season. |
| Neon free tier | Cold-start latency on the autosuspended database becomes noticeable at the field, or storage passes the free limit. Upgrade to the paid tier; it's a plan change, not a migration. |
| Prisma | Serverless cold starts become a felt problem, or the bundle size starts to matter. Drizzle is the migration target. |
| Auth.js v5 | Wiring the email sign-in flow eats more than ~4 days. Fall back to Clerk and accept the two-system user sync. |
| Hand-written service worker | Offline lineup viewing gets promoted from *Later* to required. Adopt Serwist then. |
| `web-push` | iOS Home-Screen-install adoption among parents proves too low to be useful. The answer is probably to lean harder on email, not to switch push vendors — no vendor can fix this. |
| Resend | Deliverability problems after domain verification, or volume passes 3,000/month. Postmark is the upgrade. |
| `@dnd-kit` | Touch dragging tests badly with real coaches. Ship the tap-to-place mode as primary rather than replacing the library. |

## Next Steps

1. Create the repository and copy `product-brief.md` and this document into `docs/`.
2. Run `repo-setup` to generate a grounded `AGENTS.md`.
3. Run `milestone-planner` with the brief's MVP scope as the initiative, to break the
   build into phased, dependency-linked issues. Suggested phase order, which front-loads
   the riskiest assumption: auth + roster → schedule + RSVP → **validate with one real
   game weekend** → lineup → positions → view page → messaging → push.
