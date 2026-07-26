---
name: app-brainstorm
description: Brainstorm app ideas from a fuzzy prompt and choose a tech stack before any code exists. Captures constraints (platform, timeline, budget, team skills), runs a divergent round of candidate ideas, converges via weighted scoring to a human-approved pick, then selects a stack layer by layer with Options/Decision/Rationale records biased toward team familiarity. Produces a product brief and stack decision doc. Operates pre-repo — once the repo exists use repo-setup for AGENTS.md, and milestone-planner to break the build into issues.
license: MIT
---

# App Brainstorm

A structured workflow for turning a fuzzy "I want to build some kind of app" prompt into a
chosen concept and an approved tech stack — a product brief and per-layer stack decision
records, produced before a repo, a framework, or a line of code exists.

**Announce at start:** "I'm using the `app-brainstorm` skill."

---

## When to Use

- You have only a fuzzy notion ("some kind of app for X") and no repo yet
- You have several competing ideas and need a structured way to pick one
- You have a concrete idea but no stack decided — skip straight to Step 5 and say so
- A hackathon or side project where scope-to-timeline fit matters more than ambition

Not for planning work in an existing repo — use `milestone-planner` for that.

---

## Invocation

```
/app-brainstorm [seed idea or problem domain]
```

Examples:
```
/app-brainstorm something to help my climbing gym track routes
/app-brainstorm
```

The argument is optional; with no argument, Step 1 elicits the seed.

---

## Workflow

### Step 1 — Capture Seed and Constraints

Parse whatever the user supplied. Then run **one** clarifying round — ask targeted
questions, **up to 5 at a time**, using your harness's structured-question tool if it has
one, then **block** and wait for answers before proceeding.

| Area | Example Question |
|---|---|
| Platform targets | "Web, mobile, desktop, or CLI? If mobile: iOS, Android, or both?" |
| Audience | "Is this for yourself, friends, the public, or paying customers?" |
| Team size and skills | "Who's building this, and what languages/frameworks does the team already ship with?" |
| Budget tolerance | "Free tiers only, or is paid infrastructure (hosting, APIs, services) acceptable?" |
| Timeline | "Is this a weekend project, a month, or a quarter?" |
| Must-use / must-avoid tech | "Any technology you're set on using — or refuse to touch?" |

> **Rule:** Constraints before ideas. Never brainstorm in a vacuum — every scoring
> criterion in Step 3 and every stack rationale in Step 6 is anchored to answers from
> this step.

---

### Step 2 — Diverge

Generate **6–10 candidate ideas**. Deliberately span multiple axes rather than producing
ten variations of one idea:

- **Audience** — different user groups within the problem domain
- **Problem intensity** — painkillers (urgent problems) and vitamins (nice-to-haves)
- **Effort tier** — weekend, month, and quarter-sized concepts
- **Risk profile** — safe, proven shapes alongside one or two novel bets

Present every candidate in the same fixed format:

| Field | Content |
|---|---|
| One-liner | What it is, in one sentence |
| Target user | Who reaches for it, and when |
| Core loop | The repeated action that makes it useful |
| Differentiator | Why this instead of what already exists |
| Effort tier | Weekend / Month / Quarter |
| Key risk | The most likely reason it fails |

> **Rule:** No evaluation during divergence. Do not score, rank, or editorialize until
> Step 3 — premature judgment kills the unusual candidates that make the round worth
> running.

---

### Step 3 — Converge and Score

Score every candidate 1–5 against six criteria, then compute a weighted total:

| Criterion | Default weight | Asks |
|---|---|---|
| Problem severity | 2 | Is this a real pain, or a nice-to-have? |
| Constraint fit | 2 | Does it fit the platform, budget, and must-use/avoid answers from Step 1? |
| Scope-to-timeline fit | 2 | Can an MVP genuinely ship within the stated timeline? |
| Team skill fit | 2 | Can this team build it with what they already know? |
| Differentiation | 1 | Is there a reason to use this over existing options? |
| Ease of validation | 1 | How cheaply can the core assumption be tested? |

Adjust the weights if the user stated priorities in Step 1 (say so explicitly when you
do). Present the full scoring matrix, then shortlist the **top 3** with a one-paragraph
trade-off summary each.

> **Rule:** Scores rank candidates; they do not decide. The human decides in Step 4.

---

### Step 4 — Approval Gate 1: Idea Selection

1. Write `idea-shortlist.md` to `.agents/app-brainstorm/<slug>/` (use an interim slug
   derived from the seed topic; rename the directory to the chosen app's kebab-case name
   once one is picked).
2. Present the shortlist and ask the user to **pick one, merge two, or redirect**. If
   their answer raises new ambiguity, ask up to 3 follow-up questions per round.
3. **Stop and wait** — do not proceed to stack selection without an explicit pick.
4. On selection, write `product-brief.md` and confirm the MVP scope / out-of-scope split
   with the user before moving on.

---

### Step 5 — Derive Stack Requirements

From the approved brief, derive *technology-agnostic* requirements for each layer before
naming any technology:

- **Client** — realtime updates? offline use? native device features (camera, GPS, push)?
- **Data** — relational or document-shaped? expected volume? full-text search?
- **Auth** — anonymous, social login, email/password, roles and permissions?
- **Backgrounding** — scheduled jobs, queues, long-running work?
- **Scale** — realistic user count at MVP; don't design for imagined millions
- **Integrations** — payments, email, AI/ML, third-party APIs?

> **Rule:** Requirements before names. No technology may be named until its layer's
> requirements are written down.

This step is the entry point for users who arrive with an idea already chosen — confirm
Step 1 constraints first if they were never captured.

---

### Step 6 — Select the Stack

For each layer, produce a decision record: **Options considered (2–4) / Decision /
Rationale**. The rationale must cite the Step 1 constraints and the team's existing
skills — "the team already ships TypeScript" is a stronger argument than any benchmark.

Core layers, always covered:

1. Platform / frontend framework
2. Backend / API layer
3. Database
4. Auth
5. Hosting / deployment

Conditional layers, only when Step 5's requirements demand them: payments, realtime,
background jobs, file storage, AI/ML, mobile distribution.

> **Rule:** Boring by default. The stack gets at most one **innovation token** — one
> major technology the team doesn't already know. Every unfamiliar pick must name the
> familiar alternative it beat and why. Resume-driven choices are rejected.

---

### Step 7 — Approval Gate 2: Stack Approval

1. Write `stack-decisions.md` to `.agents/app-brainstorm/<slug>/`.
2. Present the stack summary table, the estimated monthly cost at MVP scale, and — if the
   innovation token was spent — call out what it was spent on.
3. **Stop and wait** for approval. If the user contests a layer, iterate on that layer's
   decision record only; do not reopen settled layers.

---

### Step 8 — Handoff

Summarize the deliverables and recommend the greenfield chain:

1. Create the repository.
2. Run `repo-setup` to generate a grounded `AGENTS.md`.
3. Run `milestone-planner`, feeding it the brief's MVP scope as the initiative, to break
   the build into phased, dependency-linked issues.

Do not start implementation planning here — this skill ends at an approved brief and
stack.

---

## Document Templates

### `idea-shortlist.md`

```markdown
# Idea Shortlist — [Topic]

## Constraints

| Constraint | Answer |
|---|---|
| Platform | |
| Audience | |
| Team & skills | |
| Budget | |
| Timeline | |
| Must-use / must-avoid | |

## All Candidates

| # | Idea | One-liner | Effort tier | Key risk |
|---|---|---|---|---|

## Scoring Matrix

| # | Idea | Severity ×2 | Constraint fit ×2 | Scope fit ×2 | Skill fit ×2 | Differentiation ×1 | Validation ×1 | Total |
|---|---|---|---|---|---|---|---|---|

## Shortlist

### 1. [Idea]
[Trade-off paragraph: what makes it strong, what makes it risky.]

### 2. [Idea]
[Trade-off paragraph.]

### 3. [Idea]
[Trade-off paragraph.]

## Selected

**[Idea]** — [date], [one-line reason from the user's decision].
```

### `product-brief.md`

```markdown
# Product Brief — [App Name]

**One-liner:** [What it is, in one sentence.]

## Problem & Target User

[Who has the problem, how painful it is, what they do today instead.]

## Core Loop

[The repeated action that makes the app useful, as a short numbered sequence.]

## MVP Features

- [Feature — the smallest set that exercises the core loop]

## Later

- [Deferred feature]

## Out of Scope

- [Explicitly excluded — this section must not be empty]

## Differentiation

[Why this instead of existing options.]

## Success Criteria & Validation Plan

[What observable result means the core assumption held, and the cheapest way to test it.]

## Constraints Recap

[Platform, audience, team, budget, timeline — carried from the shortlist.]

## Open Questions

- [Anything unresolved that implementation will have to answer]
```

### `stack-decisions.md`

```markdown
# Stack Decisions — [App Name]

## Team Profile & Constraints

[Team size, languages/frameworks they ship with, budget, timeline — from Step 1.]

## Layer Requirements

| Layer | Requirements (technology-agnostic) |
|---|---|

## Decisions

### Decision 1: [Layer]

**Options considered:**
- Option A: [description]
- Option B: [description]

**Decision:** [chosen option]
**Rationale:** [why — must cite constraints and team familiarity]

## Stack Summary

| Layer | Choice | Team familiarity | Est. monthly cost | Notes |
|---|---|---|---|---|

**Innovation token:** [spent on X because Y / not spent]
**Estimated monthly cost at MVP scale:** [total]

## Revisit Triggers

| Decision | Revisit if… |
|---|---|

## Next Steps

1. Create the repository and copy this doc plus `product-brief.md` into it (e.g. `docs/`).
2. Run `repo-setup` to generate `AGENTS.md`.
3. Run `milestone-planner` with the brief's MVP scope as the initiative.
```

---

## Cleanup

Once the project repository exists:

1. Copy `product-brief.md` and `stack-decisions.md` into the new repo (suggest `docs/`).
2. Archive `.agents/app-brainstorm/<slug>/` to `.agents/archive/app-brainstorm/<slug>/`
   (or delete it if no archive is kept).

---

## Common Pitfalls

| Pitfall | Prevention |
|---|---|
| Anchoring on the first idea | Complete the full 6–10 candidate divergent round before any scoring or commentary. |
| Brainstorming in a vacuum | Step 1 constraint questions come first; block until answered. |
| Resume-driven stack choices | One innovation token per project; every unfamiliar pick must name the familiar alternative it beat. |
| Naming technologies before requirements | Step 5 writes per-layer requirements before any technology is mentioned. |
| Over-scoped MVP | Effort tiers plus scope-to-timeline scoring; the brief's Out of Scope section must not be empty. |
| Option sprawl per layer | 2–4 options per layer; conditional layers only when Step 5's requirements demand them. |
| Treating scores as the decision | Scores rank; the human picks at Gate 1. Never skip either approval gate. |
| Sliding into implementation planning | Stop at approved brief + stack; hand off to `repo-setup` and `milestone-planner`. |
