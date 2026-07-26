---
name: codebase-audit
description: Full-repository audit that auto-detects apps/packages, summarizes what each one does (key views, user flows, purpose), then audits for security, code quality, performance, and error handling issues — with severity-rated findings and optional GitHub issue creation. Proactive whole-repo sweep — to diagnose one specific reported error use troubleshoot.
license: MIT
---

# Codebase Audit

## Overview

A comprehensive audit workflow that:

1. **Auto-detects apps/packages** in the repository (monorepo or single-app)
2. **Summarizes each app** — purpose, key views/screens, primary user flows, tech stack
3. **Audits across five dimensions** — Security, Code Quality, Performance, Error Handling
4. **Categorizes findings by severity** — Critical, High, Medium, Low, Info
5. **Presents all findings at once** in a structured table per app
6. **Allows selective issue creation** via numbered list selection
7. **Publishes a full report** as a private GitHub Gist for sharing

**Announce at start:** "I'm using the `codebase-audit` skill."

---

## Step 1: Announce and auto-detect apps

Announce the skill usage.

Scan the repository to identify all apps and packages:

- Check for monorepo indicators in order of precedence:
  - `pnpm-workspace.yaml` — pnpm workspaces
  - `package.json` — npm/yarn workspaces (check `"workspaces"` field)
  - `nx.json` — Nx monorepo
  - `turbo.json` — Turborepo
  - `lerna.json` — Lerna monorepo

- If any monorepo config is found, extract all workspace paths and treat each as a separate app.
- If no monorepo config exists, treat the repository root as a single app.
- For each app/package, determine:
  - **Name** — from `package.json` `"name"` field or directory name
  - **Path** — relative path from repo root
  - **Primary tech stack** — framework (React, Vue, Node, Next.js, etc.), language (TypeScript, JavaScript, Python, etc.), and any distinctive libraries (state management, database ORM, etc.)

Use a read-only explore subagent for this discovery if your harness supports one; otherwise use your search tools directly. Produce a simple list with name, path, and tech stack for each app.

Once discovery completes, present the detected apps to the user in a concise list. Ask: **"I've detected the following apps. Does this look correct?"**

Do not proceed to the functional summary until the user confirms.

---

## Step 2: Functional summary per app

For each detected app, produce a brief functional summary. Use parallel explore subagents (one per app, if the list is long) when available; otherwise explore each app in turn. Determine:

- **Purpose** — 1–2 sentences: What does this app do? Who uses it? What problem does it solve?
- **Key views/screens** — Bullet list of the main pages, routes, or UI sections a user interacts with (e.g., "Dashboard", "Settings", "User Profile", "Admin Panel")
- **Primary user flows** — Bullet list of the main workflows (e.g., "Sign up → Onboard → Create project → Invite team", "Login → Browse inventory → Add to cart → Checkout")
- **Tech stack details** — Framework, primary state management, data persistence layer (API/DB), authentication approach

Present all functional summaries together in a structured format before moving to the audit phase.

---

## Step 3: Audit — Security

Scan for security issues — parallel explore subagents (per app or per feature area) if available, direct search otherwise. Look for:

- **Hardcoded secrets / credentials** — API keys, tokens, passwords, private keys in source code, config files, or comments
- **Injection risks** — SQL injection, NoSQL injection, XSS, command injection, path traversal (check query builders, template usage, dynamic code execution)
- **Authentication / Authorization gaps** — Missing permission checks, role-based access control bypasses, insecure token handling (no expiry, no refresh), session fixation risks
- **Insecure dependencies** — Known CVEs in lock files (check `npm audit`, `yarn audit`, or `pnpm audit` output if available)
- **Sensitive data exposure** — Private fields exposed in API responses, database dumps in logs, unencrypted PII, CORS misconfiguration

---

## Step 4: Audit — Code Quality

Scan for quality issues (same subagents-if-available approach):

- **Dead code / unused exports** — Functions, variables, or modules that are defined but never called
- **Framework anti-patterns** — React: prop drilling, missing keys in loops, inline function definitions in renders; Vue: direct DOM manipulation, missing reactive declarations; general: deeply nested callbacks, mixing imperative/declarative patterns
- **High cyclomatic complexity** — Functions with excessive branching, deeply nested conditionals (threshold: >10 branches or >4 levels of nesting)
- **Inconsistent patterns** — Mixed coding paradigms (OOP + FP without clear separation), naming convention violations, inconsistent error handling strategies
- **Missing or stale documentation** — Public APIs, exported functions, or complex logic without JSDoc comments or README sections; outdated comments that contradict current code

---

## Step 5: Audit — Performance

Scan for performance issues:

- **N+1 query patterns** — Loops that execute queries per iteration instead of batching; missing query aggregation or join logic
- **Unnecessary re-renders / missing memoization** — React: functions defined in props (no `useCallback`), components not wrapped in `React.memo`, expensive inline object/array creation; Vue: reactive properties updated in tight loops
- **Large bundle risks** — Barrel imports (`import * from './utils'`), importing entire libraries for single functions, no tree-shaking, missing code splitting
- **Unbounded data fetches** — Paginated endpoints called without limits, list endpoints that fetch all records instead of paginating, missing `limit` / `offset` parameters
- **Memory leak patterns** — Event listeners registered but never removed, setInterval/setTimeout without cleanup, streams not closed, circular references in long-lived objects

---

## Step 6: Audit — Error Handling

Scan for error handling issues:

- **Empty or swallowing catch blocks** — `catch (e) {}` or catch blocks that log but don't rethrow
- **Missing input validation** — API handlers that don't validate request bodies, form inputs not checked before processing, missing type guards
- **Unhandled promise rejections** — Awaited promises without try/catch, `.then()` chains without `.catch()` handlers
- **Missing error boundaries** — React: no boundary components wrapping subtrees; general: no global error handlers for uncaught exceptions
- **Unsafe type assertions / casts** — `as unknown as Type` patterns, assertions without runtime checks, type guards that don't validate actual data

---

## Step 7: Consolidate and present all findings

After all audit dimensions are complete, consolidate findings from all apps into a single report.

For each app, present findings in a **numbered table** grouped by audit dimension:

```
## App: <app-name>

| #  | Severity | Dimension    | Location            | Finding                          |
|----|----------|--------------|---------------------|----------------------------------|
| 1  | Critical | Security     | src/api/auth.ts:42  | JWT secret hardcoded in source   |
| 2  | High     | Error handling| src/hooks/useData.ts:18 | Empty catch block swallows errors |
| 3  | Medium   | Performance  | src/pages/Dashboard.tsx:55 | Unbounded fetch without pagination |
| 4  | Low      | Code quality | src/utils/helpers.ts:120 | Unused export: formatDate() |
| 5  | Info     | Code quality | src/components/Header.tsx:8 | Missing JSDoc for Header component |
```

Each row must include:

- **#** — unique number for selection
- **Severity** — one of: Critical, High, Medium, Low, Info
  - **Critical**: Exploitable vulnerability, data loss risk, or authentication/authorization bypass
  - **High**: Security vulnerability without immediate exploitability, significant performance issue, or major code smell
  - **Medium**: Important but not urgent (e.g., minor security hardening, moderate performance improvement, code maintainability)
  - **Low**: Nice-to-have improvement, minor bug, or style inconsistency with negligible user impact
  - **Info**: Observation worth recording (missing docs, minor convention drift) — no action required
- **Dimension** — Security, Code quality, Performance, or Error handling
- **Location** — file path and line number (`path/to/file.ts:NN`)
- **Finding** — one-line description of the issue

Order rows by severity (Critical first). Keep numbering continuous across apps so any finding can be referenced by a single number.

---

## Step 8: Selective issue creation

After presenting the findings, ask:

> "Which findings should I create GitHub issues for? Reply with numbers (e.g. `1, 3, 5`), a range (`1-4`), `all critical/high`, `all`, or `none`."

For each selected finding, create an issue via the GitHub CLI:

```bash
gh issue create \
  --title "[<Severity>] <concise finding title>" \
  --label "<bug|security|performance|tech-debt>" \
  --body "..."
```

Each issue body must include:

```markdown
## Finding

<description of the issue and why it matters>

**Severity:** <Critical | High | Medium | Low>
**Dimension:** <Security | Code quality | Performance | Error handling>
**Location:** `path/to/file.ts:NN`

## Evidence

<code snippet of the offending code>

## Suggested Fix

<concrete, plain-language description of the change>
```

Do not create any issue before the user selects the findings. After creation, list each issue number and URL.

---

## Step 9: Publish the full report

Offer to publish the complete audit report (functional summaries + all findings tables) as a **private GitHub Gist** for sharing:

```bash
gh gist create audit-report.md --desc "Codebase audit — <repo> — <date>"
```

Write the report to a temporary markdown file first, create the gist (private by default — never pass `--public`), output the gist URL, then delete the temporary file.

---

## Rules

- Never create issues or gists before the user explicitly opts in.
- Every finding must cite a specific file path and line number — no vague "in several places" findings.
- Report facts, not speculation: if you haven't read the code that confirms an issue, don't list it.
- Severity ratings must follow the definitions above — do not inflate severity.
- Keep the audit read-only: this skill never modifies code. Fixes happen in follow-up work.
