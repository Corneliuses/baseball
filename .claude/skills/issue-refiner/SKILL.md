---
name: issue-refiner
description: Refine a GitHub issue by fetching its details, exploring the relevant codebase, asking targeted clarifying questions, and producing an improved title, description, and acceptance criteria — then optionally updating the issue. Improves the ticket's wording only — for a full implementation plan use issue-planner.
license: MIT
---

## What I do

1. Fetch the GitHub issue (number or URL provided by the user) using the `gh` CLI
2. Explore the codebase for relevant files, patterns, and context related to the issue
3. Ask the user targeted clarifying questions to resolve ambiguities
4. Produce a refined issue with:
   - A clear, specific **title**
   - A structured **description** (context, problem statement, proposed solution)
   - Concrete **acceptance criteria** in checklist form
5. Optionally update the issue on GitHub with the refined content

## When to use me

Load this skill when asked to:
- "Refine this issue"
- "Clean up / rewrite this GitHub issue"
- "Add acceptance criteria to issue #123"
- "Make this issue clearer for the dev who picks it up"

## Workflow

### Step 1 — Fetch the issue

Use `gh issue view <number> --json title,body,labels,assignees,comments` to retrieve full issue details.

### Step 2 — Explore the codebase

Search for files and code relevant to the issue's scope. Look for:
- Existing implementations that constrain or inform the solution
- Related tests or specs
- Patterns already established in the codebase that the solution should follow

### Step 3 — Ask clarifying questions

Before writing anything, surface the top 2–4 ambiguities that, if unresolved, would produce a poorly scoped issue. Examples:
- Is this a bug fix or a new capability?
- What edge cases should be explicitly in or out of scope?
- Are there design or architectural constraints to respect?
- Who is the primary user of this feature?

### Step 4 — Produce the refined issue

Output the refined content in this structure:

```
## Title
<refined title>

## Description
### Context
<why this matters / background>

### Problem
<what is broken or missing>

### Proposed Solution
<high-level approach, not implementation detail>

## Acceptance Criteria
- [ ] <specific, testable criterion>
- [ ] <specific, testable criterion>
- [ ] ...

## Out of Scope
- <anything explicitly excluded>
```

### Step 5 — Update (optional)

Ask the user: "Shall I update the issue on GitHub with this content?"

If yes, run:
```
gh issue edit <number> --title "<refined title>" --body "<refined body>"
```

## Notes

- Never fabricate technical details not present in the issue or codebase — ask instead
- Keep acceptance criteria testable and specific; avoid vague criteria like "works correctly"
- If the issue is already well-written, say so and suggest only minor improvements
