---
name: finalize-issue
description: Close out a finished ticket. Use when the user provides a PR link and an issue link and wants the work verified and wrapped up — checks every acceptance criterion in the issue against the PR, marks satisfied ones done, warns about gaps, archives issue-planner planning files, refreshes docs, merges the PR when green, and closes the issue.
license: MIT
---

# Finalize Issue

Use this skill to verify that a pull request fully delivers a GitHub issue's acceptance
criteria, then close out the ticket: archive planning artifacts, update documentation,
merge, and close.

This is the closing bookend of the ticket lifecycle:
`issue-refiner` → `issue-planner` → implementation → `code-review-comment` → **`finalize-issue`**.

---

## Inputs

The user provides two links (or numbers):

- **A pull request** — the implementation to verify
- **An issue** — the ticket whose acceptance criteria define "done"

If either is missing or the repo cannot be determined from the links, ask before proceeding.

---

## Workflow

### Step 1 — Fetch the issue and the PR

Via the GitHub CLI (or your GitHub tooling), fetch:

**From the issue:**
- Title and body
- The acceptance criteria — look for checklist items (`- [ ]` / `- [x]`), or sections
  labeled "AC", "Acceptance Criteria", or similar
- Current state (warn and stop if already closed)

**From the PR:**
- Title, body, and current state (warn and stop if already merged or closed)
- The full diff (changed files and their contents)
- Which branch it targets and which branch it comes from
- CI / check status and mergeability

If the issue was planned with `issue-planner`, also read
`.agents/issue-planner/<ISSUE_NUMBER>/` (especially `proposal-doc.md` and `design-doc.md`) —
the confirmed AC list there may be more precise than the issue body. When the two disagree,
treat the planning docs as clarifications of the issue, and flag any outright contradiction
to the user.

If the issue has **no identifiable acceptance criteria**, tell the user and ask them to
confirm what "done" means (or point them at `issue-refiner`) before continuing. Do not
invent criteria.

---

### Step 2 — Verify every acceptance criterion against the PR

For **each** acceptance criterion, one at a time:

1. Restate the criterion in one line.
2. Search the PR diff (and, where the diff alone is inconclusive, the resulting code on the
   PR branch) for concrete evidence that the criterion is satisfied — the implementing
   change, plus tests that exercise the behavior where the criterion is testable.
3. Record a verdict with evidence:

| Verdict | Meaning |
|---|---|
| ✅ Addressed | Clear evidence in the diff — cite the file(s) and what they do |
| ⚠️ Partially addressed | Some evidence, but an aspect of the criterion is missing or untested |
| ❌ Not addressed | No evidence in the PR |

> **Rule:** evidence means pointing at specific changed files or tests. "The PR is probably
> fine" is not a verdict. If you cannot tell from the diff, check out the PR branch and
> inspect or run the code.

Present the full verdict table to the user.

---

### Step 3 — Mark done or warn

**If every criterion is ✅ Addressed:**

- Update the issue so each AC checklist item is checked (`- [x]`), editing the issue body
  via your GitHub tooling. If the AC are prose rather than checkboxes, instead post an
  issue comment with the verdict table confirming each criterion and the evidence.
- Proceed to Step 4.

**If any criterion is ⚠️ or ❌:**

- **Stop.** Warn the user with the verdict table, clearly listing what is unmet and what
  evidence is missing.
- Still check off the criteria that *are* fully addressed, so the issue reflects real progress.
- Ask whether to (a) hold while the gaps get fixed in this PR, (b) split the unmet criteria
  into a follow-up issue and finalize anyway, or (c) abort. Do **not** merge or close
  anything until the user decides. If they choose (b), create the follow-up issue before
  continuing.

---

### Step 4 — Archive the planning files

If `.agents/issue-planner/<ISSUE_NUMBER>/` exists (created by the `issue-planner` skill),
archive it rather than deleting it — on the **PR branch**:

```bash
mkdir -p .agents/archive/issue-planner
git mv .agents/issue-planner/<ISSUE_NUMBER> .agents/archive/issue-planner/<ISSUE_NUMBER>
```

If there are no planning files, skip this step silently.

---

### Step 5 — Update documentation if useful

Review what the PR changed and decide whether project documentation needs to catch up.
Update only what the change genuinely affects — do not rewrite docs for their own sake:

- **`README.md`** — new features, changed commands, new setup steps, changed usage examples
- **Agent instruction files** (`AGENTS.md`, `CLAUDE.md`, or equivalent) — new commands,
  changed conventions, new directories or architectural facts an agent would need
- Any other docs the diff makes stale (e.g. API docs, config references)

If nothing needs updating, note that explicitly and move on.

---

### Step 6 — Commit and push to the PR branch

If Steps 4–5 produced changes:

1. Review them with `git status` and `git diff`.
2. Commit with a clear message, e.g. `chore: archive planning docs and update docs for #<ISSUE_NUMBER>`.
3. Push to the PR's branch (never to a different branch).

---

### Step 7 — Merge when green

1. Wait for CI checks on the PR to complete. Use your harness's wait or scheduling
   mechanism, or poll the check status at a reasonable interval — do not busy-poll in a
   tight loop.
2. **If all checks pass** and the PR is mergeable: merge it. Respect the repo's merge
   convention if one is evident (merge commit vs. squash vs. rebase); default to the
   repository's configured default.
3. **If checks fail:** do not merge. Report the failing check(s) and their logs to the
   user. Only attempt a fix if the failure was caused by the commit from Step 6 —
   pre-existing failures on the implementation are the PR author's to resolve.
4. **If the PR has merge conflicts:** report them to the user rather than resolving
   silently, unless the conflict is only in files this skill touched (e.g. the archived
   planning docs), in which case resolve and re-push.

---

### Step 8 — Close the issue

After the merge succeeds:

1. Close the issue as completed, unless the merge already auto-closed it
   (a `Closes #NNN` reference in the PR).
2. Post a closing comment linking the merged PR and summarizing the AC verification,
   e.g. "All acceptance criteria verified and delivered by #<PR_NUMBER>. Planning docs
   archived to `.agents/archive/issue-planner/<ISSUE_NUMBER>/`."
3. Report the final status to the user: merged PR link, closed issue link, and anything
   deferred to follow-ups.

---

## Rules

- **Never merge with unmet acceptance criteria** unless the user has explicitly chosen to
  split them into a follow-up issue — and that issue must exist first.
- **Never invent acceptance criteria.** No AC in the issue or planning docs means the user
  defines "done", not you.
- **Verdicts require evidence** — cite specific files, tests, or behavior for every ✅.
- **Push only to the PR's branch.**
- **Do not force-merge over failing or pending checks.** Green means green.
- If anything unexpected surfaces (PR already merged, issue already closed, diverged
  planning docs), surface it to the user instead of improvising.

---

## Common Pitfalls

| Pitfall | Prevention |
|---|---|
| Rubber-stamping AC from the PR description | Verify against the *diff*, not the author's claims |
| Marking partially-met criteria as done | Partial is ⚠️, and ⚠️ blocks finalization until the user decides |
| Deleting planning docs | Archive to `.agents/archive/issue-planner/` — history is cheap, recovery isn't |
| Merging while CI is still pending | "When green" means completed-and-passing, not "no failures yet" |
| Doc updates that balloon into rewrites | Touch only docs the diff actually made stale |
| Closing the issue before the merge lands | Merge first; the close comment links the merged PR |
