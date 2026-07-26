---
name: troubleshoot
description: Diagnose and resolve a reported application error or unexpected behaviour. Asks targeted clarifying questions, explores the codebase to find the root cause, proposes a precise multi-file fix plan, and logs a GitHub issue — all before writing a single line of code. Targets one reported error — for a proactive whole-repo sweep use codebase-audit.
license: MIT
---

# Troubleshoot

## Overview

A structured flow for turning a vague error report into a diagnosed root cause, a concrete fix plan, and a logged GitHub issue — without touching code until the user approves.

**Announce at start:** "I'm using the `troubleshoot` skill."

---

## Step 1: Gather context with clarifying questions

Before exploring the codebase, collect the minimum information needed to narrow the search space. Ask **only what you don't already know** from the user's report. Typical questions:

- **What user role or permission level** is the affected user logged in as?
- **Which screen or action** triggers the error? (e.g. specific page, button, form submit)
- **What is the exact error message** (or is it a silent failure / wrong data)?
- **Is it reproducible consistently**, or intermittent?

Use your harness's structured-question tool (multiple-choice prompts) where the options are known. Use plain text for open-ended questions.

Stop asking once you have enough to direct the codebase search. Do not ask for information you can discover by reading the code.

---

## Step 2: Explore the codebase

Use parallel read-only explore subagents if your harness supports them (this keeps the main context lean); otherwise use your search tools directly. Cover:

1. **The error surface** — the component, route handler, or function where the error originates or is most likely thrown.
2. **The auth/permissions layer** — middleware, access control checks, role-based branching, or permission guards relevant to the affected feature.
3. **The data layer** — database queries, ORM calls, API requests, or data transformations for the affected feature.
4. **Existing tests** — test files for the affected component or function, to understand what is already covered.

Whether exploring via subagents or directly, the output of this step is: exact file paths, line numbers, relevant code snippets, and a preliminary analysis of what might be wrong.

---

## Step 3: Deep-read key files

After exploration, read the specific files and line ranges identified as most relevant directly (not via subagents). This gives you precise context for drafting the fix. Read at minimum:

- The file containing the buggy logic
- The auth/permissions layer for the affected feature
- The existing test file for the affected component

---

## Step 4: Diagnose — produce a root cause analysis

Write a concise diagnosis section with this structure:

### Root Cause

1–3 sentences stating exactly **what** is wrong and **why** it causes the observed symptom. Reference specific file paths and line numbers (e.g. `src/components/Inventory.tsx:25`). Avoid hedging — if you have read the code, be definitive.

### Why This Role / Screen

Explain why the error appears for this particular user role and screen, but not others. This validates the clarifying questions collected in Step 1.

### Structural Risk

If the same class of bug exists elsewhere in the codebase (e.g. other components with the same anti-pattern), note it briefly. Do not expand scope — flag it for awareness only.

---

## Step 5: Propose the fix plan

Present a numbered list of concrete changes, one item per file. For each item:

- **File** — path and relevant line range
- **What changes** — plain-language description of the edit
- **Why** — one sentence linking it back to the root cause
- **Code snippet** — show the before/after or the new code (keep it brief — delta only, not the whole file)

Also state explicitly what does **not** need to change, and why, to prevent scope creep.

End the plan with: "Shall I go ahead and implement this, or would you like to log a GitHub issue first?"

---

## Step 6: Log a GitHub issue (if requested)

When the user asks to log an issue (before or instead of implementing), create it via the GitHub CLI:

```bash
gh issue create \
  --title "<concise imperative title describing the bug>" \
  --body "..." \
  --label "bug"
```

The issue body must follow this structure:

```markdown
## Bug

One-paragraph plain-English description of the observed error and when it occurs.

## Root Cause

Explanation of the underlying code problem, with file paths and line numbers.
Include a code snippet of the buggy code.

## Affected Users

- Which roles / screens / actions are affected

## Proposed Fix

### 1. <File name> — <short description>
<before/after code snippet>

### 2. <File name> — <short description>
<code snippet>

... (one section per file)

## Files to Change

- `path/to/file1.tsx`
- `path/to/file2.ts`
```

After the issue is created, output the URL.

---

## Step 7: Implement (after explicit approval)

Only proceed to write code after the user explicitly approves the plan (or approves after seeing the logged issue). Then:

1. Track each file change as a separate item in your task/todo list.
2. Make all edits using your file-editing tools.

#### Discover project commands

Before running any verification, identify the project's commands in this order:

1. **`AGENTS.md`** — look for a `## Commands` section listing test and lint commands
2. **`package.json` scripts** — look for entries named `test`, `lint`, `build`, `check`, etc.
3. **`Makefile`** — look for relevant targets

Use whatever commands the project defines. Never assume a specific package manager or execution environment.

3. Run the tests for the affected area and then run lint.
4. Report the results. If tests or lint fail, fix the issues before declaring done.

---

## Rules

- Never write code or create issues before the plan is presented and the user responds.
- Prefer subagents for initial codebase discovery when your harness supports them — never dump raw grep output into the main context.
- Diagnose definitively. If you've read the code, don't hedge with "might" or "possibly" — state what is wrong.
- Scope fixes tightly. Note related risks but don't fix them unless the user asks.
- Follow all coding standards documented in `AGENTS.md`.
- Every fix **must** ship with updated or new tests.
