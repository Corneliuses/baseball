---
name: code-review-comment
description: Address a code review comment on a pull request. Collects file path, line range, and reviewer comment, then proposes a solution and awaits approval before making changes.
license: MIT
---

# Address Code Review Comment

## Overview

Two modes of operation:

1. **Bulk mode** — triggered when the user says they have "github code review comments" (or similar) and provides a PR URL. Fetch all comments via the GitHub CLI, process every comment in one pass, post replies directly to the PR, then present a summary breakdown.
2. **Single mode** — triggered when the user provides an individual comment (file, line, text) without a PR URL. Interactive, proposal-driven, awaits approval before any change.

**Announce at start:** "I'm using the `code-review-comment` skill."

---

## Mode Detection

- If the user's message mentions "github code review comments", "PR comments", "review comments" or similar **and** includes (or follows up with) a GitHub PR URL → use **Bulk mode**.
- Otherwise → use **Single mode**.

---

## Bulk Mode

### Step 1: Fetch all review comments

Use the GitHub CLI to retrieve every review comment on the PR:

```bash
gh api repos/{owner}/{repo}/pulls/{pr_number}/comments --paginate
```

Also fetch general PR review threads (review-level comments, not inline):

```bash
gh pr view {pr_number} --repo {owner}/{repo} --json reviews,comments
```

Parse the results. For each comment record, note:
- `id` — comment ID (needed to post a reply)
- `path` — file path
- `line` / `original_line` — line number
- `body` — reviewer's text
- `user.login` — reviewer handle
- `pull_request_review_id` — to group comments by review

### Step 2: Process each comment

For each comment, perform the same analysis as Single mode Step 3 (read the file at the relevant line range, assess the comment). Determine the outcome for every comment **before** acting on any of them:

- **Outcome A (Fix now)** — valid, in-scope, implement it.
- **Outcome B (Defer)** — valid but out of scope; create a GitHub issue.
- **Outcome C (Invalid/no-op)** — not applicable; reply with explanation, no code change.

### Step 3: Present the full plan for approval

Before making any changes or posting any replies, present a consolidated plan table:

```
| # | File / Line | Reviewer | Comment (truncated) | Outcome | Action |
|---|-------------|----------|---------------------|---------|--------|
| 1 | src/foo.ts:42 | @alice | "This should be..." | A – Fix now | Edit FormInput.tsx |
| 2 | src/bar.ts:10 | @bob   | "Consider extract..." | B – Defer | Create GH issue |
| 3 | src/baz.ts:7  | @alice | "Why not use X..." | C – Invalid | Reply only |
```

Follow the table with a brief narrative for any non-obvious decisions. Then ask:

> "Does this plan look right? I'll implement the fixes, create issues for deferred items, and post replies to all comments in one pass."

Do not make any code changes, create any issues, or post any replies until the user approves.

### Step 4: Execute (after approval)

Work through each comment in order:

#### For Outcome A comments
1. Implement the fix (edit files).
2. Run relevant tests and lint for the affected package.
3. Post a reply to the PR comment using the GitHub CLI. The correct endpoint requires the PR number in the path:
   ```bash
   gh api repos/{owner}/{repo}/pulls/{pr_number}/comments/{comment_id}/replies \
     -f body="<reply text>"
   ```
4. Resolve the thread using the GraphQL API (there is no REST endpoint for resolving threads). First get the thread's node ID:
   ```bash
   gh api graphql -f query='{
     repository(owner: "{owner}", name: "{repo}") {
       pullRequest(number: {pr_number}) {
         reviewThreads(first: 50) {
           nodes { id isResolved comments(first: 1) { nodes { databaseId } } }
         }
       }
     }
   }'
   ```
   Then resolve it:
   ```bash
   gh api graphql -f query='mutation {
     resolveReviewThread(input: { threadId: "{thread_node_id}" }) {
       thread { id isResolved }
     }
   }'
   ```

#### For Outcome B comments
1. Create a GitHub issue capturing the concern:
   ```bash
   gh issue create --repo {owner}/{repo} \
     --title "<concise title>" \
     --body "<description linking back to the PR comment>"
   ```
2. Post a reply to the PR comment referencing the new issue number (using the endpoint above).
3. Resolve the thread using the GraphQL mutation above.

#### For Outcome C comments
1. Post a reply to the PR comment explaining why the current code is correct (using the endpoint above).
2. Resolve the thread using the GraphQL mutation above.
3. No code changes.

### Step 5: Final summary

After all work is complete, present a short breakdown:

```
## Code Review Summary — PR #<number>

### Fixed (Outcome A)
- **src/foo.ts:42** (@alice) — <one-line description of fix>

### Deferred (Outcome B)
- **src/bar.ts:10** (@bob) — <one-line description> → Issue #<number> created

### No action (Outcome C)
- **src/baz.ts:7** (@alice) — <one-line explanation why comment did not apply>

### Recommendations
- <Any broader patterns noticed, e.g. "Several comments touched error handling — consider a follow-up refactor ticket">
```

---

## Single Mode

Use this when the user provides an individual comment without a PR URL.

### Step 1: Collect required inputs

Three pieces of information are required. If any are missing, prompt for them one at a time:

1. **File path** — "Which file does this review comment apply to?"
2. **Line or line range** — "What line or line range does the comment refer to? (e.g. `42` or `42-58`)"
3. **Review comment** — "What is the review comment?"

Do not proceed until all three are collected.

### Step 2: Read the relevant code

- Read the target file centered on the specified line range.
- Include at least 20 lines of surrounding context above and below.
- If the file does not exist or the lines are out of range, report the problem and ask for clarification.

### Step 3: Analyze and determine outcome

#### Outcome A: Fix now

**Review comment**
> Quote the reviewer's comment verbatim.

**Affected code**
`file_path:line` (or `file_path:start-end`)

**Root cause**
1-3 sentences explaining why the current code does not satisfy the reviewer's concern.

**Proposed change**
Describe the concrete change in plain language. Name specific functions, variables, or patterns that will be added, modified, or removed. If there are multiple reasonable approaches, briefly list them and state which you recommend and why.

**Impact**
- Files that will be modified
- Whether tests need updating
- Whether this could affect other callers or behaviors

**Reply to reviewer**
Ready-to-post response (2-4 sentences): acknowledge, state what was changed, thank if appropriate.

---

#### Outcome B: Defer to a work item

**Review comment**
> Quote verbatim.

**Assessment**
1-3 sentences explaining why this is valid but better addressed separately.

**Recommendation**
State what a follow-up work item should cover.

**Reply to reviewer**
Ready-to-post response acknowledging the feedback, explaining deferral, confirming a follow-up will be created.

---

Then ask: "Would you like me to create a GitHub issue for this?"

#### Outcome C: Comment is invalid

**Review comment**
> Quote verbatim.

**Assessment**
1-3 sentences explaining why the comment does not apply. Reference specific code, documentation, or language/framework behavior.

**Reply to reviewer**
Ready-to-post response respectfully explaining why the current code is correct with specific evidence. Never be dismissive.

---

### Step 4: Await approval

After presenting the proposal, ask: "Shall I go ahead?"

- **Outcome A approved** — Implement, run tests and lint, summarize.
- **Outcome B approved** — Create the GitHub issue.
- **Outcome C approved** — No action; user posts the reply.
- **Modifications requested** — Revise and re-present. Do not act until approved.
- **Rejected** — Stop.

**Do not write any code or create any work items until the user explicitly approves.**

### Step 5: Implement (Outcome A only, after approval)

1. Make the proposed edit(s).
2. Run tests for the affected package.
3. Run lint for the affected package.
4. Summarize what was changed and verification results.

---

## Rules (both modes)

- Never make changes, create issues, or post replies before approval.
- Keep proposals concise — focus on the delta, not the entire file.
- If a comment is ambiguous, ask for clarification rather than guessing.
- If a fix requires changes in multiple files, list all of them.
- Follow the project's existing coding standards (style, naming, test patterns).
- Every outcome must include a **Reply to reviewer** — professional, concise, respectful.
- Choose outcomes honestly. Do not default to "fix now" if deferring or pushing back is the right call.
- In bulk mode, post all replies via the GitHub CLI — do not ask the user to copy-paste them.
