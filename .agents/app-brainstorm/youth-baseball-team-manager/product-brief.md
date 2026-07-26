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
3. On game day the coach opens the roster filtered to *attending players only*, drags a
   batting order and drags kids onto a baseball diamond, and hits **Finalize**.
4. Parents open the app at the field and see the batting order and the diamond, labeled.
5. Repeat next game.

Step 2 feeding step 3 is the whole point — RSVPs are not a courtesy, they are the input
that makes lineup-setting fast.

## MVP Features

Scoped to fit **6 weeks of evenings and weekends**.

- **Auth & onboarding** — coach enters parent emails; each gets an invitation link;
  clicking it issues a one-time, expiring magic link and creates the account. No
  passwords. No self-serve signup.
- **Roles** — owner, coach, parent. Owner can elevate a parent to coach.
- **Roster** — players with jersey numbers (editable); guardians linked to players
  many-to-many (a player can have several guardians; a guardian can have several kids).
- **Directory** — parent name, phone, email, and their kids. Visible to all signed-in
  members.
- **Schedule** — coach creates games and practices with location and time; parents see a
  month calendar view and a chronological list view.
- **RSVP** — parent toggles attending / not attending per kid per event.
- **Lineup** — drag-and-drop batting order over *attending* players. `allPlay = true` →
  slots equal the attending count; `allPlay = false` → 9 slots. Dropping onto an occupied
  slot swaps. Cancel / Finalize.
- **Positions** — drag players onto a labeled diamond, set once per game (no inning
  rotation). The nine standard defensive positions: **P, C, 1B, 2B, 3B, SS, LF, CF, RF**
  — `C` is Catcher, `CF` is Center Field. `allPlay = true` → one kid per infield position
  (P, C, 1B, 2B, 3B, SS), outfield holds all remaining players. `allPlay = false` → one
  kid per position, remainder go to a Bench/Dugout zone. Cancel / Finalize.
- **View page** — one mobile-friendly page with the labeled diamond and the ordered
  lineup, stacked vertically on phones, with touch-activation delay so scrolling never
  triggers a drag.
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
- **Lineup templates** — start from last game's order instead of a blank slate.
- **Accessible non-drag input mode** — tap-to-select then tap-to-place, as an alternative
  to dragging.

## Out of Scope

- **Multi-team support.** Single team, permanently. No team creation UI, no other coaches
  signing up, no per-team query scoping.
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

1. **The RSVP-to-lineup pipeline is the product**, not a feature buried three screens
   deep. Attending players are the only players you can drag.
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
| Audience | One youth baseball team — ~15 players, ~25 guardians, 1–3 coaches. |
| Team & skills | Solo build. TypeScript / React, comfortable in the npm ecosystem. |
| Budget | Vercel paid plan already in place; willing to pay for a small database. |
| Timeline | 6 weeks, evenings and weekends. |
| Scope | Single team, permanently. |

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

- **Does the batting order persist between games as a default?** Assumed no for MVP;
  every game starts blank.
- **Can a parent RSVP on behalf of a kid they aren't linked to?** Assumed no — guardians
  RSVP only for players they're linked to.
- **What happens to a finalized lineup when a kid's RSVP changes afterward?** Assumed the
  lineup is a snapshot and the coach is warned but not auto-edited. Needs confirming.
- **Who seeds the initial roster** — is the owner typing in 15 players and 25 guardians by
  hand, or is a CSV import worth the hour it costs?
