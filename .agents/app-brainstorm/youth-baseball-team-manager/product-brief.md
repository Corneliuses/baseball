# Product Brief — Youth Baseball Team Manager

**One-liner:** An invite-only PWA where one coach sets the schedule, lineup, and field
positions for a youth baseball team, and parents RSVP their kids and see exactly where
and when their kid is playing.

> **Process note:** This brief skips `app-brainstorm` Gate 1 (divergent idea generation
> and scoring). The author arrived with a fully specified concept, so the workflow
> entered at Step 5 (stack requirements) after capturing Step 1 constraints. There is no
> `idea-shortlist.md` for this project.

## Problem & Target User

**Primary user — the coach (Brian).** Runs a youth baseball team alongside a full-time
job. Today the schedule lives in a league website or a group text, RSVPs arrive as
scattered replies, and the lineup gets written on paper or a phone note in the parking
lot fifteen minutes before first pitch. Every game he re-answers the same three questions
by text: what time, where, and is my kid playing.

**Secondary user — the parents (~25 adults, ~15 kids).** They want to know when and where
to be, whether their kid is in the lineup, and what position they're playing — on a phone,
at a field, often with one bar of signal. They currently get this by texting the coach.

**What they do today:** group texts, a league website nobody checks, and paper lineup
cards. The failure mode isn't missing software — it's that the information exists only in
the coach's head until the moment it's needed.

## Core Loop

The weekly rhythm this app has to make effortless:

1. Coach adds the week's game or practice (date, time, location).
2. Parents get an email (and, later, a push notification) and toggle their kid
   **Attending / Not attending**.
3. As RSVPs land, the app tells the coach whether the team's standing chart still works
   for the next game — who's out, and which field positions that leaves uncovered.
4. The coach patches the chart if it needs it. Usually it doesn't, and this step is
   skipped entirely.
5. Parents open the app at the field and see the batting order and the diamond, labeled.

**The chart is standing, not per-game.** The coach sets a batting order and a positions
chart once, and it stays until they change it. Steps 3 and 4 are exception handling, not a
weekly ritual — the win is that a normal week needs no lineup work at all, and RSVPs earn
their keep by telling the coach when a week *isn't* normal.

## MVP Features

Scoped to fit **6 weeks of evenings and weekends**.

- **Auth & onboarding** — coach enters parent emails; each gets a one-time, expiring
  invitation link; opening it and accepting creates the account and signs the parent in on
  that device, in one trip. (Revised 2026-08-18: accepting used to *mail* a magic link,
  making onboarding two emails; real parents stopped at the second one. The magic link
  remains what `/signin` sends for everyone who is already a member.) No passwords. No
  self-serve signup.
- **Teams** — the owner creates a team per season and keeps past teams around. Every
  screen operates on exactly one **active team**, chosen from a team switcher. **Past
  teams are read-only** — they render completely but reject every mutation, so there's no
  way to edit last season by accident. Members keep that read-only access indefinitely
  rather than being removed at season's end. Team-scoped settings live here, including
  `allPlay`.
- **Roles** — owner, coach, parent, assigned **per team**. The same person can be a coach
  on this year's team and a parent on last year's. Owner can elevate a parent to coach on
  the team they're viewing. **Roles never inherit across teams** — someone joining a new
  team always arrives as a parent and is elevated individually, even if they coached last
  season. Coaches and parents see only the teams they're assigned to; the owner sees all
  of them.
- **Roster** — players with jersey numbers (editable, per team — numbers change between
  seasons); guardians linked to players many-to-many (a player can have several guardians;
  a guardian can have several kids). Players and guardians are **people who persist across
  seasons**, not per-team records. A player may be on **two active teams at once** — travel
  plus rec is normal — and carries nothing team-specific with them: jersey number, batting
  slot, and field position all belong to the team, never to the kid.
  The owner seeds each roster by hand through the UI — **no CSV import**, since the
  returning-player picker below covers the repeat case and a first season is one sitting.
- **Add returning players** — when building a new team's roster, the owner picks from
  players on any past team instead of retyping them. Adding a returning player
  automatically pulls their linked guardians onto the new team as **parents**, so the
  family is reachable immediately and nobody re-onboards. Each affected guardian gets a
  short **"you've been added to <team>"** email — no magic link, since they already have an
  account; just a heads-up and a way in. Explicitly *not* a bulk "copy last year's
  roster" — it's a deliberate pick, because rosters genuinely change.
- **Directory** — parent name, phone, email, and their kids. Visible to **coaches and the
  owner only** (revised 2026-08-18; it previously read "visible to all signed-in members").
  It is the whole team's contact details in one list, and a parent has no reason to hold
  every other family's phone number and email; a parent who needs to reach someone goes
  through the coach. To make that path real, the team home page shows parents a
  **coaching-staff contact card** (owner and coaches only — name, email, phone; no
  other family's data). Parents still see the schedule, the lineup, the roster, and
  RSVP. Owner-only was considered and rejected the same day: coaches already read
  contact details family-by-family through the roster entry pages their job requires,
  so excluding them from the directory would remove the convenient list without
  removing the access — while leaving an assistant coach at the field unable to call
  a parent.
- **Your profile** — each person sees and edits their own name and phone at `/profile`
  (added 2026-08-18). #5 logged "a parent expects to edit their own phone" as an accepted
  risk on the assumption they could at least see the value; closing the directory to
  parents removed the last screen that showed it, so a coach's typo became undetectable
  by the one person who knows it is wrong. Email is not editable — it is the magic-link
  identity, so changing it is an account migration, not a profile edit.
- **Schedule** — coach creates games and practices with location and time; parents see a
  month calendar view and a chronological list view.
- **RSVP** — parent toggles attending / not attending per kid per event, **only for kids
  they're linked to as a guardian**. Applies to practices as well as games.
- **Lineup** — a drag-and-drop batting order over the team's roster, held as the team's
  **standing order**. It persists until the coach changes it; edits are permanent. Players
  can only ever come from this team's roster. `allPlay = true` → every rostered player
  gets a slot; `allPlay = false` → 9 slots and the rest are unassigned. Dropping onto an
  occupied slot swaps. Cancel / Save.
- **Positions** — drag players onto a labeled diamond, likewise **standing** and likewise
  permanent (no inning rotation, no per-game chart). The nine standard defensive
  positions: **P, C, 1B, 2B, 3B, SS, LF, CF, RF** — `C` is Catcher, `CF` is Center Field.
  `allPlay = true` → one kid per infield position **except catcher** (P, 1B, 2B, 3B, SS),
  outfield holds all remaining players; at this level the coach pitches and nobody plays
  behind the plate, so C is not a spot that can be filled. `allPlay = false` → one kid per
  position, remainder sit in a Bench/Dugout zone. Cancel / Save.
- **Next-game readiness** — the one place attendance meets the chart. For the team's
  **next game only** — not practices, not later games — the app shows who's out and which
  positions that leaves uncovered. It never rearranges the chart on the coach's behalf;
  it only tells them what's broken so they can decide. A patch made here is a normal chart
  edit and therefore permanent, exactly like any other.
- **View page** — one mobile-friendly page with the labeled diamond and the ordered
  lineup, stacked vertically on phones, with touch-activation delay so scrolling never
  triggers a drag. Viewed in the context of the next game, players who aren't attending
  are shown greyed rather than removed, so a parent sees the real chart and who's missing
  from it.
- **Email messaging** — coach broadcasts to all parents in one click, or targets
  individuals; parents can message all coaches at once. No parent-to-parent messaging.
- **Installable PWA** — manifest, icons, add-to-home-screen.

## Later

Deliberately deferred past the 6-week mark, in the order I'd add them:

- **Web push notifications.** Email is the reliable channel; push is the finicky one (see
  Constraints). Ship email first, layer push on once the app is in real use.
- **Game-day reminders** — scheduled job that nudges parents who haven't RSVP'd.
- **Offline read caching** — service-worker caching so the lineup renders at a field with
  no signal.
- **Calendar subscription** — ICS feed so the schedule lands in parents' phone calendars.
- **Double-booking warning** — a kid on two active teams can have two games at the same
  time. Detecting the clash at RSVP time is a small query and a genuinely useful nudge,
  but it's the only feature that reads across teams, so it waits until the single-team
  paths are solid.
- **Accessible non-drag input mode** — tap-to-select then tap-to-place, as an alternative
  to dragging.

## Out of Scope

- **Multi-tenancy as a product.** The app is multi-*team* but single-*owner*: one person
  owns every team in the instance and is the only one who can create one. There is no
  self-serve signup for other coaches, no org or league layer above the team, and no
  billing. Another coach wanting their own teams means running a second instance.
- **Cross-team views.** No "all my teams" combined schedule, no season-over-season
  reporting, no player history page. You switch teams to see a team. The one deliberate
  seam between teams is picking returning players onto a new roster; nothing else reads
  across them.
- **Score, stats, and box scores.** This app schedules and assigns; it does not record
  what happened.
- **Inning-by-inning position rotation.** Positions are static for the whole game, by
  explicit design.
- **Parent-to-parent direct messaging.** Parents reach coaches as a group; that is all.
- **SMS.** Email and push only.
- **Photo and video sharing.** Adds media storage plus consent questions around minors.
- **Payments, team fees, fundraising.**
- **Practice plans, drills, playbooks.**
- **Native iOS/Android app store distribution.** PWA only.

## Differentiation

TeamSnap, GameChanger, and SportsEngine all solve this — and all of them are heavier than
one coach needs, paywall the useful parts, or push parents into yet another account and
app install. This app wins on exactly three things:

1. **A standing chart, not a weekly chore.** The competition assumes you build a lineup
   every game. Here the batting order and diamond persist, and RSVPs exist to tell the
   coach the one thing that actually matters: whether this week breaks the chart, and
   which position it leaves empty. A normal week needs no lineup work at all.
2. **`allPlay` is a first-class team setting.** Recreational youth leagues where every kid
   bats and every kid fields are the norm, and the big products model them as an
   exception.
3. **Parents never create an account.** They click a link in an email and they're in.

None of that matters commercially — the audience is 25 people who already know the coach.
It matters because it's the difference between parents using it and parents going back to
texting.

## Success Criteria & Validation Plan

**The core assumption:** parents will RSVP in an app without being chased by text.
Everything downstream — the filtered player pool, the fast lineup — collapses if they
won't.

**Cheapest test, and the first thing to build:** ship only auth + schedule + RSVP +
a static lineup view, and run it for one real game weekend. Send one email announcing the
game. Do not follow up by text.

**Observable results that mean it held:**

| Signal | Target |
|---|---|
| Parents who RSVP before game day without a text reminder | ≥ 70% |
| Time for the coach to set lineup and positions on a phone | < 5 minutes |
| "What time / where / is he playing" texts received on game day | → 0 |

If RSVP participation is low after two games, the fix is notification design, not more
features.

## Constraints Recap

| Constraint | Answer |
|---|---|
| Platform | Progressive Web App, mobile-first. No native apps. |
| Audience | One active youth baseball team at a time — ~15 players, ~25 guardians, 1–3 coaches — plus archived teams from past seasons. |
| Team & skills | Solo build. TypeScript / React, comfortable in the npm ecosystem. |
| Budget | Vercel paid plan already in place; willing to pay for a small database. |
| Timeline | 6 weeks, evenings and weekends. |
| Scope | Multiple teams under one owner, one active at a time. Every table carries a team scope and every query is filtered by membership. Not a SaaS — no other owners. |

**Carried risk — iOS push.** On iPhone, Web Push only works if the user has explicitly
added the PWA to their Home Screen (iOS 16.4+). A parent who just uses the link in Safari
will never receive a push, silently. This is why email is the primary channel in MVP and
push is deferred: the app must work fully for a parent who never installs it.

**Carried risk — 6-week scope.** The MVP list above is already the full proposal minus
push notifications. Two drag-and-drop surfaces (lineup and diamond) are the most
uncertain estimate in it. If week 4 arrives and they aren't solid, cut the diamond to a
simple dropdown-per-position form and ship the drag interface later — the view page
matters more than the authoring gesture.

**Carried note — minors' data.** The app stores children's names and jersey numbers
alongside guardian contact details. Keep it invite-only, keep it out of search engine
indexes, and treat any future photo feature as a consent decision rather than a feature
decision.

## Open Questions

None outstanding. Every question raised during brainstorming has been answered and folded
into the sections above; the decisions are recorded there rather than kept as a list here.

The one thing to watch during the build, since it was the last decision made and the least
tested against reality: **the standing chart's edits are permanent, with no undo and no
history.** Patch the order because a kid is out on Saturday, and that patch is simply the
order now. If that turns out to feel wrong in real use, the fix is per-game overrides
(see Revisit Triggers in `stack-decisions.md`) — worth noticing early rather than
discovering in week 5.
