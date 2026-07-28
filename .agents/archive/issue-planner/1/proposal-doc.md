# Proposal — Phase 1: App shell, design system, and mobile-first layout (#1)

## Executive Summary

This phase replaces the create-next-app placeholder with the real application foundation: a shadcn/ui design system with baseball-themed colors, a mobile-first responsive layout, and a public team selector landing page. The landing page shows all teams (read-only for unauthenticated users, clickable for authenticated users). This foundational layer unblocks all subsequent UI work and establishes consistent styling and component patterns for the app.

The work is purely presentational — no auth logic, no mutations, no data model changes. It sets up the visual framework and component library so that issues #2 (Auth) and #3 (Team Scoping) can add features on top without reworking the design system.

## Scope

### In Scope

- Initialize shadcn/ui with Tailwind 4 and baseball-themed design tokens
- Create app shell and page chrome (mobile-first, responsive)
- Build a team selector landing page (`/`)
- Configure LazyMotion for Motion animations
- Update root metadata (title, description, robots rule)
- Write unit tests for components and data queries
- Remove create-next-app placeholder files

### Out of Scope

- Authentication logic (issue #2)
- Team route scoping and access control (issue #3)
- Schedule, roster, or lineup features (later phases)
- Push notifications or messaging (later phases)
- Any dynamic team creation or administration (later phases)

## Acceptance Criteria

1. shadcn/ui initialized with Tailwind 4 and baseball color palette
2. Root layout updated with real metadata and robots rule
3. LazyMotion provider configured for Motion animations
4. Team selector landing page renders all teams with role-based interactivity
5. App chrome (header, layout) responsive and mobile-first
6. All create-next-app SVGs removed
7. All unit tests pass
8. `pnpm check` (lint → typecheck → test) passes
9. `pnpm build` succeeds

## Implementation Phases

| Phase | Description | Areas Affected |
|---|---|---|
| 1 | Design system setup (shadcn/ui, Tailwind theming, LazyMotion) | `components.json`, `tailwind.config.ts`, `src/app/layout.tsx` |
| 2 | Landing page & team selector components | `src/app/page.tsx`, `src/components/`, `src/lib/teams.ts` |
| 3 | Tests, cleanup, verification | `src/**/*.test.ts(x)`, `public/`, all checks |

Phases are sequential because Phase 1 (design system) must complete before Phase 2 (components) can use it, and both must be done before Phase 3 (verification).

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| shadcn/ui incompatibility with Tailwind 4 or React 19 | High | Initialize early and test the build immediately; shadcn/ui officially supports both. |
| Motion animations cause performance issues on low-end devices | Med | Use Tailwind transitions for simple states; Motion only for intentional animations. LazyMotion code-splitting keeps the footprint small. |
| Archived teams appear in the public team selector | Med | Query filters explicitly for `archivedAt: null`; test the query with archived teams. |
| Team links go nowhere before auth is implemented | Low | Expected behavior until #2 and #3 land. Document gracefully. |
| Type mismatches between Prisma schema and React components | Low | Ensure TypeScript strict mode passes; use Prisma-generated types directly. |

## Effort Estimate

**Overall:** Medium (3–5 days)

| Phase | Estimate |
|---|---|
| Phase 1: Design system & tooling | 1 day |
| Phase 2: Landing page & components | 1.5–2 days |
| Phase 3: Tests, cleanup, verification | 0.5–1 day |

The majority of time is in Phase 2 (building and iterating on the team selector UI). Phase 1 is mostly CLI-driven setup. Phase 3 is writing tests and running checks.

## Next Steps

1. Review this proposal — does the vision align? Any changes?
2. Approve, and I'll post this to the GitHub issue as a comment.
3. Follow `task-doc.md` to implement Phase 1, then Phase 2, then Phase 3.
4. After implementation and PR review, use the `finalize-issue` skill to verify, merge, and close.

---

## Technical Context

**Why shadcn/ui?** (Decision 11 in the stack choices)
Components are copied into the repo, not imported from a library. This allows custom styling without fighting a theme — critical for a baseball-themed design system.

**Why LazyMotion?** (Decision 14)
Saves ~28 kB of JavaScript by code-splitting Motion's animations. All pages ship with Tailwind's built-in transitions; only pages that need richer animations load Motion.

**Why baseball theme now?** (Design preference)
Establishing the color palette and component styling now means all future components inherit the aesthetic without extra work. The design system becomes the single source of truth.

**No schema changes.**
The existing `Team` and `Membership` models support the team selector. No migrations needed.
