# Baseball

<!-- One or two sentences: what this app does, who uses it, what problem it solves.
     Fill this in, then delete this comment. -->

> **Note:** This repository is newly initialized and has no source code yet. Once a
> tech stack and initial code exist, run the [`repo-setup`](.claude/skills/repo-setup/SKILL.md)
> skill to generate a complete, codebase-grounded `AGENTS.md` (Repository Structure,
> Tech Stack, Architecture, Coding Conventions, Setup). The sections below are the
> agentic-config contracts that skills rely on, and should be kept current.

## Commands

<!-- Exact, copy-pasteable commands only — no placeholders. Fill each row once the
     stack exists; delete rows that don't apply and add project-specific ones. Skills
     (vibe-coding, troubleshoot, issue-planner) trust this table over exploring configs. -->

| Purpose | Command |
|---|---|
| Install deps | _TODO_ |
| Dev server | _TODO_ |
| Lint | _TODO_ |
| Typecheck | _TODO_ |
| Test (all) | _TODO_ |
| Build | _TODO_ |

Before committing, lint, tests, and build must all pass.

## Working Rules

### Deferred work always gets a ticket

Any work you identify but defer out of the current change — a refactor you're not doing,
an edge case you're not handling, a pre-existing failure you're not fixing — must have a
GitHub issue created **immediately**, before you move on. If you write "I'll track this
separately", "out of scope", or "in a follow-up", the very next action is creating that
issue and linking it where you deferred the work (PR body, code comment, or review reply).
Never defer work with only a prose note.

## Agentic config

This repo is configured with the [agentic-config](https://github.com/Corneliuses/agentic-config)
standards:

- **Skills** — installed under `.claude/skills/` (10 workflow skills: `app-brainstorm`,
  `code-review-comment`, `codebase-audit`, `finalize-issue`, `issue-planner`,
  `issue-refiner`, `milestone-planner`, `repo-setup`, `troubleshoot`, `vibe-coding`).
- **Permissions** — `.claude/settings.json` pre-approves read-only git/gh and
  lint/test/build commands and denies reads of secret files.
- **PR template** — `.github/pull_request_template.md` (What / Why / How to test).

Update skills later with `npx skills update`.
