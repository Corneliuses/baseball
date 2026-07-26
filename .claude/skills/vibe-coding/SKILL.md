---
name: vibe-coding
description: Fully autonomous end-to-end development flow. When the user says "vibe coding" (or "vibe code this", "vibe mode", etc.), activate this skill to implement a fix or feature, run the pre-commit gate, commit, create a PR, wait 10 minutes, then autonomously fetch and address all code review comments — no user input required at any step.
license: MIT
---

# Vibe Coding

## Overview

A fully hands-off, autonomous development loop. Once activated, you will carry out the entire lifecycle — implement, verify, commit, PR, review — without prompting the user for decisions.

**Announce at start:** "Vibe coding activated. I'll handle everything end to end."

---

## Phase 1: Understand the task

Before writing code, silently read the task description from the user's message (or the preceding conversation context). Do not ask clarifying questions — infer intent from context. If the task is ambiguous, pick the most conservative interpretation and proceed.

Plan every step with your harness's task/todo tracking tool before starting.

---

## Phase 2: Implement

1. Explore the codebase to find all relevant files — use a read-only explore subagent if your harness supports one, otherwise use your search tools directly.
2. Apply all changes using Edit or Write tools. Follow the project's coding standards from `AGENTS.md`.
3. Add or update co-located test files to maintain coverage. Follow the test file naming convention already established in the project.

---

## Phase 3: Pre-commit gate (mandatory — do not skip)

#### Discover project commands

Before running any checks, identify the project's verification commands in this order:

1. **`AGENTS.md`** — look for a `## Commands` section listing lint, test, and build commands
2. **`package.json` scripts** — look for entries named `lint`, `test`, `build`, `check`, `typecheck`, etc.
3. **`Makefile`** — look for relevant targets

Use whatever commands the project defines. Never assume a specific package manager, test runner, or execution environment.

Run lint, test, and build. All must pass before committing.

**Record a baseline first.** Before starting work, run the full gate once on the unmodified codebase and record which tests/lint errors already exist. Your changes must introduce **zero new failures**: everything your task touches must be green before committing.

Pre-existing failures unrelated to your task are **out of scope** — this is an unattended flow, and silently expanding a small fix into a repo-wide repair is scope creep. Do not fix them and do not let them block your commit. Instead, file a GitHub issue for each pre-existing failure (see the deferred-work rule below) and list them in the PR body under a "Pre-existing failures" heading. The one exception: if a baseline failure lives in code your task directly modifies, fix it as part of the task.

---

## Phase 4: Commit

1. Run `git status` and `git diff` to review all changes.
2. Stage all relevant files (never commit `.env`, secrets, or temp files).
3. Write a conventional commit message: `type: concise description` followed by a body explaining *why*.
4. Commit and push to the current branch (or create a new branch named `fix/<slug>` or `feat/<slug>`).

---

## Phase 5: Create Pull Request

Use `gh pr create` with:
- A clear title matching the commit message
- A body with: Summary bullets, Test Plan (lint ✅ tests ✅ build ✅), and a Files Changed table
- Reference any related GitHub issues with `Closes #NNN`

---

## Phase 6: Wait 10 minutes, then address code review

> **Assumption:** this phase expects an *automated* reviewer (a code-review bot or agent) on the repo — that's what makes a 10-minute wait meaningful. If the repo has only human reviewers, skip the fixed wait: check once for comments, and if there are none, either schedule a longer self check-in (if your harness supports scheduled wake-ups) or end the run and note in the PR body that review feedback will be addressed on request.

1. After `gh pr create` succeeds, wait ~10 minutes before checking for reviews. Use whatever wait mechanism your harness provides: a scheduled wake-up / self check-in tool if available, a background timer, or `sleep 600` in a shell if blocking sleep is permitted. Do not busy-poll the PR in a tight loop.
2. After waking, fetch all review comments:
   ```bash
   gh api repos/{owner}/{repo}/pulls/{PR_NUMBER}/reviews
   gh api repos/{owner}/{repo}/pulls/{PR_NUMBER}/comments
   ```
3. For each inline comment:
   - Evaluate the feedback objectively.
   - If valid: apply the fix, re-run the pre-commit gate, amend the commit or push a new commit, then reply to the comment with `Fixed in <sha>. <one-sentence explanation>`.
   - If invalid/incorrect: reply with a clear technical explanation of why the existing code is correct. Do not change the code.
4. Push the updated branch.

---

## Rules

- **Never ask the user for input** once vibe coding is activated. Make all decisions autonomously.
- **Never skip the pre-commit gate.** If lint/tests/build fail, fix them — do not proceed to commit.
- **Never force-push to main/master.**
- **Never commit secrets or `.env` files.**
- If a code review comment is wrong, reply with a factual rebuttal and do not change the code.
- Mark every tracked task as completed immediately upon finishing it.
- **Any work deferred to a later task must have a GitHub issue created immediately.** If you say "I'll track this separately", "out of scope for this PR", or similar — open a `gh issue create` before moving on. Never defer work without a ticket.
