---
name: repo-setup
description: Generate an effective repo-specific AGENTS.md for a new project. Explores the codebase, migrates any existing instruction files (CLAUDE.md, Cursor rules, Copilot instructions), asks targeted clarifying questions, drafts the file, and writes it only after explicit approval.
license: MIT
---

# Repo Setup

## Overview

A structured workflow for producing a high-quality `AGENTS.md` tailored to the specific
repository — grounded entirely in what actually exists in the codebase, not generic templates.

**Announce at start:** "I'm using the `repo-setup` skill."

---

## Step 1: Check for existing instruction files

Before any exploration, scan the project root for existing instruction sources:

| File / Path | Action if found |
|---|---|
| `AGENTS.md` | Improve in place — do not replace wholesale |
| `CLAUDE.md` | Migrate content, offer to delete afterward |
| `.cursor/rules/*.md` | Extract project-specific rules, incorporate |
| `.github/copilot-instructions.md` | Extract project-specific rules, incorporate |
| `README.md` | Read to understand scope — reference it, do not duplicate it |

Report what was found:

> "Found: `CLAUDE.md`, `.cursor/rules/main.md`. I'll migrate their project-specific content
> into `AGENTS.md` and discard any generic boilerplate."

If `AGENTS.md` already exists, clearly state:

> "`AGENTS.md` already exists. I'll improve it in place and show you a diff before writing."

---

## Step 2: Explore the codebase

Use parallel read-only explore subagents if your harness supports them — one per concern
listed below — otherwise work through the concerns with your search tools directly. Never
dump raw grep/glob output into the main context; summarize findings.

Each concern should yield: exact file paths, exact command strings, factual observations —
no recommendations, no assumptions.

### Agent A — Repository structure

Discover:
- Monorepo vs single app (check `pnpm-workspace.yaml`, `turbo.json`, `nx.json`,
  `lerna.json`, `package.json#workspaces`)
- Top-level directory layout and the purpose of each major folder
- Key entry points (`main`, `index`, `app`, `server`, `cmd/`, etc.)
- Whether the project has a `docs/` or `wiki/` with architectural notes

### Agent B — Build system and commands

Discover (in this priority order):
1. `package.json` → `scripts` block — capture every script name and its exact command
2. `Makefile` → all targets with their commands
3. `turbo.json` / `nx.json` / `pnpm-workspace.yaml` — pipeline structure
4. `Dockerfile` / `docker-compose.yml` — any service commands relevant to dev workflow
5. Framework config files: `next.config.*`, `vite.config.*`, `astro.config.*`,
   `svelte.config.*`, `remix.config.*`, `angular.json`, `webpack.config.*`
6. Language-specific manifests: `pyproject.toml`, `setup.py`, `Cargo.toml`, `go.mod`,
   `Gemfile`, `mix.exs`

Return the exact, copy-pasteable command for each of: dev server, build, lint, type-check,
test (unit), test (integration/e2e if separate), and any deploy or seed commands.

### Agent C — Tech stack and tooling

Discover:
- Primary language(s) and version constraints (`.nvmrc`, `.tool-versions`, `engines` in
  `package.json`, `python-version`, `rust-toolchain`, etc.)
- Framework and its version
- Test runner and assertion library
- Linter (ESLint config files, `biome.json`, `.pylintrc`, `clippy.toml`, etc.)
- Formatter (`.prettierrc*`, `biome.json`, `black` config, `rustfmt.toml`, etc.)
- Type checker (`tsconfig.json` — note `strict`, `paths`, `baseUrl`; `mypy.ini`, etc.)
- Notable runtime dependencies (state management, ORM, auth, HTTP client, etc.)
- CI system (`.github/workflows/`, `.circleci/`, `Jenkinsfile`, `.gitlab-ci.yml`)

### Agent D — Coding conventions

Discover patterns by reading 3–5 representative source files:
- Named vs default exports
- File and directory naming style (camelCase, kebab-case, PascalCase)
- Import ordering and aliasing (path aliases from `tsconfig` / `vite` / `webpack`)
- Co-location patterns (are tests next to source files, or in a separate `__tests__` dir?)
- Component/function structure patterns (hooks before render, barrel files, etc.)
- Any project-specific type or utility patterns that repeat across files

### Agent E — Setup and environment

Discover:
- `.env.example` — list every variable and its purpose if comments exist
- `docker-compose.yml` — required services (databases, queues, etc.)
- README setup section — any manual steps already documented
- Prerequisite tools mentioned in any config or docs
- Seed / migration commands

---

## Step 3: Ask targeted clarifying questions

After the explore phase, ask **only** questions whose answers cannot be discovered by
reading the code. Cap at **5 questions per round**, then block and wait before continuing.

Common high-value questions:

- **Purpose**: "In one sentence, what does this application do and who uses it?"
- **Invisible conventions**: "Are there coding conventions the team follows that aren't
  visible from the code itself? (e.g. 'always use named exports', 'no `any` casts')"
- **Gotchas**: "Is there anything that trips up a new developer or a fresh agent session
  that isn't documented anywhere? (e.g. 'you must seed the DB before running tests')"
- **Off-limits**: "Are there files, directories, or patterns an agent should never touch
  or modify without explicit instruction?"
- **Check workflow**: "Is there a preferred way to run verification? (e.g. 'always run
  checks inside Docker', 'use `make check` not individual commands')"

Do not ask about anything already answered by Step 2. Do not ask generic questions like
"tell me about your architecture" — ask targeted, specific questions.

---

## Step 4: Merge existing instruction sources

For each instruction file found in Step 1:

1. Read the full file content
2. Identify content that is **project-specific** (keep) vs **generic boilerplate** (discard)
   - Keep: specific file paths, team conventions, architectural decisions, named commands
   - Discard: generic advice like "write good commit messages", "follow best practices"
3. Map each kept rule to the appropriate section of the new `AGENTS.md`
4. Note any contradictions between existing sources — flag them to the user

Announce the plan before writing:

> "From `CLAUDE.md` I'll carry over: the database index requirement, the Docker test
> workflow, and the admin-role scoping rule. I'll discard 3 generic items that add no
> project-specific value."

---

## Step 5: Draft `AGENTS.md`

Produce the full file content following this structure. Each section has rules about what
belongs in it — enforce them strictly.

```markdown
# <Project Name>

<1–2 sentences: what the app does, who uses it, what problem it solves. Never vague.>

## Repository Structure

<Annotated directory tree — only directories, not files. One-line annotation per entry.
Only include directories that are non-obvious from their name alone.>

\`\`\`
project-root/
├── src/          # Application source — React frontend
├── functions/    # Firebase Cloud Functions
├── packages/     # Shared libraries (monorepo)
│   ├── ui/       # Design system components
│   └── core/     # Shared business logic
├── infra/        # Infrastructure-as-code (SST / CDK / Terraform)
└── docs/         # Architecture decision records
\`\`\`

## Tech Stack

<Bullet list — one line per layer. Include versions only if they meaningfully constrain
behavior (e.g. React 18 vs 19, Node 20 vs 22). No paragraphs.>

- **Language**: TypeScript 5, strict mode
- **Framework**: Next.js 15 (App Router)
- **Database**: Firestore via Firebase Admin SDK
- **Auth**: Firebase Auth (custom claims for RBAC)
- **Testing**: Vitest + React Testing Library
- **Lint / Format**: ESLint + Prettier

## Commands

<Exact, copy-pasteable commands only. No placeholders. Include the working directory if
it is not the repo root.>

| Purpose | Command |
|---|---|
| Dev server | `pnpm dev` |
| Build | `pnpm build` |
| Lint | `pnpm lint` |
| Type check | `pnpm typecheck` |
| Unit tests | `pnpm test` |
| All checks | `pnpm check` |

<If commands must be run in a specific order or environment, say so explicitly:>

> Run all checks inside Docker: `docker compose run --rm app sh -c "pnpm check"`

## Architecture

<Only document what is non-obvious from the directory names alone. Focus on: data flows,
service boundaries, key patterns, and decisions that constrain future work. If the
architecture is obvious from the structure, keep this section very short.>

## Coding Conventions

<Only document conventions that differ from the framework/language defaults, or that the
team enforces but are not captured in lint config. Be specific and actionable.>

- Named exports only — no default exports anywhere in the codebase
- Co-locate tests: `Component.test.tsx` lives next to `Component.tsx`
- Path alias `@/` resolves to `src/` — use it for all non-relative imports
- ...

## Setup & Prerequisites

<Exact steps for a developer or agent to get a working local environment from a fresh
clone. Include every required tool, env var, and manual step. Reference `.env.example`
if it exists. If a step is already well-documented in README, link to it instead.>

## Gotchas & Notes

<Anything that is not obvious and would trip up an agent or new developer. Use bullet
points. Be specific.>

- ...
```

### Section quality rules

| Section | Include | Exclude |
|---|---|---|
| Repository Structure | Non-obvious directories only | Individual files, obvious dirs like `node_modules/` |
| Tech Stack | Stack with versions where relevant | Installation instructions |
| Commands | Exact commands, working directory if non-root | "See README for details" |
| Architecture | Non-obvious patterns and constraints | Obvious things like "it's an MVC app" |
| Coding Conventions | Deviations from framework defaults | Generic advice ("write clean code") |
| Setup | Every required step from clean clone | Steps already well-documented in README |
| Gotchas | Specific surprises, non-obvious deps | Things the lint/type-checker would catch |

---

## Step 6: Present draft and get approval

Output the full draft in a code block. Then state:

- How many sections were populated vs left minimal
- Which content came from migrated instruction files
- If `AGENTS.md` already existed: describe the changes as a plain-language diff

Then ask:

> "Does this look right? Any sections to add, remove, or adjust before I write the file?"

**Do not write any file until the user explicitly approves.**
If the user requests changes, revise the draft and re-present. Do not write mid-iteration.

---

## Step 7: Write the file

After approval:

1. Write `AGENTS.md` to the project root.
2. Confirm: "Written to `AGENTS.md`."
3. If a `CLAUDE.md` existed and all its content has been fully migrated, ask:
   > "All content from `CLAUDE.md` has been incorporated. Want me to delete it to avoid
   > duplication? Harnesses that support the AGENTS.md standard will pick it up
   > automatically." (Only offer this if the user's harness reads `AGENTS.md`; if they
   > rely on Claude Code versions that only read `CLAUDE.md`, suggest making `CLAUDE.md`
   > a one-line pointer to `AGENTS.md` instead of deleting it.)
4. If `.cursor/rules/` or `.github/copilot-instructions.md` content was incorporated,
   note that those files still serve their respective tools and should be kept unless the
   user actively switches away from them.

---

## Rules

- **Never write the file before explicit user approval.**
- Never duplicate content already in `README.md` — reference it with a path instead.
- Commands must be exact and copy-pasteable — no placeholders like `<your-command>`.
- The Architecture section must only cover what is non-obvious from directory names alone.
  If everything is obvious, write: `## Architecture\n\nSee repository structure above.`
- The Conventions section must only cover deviations from framework defaults or
  conventions not captured by lint. Never include generic advice.
- If `AGENTS.md` already exists, always describe changes before writing — never silently
  overwrite.
- Prefer subagents for codebase discovery when your harness supports them — never dump
  raw grep output into the main context.
- If the repository is empty or near-empty (no source files beyond config), say so and
  ask the user to describe their intended stack before proceeding.
