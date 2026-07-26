---
name: milestone-planner
description: Plan a GitHub milestone for a refactoring or feature initiative. Explores the codebase to understand current patterns, asks targeted clarifying questions, proposes a phased breakdown of logically ordered issues with explicit dependencies, and creates the milestone and all issues on GitHub — all before writing a line of code. Operates at initiative level, creating many issues — to plan a single existing issue use issue-planner; for a greenfield idea with no repo yet use app-brainstorm first.
license: MIT
---

# GitHub Milestone Planner

## Overview

A structured workflow for turning a high-level initiative (refactor, feature, migration) into a fully created GitHub milestone with well-scoped, dependency-linked issues.

**Announce at start:** "I'm using the `milestone-planner` skill."

---

## Step 1: Explore the codebase

Before asking any questions, build a complete picture of what the initiative will touch — use parallel read-only explore subagents if your harness supports them, otherwise your search tools directly. The goal is to arrive at clarifying questions already informed by the code — never ask for something you can discover by reading.

Investigate:

1. **Current patterns** — How is the relevant feature/system currently implemented? What files, components, hooks, utilities, or services are involved? What are the prop interfaces, state shapes, and data flows?
2. **Scope surface** — How many distinct areas (files, packages, views, routes, tests) will need to change? Look for every call site, every consumer, every test file.
3. **Existing dependencies** — What libraries are already in use? What versions? Are there partial adoptions of the target pattern anywhere in the codebase?
4. **Test coverage** — What tests exist for the affected areas? What patterns do they use (mocking strategy, test utilities, etc.)?
5. **Shared/cross-cutting concerns** — Any shared packages, design system components, or utilities that will need updating and that other packages depend on?

The output of this step is: exact file paths, line numbers, component/function signatures, and a factual summary — no recommendations, just findings.

---

## Step 2: Ask clarifying questions

After the explore phase, ask **only** the questions whose answers will materially change the issue breakdown or scope. Typical questions for a migration or refactoring:

- **Scope** — Which apps/packages are in scope? (Offer the specific ones discovered in Step 1.)
- **Version/approach** — If choosing between library versions or architectural patterns, present the concrete options found in the codebase.
- **Nesting / hierarchy** — For navigation, data modeling, or structural changes: how deep should the new pattern go? Flat vs. nested?
- **Shared components** — Should shared/design-system components be updated to natively support the new pattern, or kept with backward-compatible callback/prop interfaces?
- **Guards / constraints** — Any access control, auth, or validation concerns that need dedicated handling?

Use your harness's structured-question tool for multiple-choice. Offer a recommended option (first in the list, labelled "(Recommended)") based on what the codebase already does.

Do not ask about things already answered by the codebase exploration.

---

## Step 3: Draft the plan

With exploration complete and questions answered, produce the plan. The plan must include:

### Dependency graph

Draw an ASCII dependency graph showing which issues block which. Every issue must appear. Example:

```
Issue 1 (Foundation) ──┬──► Issue 3 (Module A)  ──────────────┐
                       │                                       ├──► Issue N (Cleanup)
Issue 2 (Shared)     ──┼──► Issue 4 (Module B)  ──► Issue 5 ──┘
                       │                            (Nested)
                       │
              (1 & 2 can run in parallel)
```

### Issue table

A summary table with one row per issue:

| # | Title | Scope | Description | Blocked By | Blocks |
|---|---|---|---|---|---|

### Issue details

For each issue, write out:

- **Title** — Imperative, prefixed with `Phase N:` (e.g., `Phase 1: Foundation — ...`)
- **Scope** — Which package(s)
- **Summary** — 2–3 sentences
- **Key tasks** — Bullet list of the concrete work items
- **Dependencies** — Explicitly: what it is blocked by, what it blocks, what can run in parallel
- **Context** — Specific file paths, component names, line numbers, prop interfaces, or patterns from the codebase that inform the work

**Mandatory final issue:** Every plan MUST include a "Documentation update" issue as the last item. This issue must:
- Update `AGENTS.md`, `README.md`, `.github/copilot-instructions.md` (if present), and any other documentation files that reference the systems changed by this milestone
- In a monorepo, check for per-package `AGENTS.md` files that also need updating
- Be blocked by all other issues in the milestone (it is always the last one completed)
- List every specific file that references the affected systems so no doc is missed

---

## Step 4: Get approval

Present the full plan (dependency graph + issue table + details). Ask:

> "Does this plan look good? Should I create the milestone and issues on GitHub now?"

If the user has changes, revise and re-present before proceeding. Do not create anything on GitHub until the user explicitly approves.

---

## Step 5: Create the milestone

Create the milestone via the GitHub API (not `gh milestone` — that subcommand does not exist):

```bash
gh api repos/{owner}/{repo}/milestones \
  -f title="<Milestone Title>" \
  -f state="open" \
  -f description="<description>"
```

The milestone description must include:

1. **One-paragraph summary** of the initiative — what is being changed, why, and what the end state looks like.
2. **Key decisions** — The concrete choices made (library versions, architectural patterns, scope boundaries) based on the answers to Step 2 questions.
3. **Dependency graph** — The ASCII graph from Step 3, so the milestone itself is self-documenting.

Capture the milestone number from the API response — it is needed to attach issues.

---

## Step 6: Create issues

Create all issues with `gh issue create`, attaching each to the milestone:

```bash
gh issue create \
  --milestone "<Milestone Title>" \
  --title "<Phase N: Title>" \
  --body "$(cat <<'EOF'
...
EOF
)"
```

**Each issue body must follow this structure:**

```markdown
## Summary

2–3 sentences describing what this issue accomplishes.

## Dependencies

- **Blocked by:** #NNN (title), #NNN (title) — or "Nothing" if foundational.
- **Blocks:** #NNN (title) — or "Nothing" if final.
- **Can run in parallel with:** #NNN (title) — if applicable.

## Scope

Which package(s) or layer(s) are touched.

## Tasks

Checkbox list of concrete work items. Each item should be:
- Actionable (starts with a verb)
- Specific (names the file, component, or API being changed)
- Testable (has an observable outcome)

Include a verification section at the end of Tasks:
- [ ] Relevant test command
- [ ] Lint command
- [ ] Build command

## Context

Specific codebase details:
- File paths and line numbers for the current implementation
- Component/function signatures being changed
- Patterns, types, or interfaces being replaced
- Anything a developer needs to know to start work immediately without additional investigation
```

**Important:** Issues are created before cross-referencing is possible. After all issues are created, update any issue bodies that contained placeholder references (e.g., "Issue #3") with the real GitHub issue numbers. Use `gh issue edit <number> --body "..."` for this.

---

## Step 7: Report

After all issues are created and updated, output a summary:

```
## Created: Milestone + N Issues

**Milestone:** [Title](URL)

| Phase | Issue | Blocked By | Blocks |
|---|---|---|---|
| 1 | #NNN — Title (URL) | Nothing | #NNN, #NNN |
| 2 | #NNN — Title (URL) | Nothing | #NNN, #NNN |
...
```

Then show the final dependency graph with real issue numbers substituted in.

---

## Rules

- Never create the milestone or any issue before the user explicitly approves the plan in Step 4.
- Always explore the codebase before asking questions — never ask for information you can discover by reading the code.
- Prefer subagents for codebase discovery when your harness supports them — never dump raw grep/glob output into the main context.
- Every issue must have explicit dependency information: what it blocks, what blocks it, what can run in parallel.
- Foundational issues (no blockers) and cleanup/verification issues (blocks nothing) must be clearly identified.
- Issue titles must be prefixed with `Phase N:` so the sequence is clear from the title alone.
- Use `gh api repos/{owner}/{repo}/milestones` to create milestones — `gh milestone` does not exist as a subcommand.
- After creating all issues, always update cross-references with real issue numbers (never leave placeholder text like "Issue #3" or "#TBD").
- Follow all project-specific coding standards, testing requirements, and architectural patterns documented in `AGENTS.md` when writing issue context and task checklists.
- Issue task checklists must always end with lint, test, and build verification steps using the commands documented in `AGENTS.md` or discoverable from `package.json` / `Makefile`.
- Every milestone plan MUST include a final "Documentation update" issue. Stale docs cause cascading confusion for both human developers and AI agents. This issue is blocked by all other issues and covers: `AGENTS.md`, `README.md`, `.github/copilot-instructions.md`, and any other files that reference the affected systems. Documentation is not optional — do not omit this issue even for small milestones.
