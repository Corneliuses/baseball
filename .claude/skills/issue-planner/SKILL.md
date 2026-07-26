---
name: issue-planner
description: Comprehensive planning workflow for GitHub issues. Fetches issue details, asks clarifying questions, reviews relevant code, and produces design/task/proposal documentation. Plans one existing issue in depth — to break a whole initiative into issues use milestone-planner; to just rewrite an issue's wording use issue-refiner.
license: MIT
---

# Issue Planning Skill

Use this skill to transform a raw GitHub issue into a comprehensive implementation plan with
design decisions, task breakdown, and proposal summary — before writing a single line of code.

---

## When to Use

- Starting a new ticket and need a thorough plan before implementation
- Issue description or acceptance criteria are ambiguous and need clarification
- Complex features that span multiple packages (backend + frontend + config)
- Refactoring or infrastructure tasks with unclear scope
- Any ticket where reducing ambiguity upfront will save rework later

---

## Invocation

```
/plan-issue <ISSUE_NUMBER>
```

Example:
```
/plan-issue 456
```

---

## Workflow

### Step 1 — Fetch and Parse the Issue

Run:
```bash
gh issue view <NUMBER> --repo <owner>/<repo>
```

If the repo cannot be auto-detected from the current directory, ask the user before proceeding.

Extract and record:
- **Title**
- **Description / body**
- **Labels** (used for scope detection in Step 3)
- **Assignees**
- **Linked / referenced issues** (look for `#NNN` mentions or "Closes #NNN" in the body)
- **Explicit acceptance criteria** (look for checklist items, "AC:", "Acceptance Criteria:", etc.)
- **Milestone** (if any)

---

### Step 2 — Clarifying Questions (If Needed)

Before exploring any code, assess whether the issue has genuine ambiguity in any of the
following areas. If it does, ask targeted questions — **up to 5 at a time**, then **block**
and wait for answers before proceeding.

| Scenario | Example Question |
|---|---|
| Acceptance criteria are vague or missing | "What specific behavior should a passing test verify? Can you provide an example input and expected output?" |
| Multiple valid implementation approaches exist | "Should we approach this as [Option A] or [Option B]? Specifically: [trade-offs]" |
| Scope boundary is unclear | "Does this ticket include [related concern]? Should [edge case] be handled here or in a follow-up?" |
| Data model or API contract is undefined | "Should the response include [field]? How should validation errors be represented?" |
| Dependencies on other issues are implied but unstated | "Does this depend on #NNN landing first? Is there a hard blocker or just a preference?" |
| Performance or security expectations are unstated | "Are there latency SLAs for this endpoint? Are there security implications around [X]?" |

> **Rule:** Ask questions about acceptance criteria and direction *first*, before code exploration.
> Code exploration informs and validates the plan but must not substitute for explicit requirements.

---

### Step 3 — Auto-Detect Scope

Based on labels, title, and description, classify the work into one or more of the following
domains. Each domain triggers additional targeted questions.

#### Backend / API

Triggered by labels: `backend`, `api`, `server`
Or keywords in title/body: "endpoint", "API", "server", "handler", "route", "service"

Ask:
- "Does this require new database collections/tables or changes to an existing schema?"
- "Are there new complex queries involved that require index definitions?"
- "Do data access rules or permission checks need updating?"
- "Is this a public endpoint or an authenticated one? Which roles can call it?"

#### Frontend / UI

Triggered by labels: `frontend`, `ui`, `client`, `web`
Or keywords: "page", "screen", "dashboard", "form", "component", "route"

Ask:
- "Does this touch authentication-gated routes? Which roles can see it?"
- "Does the data need to update live (subscriptions, polling, websockets), or is fetch-on-load enough?"
- "Does this change navigation structure or add a new top-level view?"

#### Shared / Design System

Triggered by labels: `shared`, `component-library`, `design-system`
Or keywords: "shared component", "design system", "library"

Ask:
- "Does this component need to accept assets (logos, icons) as props rather than importing them directly?"
- "If the project uses visual regression or snapshot testing, will baselines need updating?"
- "Are there consumers of this component in other packages that need updating?"

#### Database / Schema

Triggered by labels: `database`, `schema`, `migration`
Or keywords: "collection", "table", "schema", "migration", "index", "query"

Ask:
- "Is this a breaking schema change for any existing records?"
- "Do existing records need a backfill or migration script?"
- "What is the rollback plan if something goes wrong in production?"

#### Security / Auth / Permissions

Triggered by labels: `security`, `auth`, `permissions`, `roles`
Or keywords: "auth", "permission", "role", "access control", "token", "claims"

Ask:
- "Which roles should have access to this feature?"
- "Are there permission checks that need updating at the API layer?"
- "Are there data-level access controls (e.g. row-level security, database rules, middleware guards) that need updating?"

---

### Step 4 — Code Exploration

Explore the codebase thoroughly. The goal is to understand the *existing* patterns so the
plan stays consistent with them.

1. **Find related implementations**
   - Search for similar features (e.g., other forms, hooks, endpoints, components)
   - Note file structure, naming conventions, and prop patterns
   - Identify the closest 2–3 analogous implementations

2. **Trace the full data flow**
   - From the data source (database, API, external service) through to the UI
   - Note what data is currently fetched, shaped, or transformed at each layer

3. **Identify config and infrastructure gaps**
   - Are there new queries that require index definitions?
   - Do data access rules need new coverage?
   - Do any functions need new documentation or type annotations?

4. **Review existing tests**
   - Find tests for the closest analogous feature
   - Note testing patterns: describe block structure, mock strategies, assertion style
   - Identify any shared test utilities or fixtures

5. **Check permission consistency**
   - When building a data query, confirm which roles should see which data
   - Verify that access control at the API layer is consistent with any data-level rules

---

### Step 5 — Devise Strategy

Produce a clear technical strategy:

- **Chosen approach** with explicit rationale ("We chose X because Y, which avoids Z and
  aligns with the existing pattern in `path/to/file.ts`")
- **Potential risks** and edge cases (data migration, breaking changes, performance, security)
- **Phased breakdown** if the work genuinely spans multiple concerns:

| Signal | Recommended phase boundary |
|---|---|
| Backend + Frontend changes | Phase 1: backend; Phase 2: frontend |
| Feature code + infra (indexes, rules) | Phase 1: infra; Phase 2: feature code |
| Unit tests + integration/E2E tests | Phase 1: unit; Phase 2: integration/E2E |
| Independent sub-features with no dependency | Can be parallelised within a single phase |

> **Rule:** Do not phase trivially small changes. Phase work only when staging genuinely
> reduces risk or makes PRs more reviewable.

---

### Step 6 — Generate Deliverables

Create three markdown documents in `.agents/issue-planner/<ISSUE_NUMBER>/`:

```
.agents/issue-planner/
└── <ISSUE_NUMBER>/
    ├── design-doc.md
    ├── task-doc.md
    └── proposal-doc.md
```

---

## Document Templates

### `design-doc.md`

```markdown
# Design Doc — [Issue Title] (#[NUMBER])

## Overview

[What problem does this solve? Why does it matter? 1–3 sentences.]

## Acceptance Criteria

[Copied from issue + any clarifications from Step 2. Use a checklist.]

- [ ] AC1
- [ ] AC2

## Architecture & Data Model

### Data Layer

[Describe any new or modified data structures, collections, tables, or schemas.]

### API / Service Layer

| Endpoint / Function | Type | Auth | Purpose |
|---|---|---|---|
| `functionName` | HTTP / RPC / Internal | Public / Role | Description |

### UI Component Tree

[Diagram or list of components, hooks, and their relationships — if applicable.]

## Key Decisions

### Decision 1: [Short Title]

**Options considered:**
- Option A: [description]
- Option B: [description]

**Decision:** [chosen option]
**Rationale:** [why, what risk it avoids, what existing pattern it aligns with]

## Security & Permissions

[Which roles have access? How is access enforced at the API and data layers?]

## Error Handling

[How are errors handled at each layer?]

## Testing Strategy

| Layer | Test Type | File(s) | Notes |
|---|---|---|---|
| API / Service | Unit / Integration | `src/...test.ts` | |
| Hook / Store | Unit | `src/.../hooks/...test.ts` | |
| Component | Unit / Visual | `src/.../components/...test.tsx` | |

## Config Changes

- [ ] Schema / index changes — [description, or "none required"]
- [ ] Access rule changes — [description, or "none required"]
- [ ] Environment variables — [new vars, or "none required"]
- [ ] Dependency changes — [new packages, or "none required"]

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| [Edge case] | High/Med/Low | [How it's handled] |
```

---

### `task-doc.md`

```markdown
# Task Doc — [Issue Title] (#[NUMBER])

## Prerequisites

- [ ] [Any blocking issues, PRs, or config that must land first]

## Phase 1: [Name, e.g., "Backend — API & Data Layer"]

- [ ] [Specific step with file path]
- [ ] [Next step]
- [ ] Write unit tests for [function/module] in `[path/to/file.test.ts]`

## Phase 2: [Name, e.g., "Frontend — Hook & Component"] (if applicable)

- [ ] [Step]
- [ ] [Step]
- [ ] Write component tests in `[path/to/file.test.tsx]`

## Phase 3: [Name, e.g., "Config & Infrastructure"] (if applicable)

- [ ] [Schema or index changes]
- [ ] [Access rule changes]

## Pre-Commit Gate

Discover the project's verification commands from `AGENTS.md` (look for a `## Commands`
section) or `package.json` scripts, then run and confirm all are green before committing:

- [ ] Lint ✅
- [ ] Tests ✅
- [ ] Build ✅

## Files Modified / Created

| File | Change |
|---|---|
| `path/to/file.ts` | [Brief description] |
```

---

### `proposal-doc.md`

```markdown
# Proposal — [Issue Title] (#[NUMBER])

## Executive Summary

[1–2 paragraph summary of what is being built, why it matters, and the approach chosen.]

## Scope

### In Scope
- [Feature / behaviour A]
- [Feature / behaviour B]

### Out of Scope
- [Related concern deferred to follow-up issue]

## Acceptance Criteria

[Final confirmed list — must match design-doc.md. Use a numbered list for traceability.]

1. [AC1]
2. [AC2]

## Implementation Phases

| Phase | Description | Areas Affected |
|---|---|---|
| 1 | [Name] | `src/api/`, `src/db/` |
| 2 | [Name] | `src/components/` |

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| [Risk] | High / Med / Low | [Mitigation] |

## Effort Estimate

**Overall:** Small (1–2 days) / Medium (3–5 days) / Large (1+ week)

| Phase | Estimate |
|---|---|
| Phase 1 | [X days] |
| Phase 2 | [X days] |

## Next Steps

1. Review and approve this proposal.
2. Follow `task-doc.md` to implement phase by phase.
3. After implementation, finalize with the `finalize-issue` skill (verify AC against the
   PR, archive `.agents/issue-planner/<ISSUE_NUMBER>/`, merge, and close the issue).
```

---

## When Planning is Complete

1. Present all three documents to the user.
2. Summarize the proposal verbally: highlight key decisions, risks, and effort estimate.
3. Ask: "Does this plan look good? Any changes before we proceed to implementation?"
4. **Stop and wait** — Do not auto-start implementation. Wait for explicit approval.

---

## On Plan Approval

Once the user approves the plan, **before writing any code**:

1. Post the full `proposal-doc.md` content as a comment on the GitHub issue:
   ```bash
   gh issue comment <NUMBER> --body "$(cat .agents/issue-planner/<NUMBER>/proposal-doc.md)"
   ```
2. Confirm the comment was posted successfully (check for the comment URL in the output).
3. Then proceed with implementation following `task-doc.md`.

---

## Cleanup After Implementation

When implementation is complete and the PR is open, prefer the `finalize-issue` skill: it
verifies the PR against the acceptance criteria, archives the planning docs on the PR
branch, merges when checks are green, and closes the issue.

If finalizing manually instead, after the PR is merged:

1. Archive `.agents/issue-planner/<ISSUE_NUMBER>/` to `.agents/archive/issue-planner/<ISSUE_NUMBER>/`
   (or delete it if the project doesn't keep an archive).
2. Close the issue if it isn't already closed by the merged PR.

---

## Common Pitfalls

| Pitfall | Prevention |
|---|---|
| Asking too many questions at once | Cap at 5 per round. Ask the highest-impact questions first. |
| Exploring code before clarifying AC | Ask questions *first*. Code review validates the plan; it does not replace requirements. |
| Vague task steps | Every task step must reference a specific file path. "Update the hook" is not acceptable; "Update `useOrders` in `src/hooks/useOrders.ts`" is. |
| Over-phasing simple features | Phase only when staging reduces risk or improves reviewability. Don't phase trivial changes. |
| Missing security audit | Always ask: "Does this touch auth or role-based access? Do access rules need updating?" |
| Underestimating effort | Implementation is ~50% of total effort. Factor in tests, config, documentation, and PR review cycles. |
