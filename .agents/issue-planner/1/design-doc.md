# Design Doc — Phase 1: App shell, design system, and mobile-first layout (#1)

## Overview

Replace the create-next-app placeholder with a functional application shell featuring the design system (shadcn/ui + Tailwind 4), mobile-first responsive layout, baseball-themed aesthetics, and a public team selector landing page. This foundational work unblocks every subsequent visual feature.

## Acceptance Criteria

- [ ] shadcn/ui initialized with Tailwind 4 and baseball-themed design tokens
- [ ] Root metadata updated (`title`, `description`, `robots: { index: false, follow: false }`)
- [ ] LazyMotion provider configured for Motion animations
- [ ] Real landing page at `/` with a team selector (public read-only view, authenticated users can navigate to their teams)
- [ ] App chrome / page container component for mobile-first responsive design
- [ ] All create-next-app SVGs removed from `public/`
- [ ] `pnpm check` passes (lint → typecheck → test)
- [ ] `pnpm build` succeeds

## Architecture & Data Model

### Data Layer

**Query:** Teams (public listing)
- Fetch all non-archived teams for the landing page
- For authenticated users, additionally load their memberships

**No schema changes needed.** The existing `Team` and `Membership` models suffice.

### API / Service Layer

| Function | Type | Auth | Purpose |
|---|---|---|---|
| `getPublicTeams()` | DB Query | Public | Fetch all non-archived teams |
| `getUserTeams(userId)` | DB Query | Authenticated | Fetch teams where user is a member |

These are simple Prisma queries, not server actions — they're read-only data loading for the page.

### UI Component Tree

```
RootLayout
├── LazyMotion provider
├── PageContainer (mobile-first chrome)
│   ├── Header / Branding
│   └── Children
└── Page: TeamSelector
    ├── Intro text
    ├── Grid of TeamCards
    │   ├── Team name
    │   ├── Season info
    │   └── [Clickable for authenticated users only]
    └── Auth state indicator (login prompt for unauthenticated)
```

## Key Decisions

### Decision 1: shadcn/ui Initialization with Baseball Theming

**Options considered:**
- Option A: Use shadcn/ui out-of-the-box, apply baseball theme later
- Option B: Initialize shadcn/ui with a custom theme root from the start

**Decision:** Option B — initialize with baseball-themed design tokens (colors, typography)

**Rationale:** Decision 11 selected shadcn/ui specifically because components are copied into the repo, enabling custom styling without fighting a library theme. A baseball aesthetic requires themed colors (diamond green, dirt brown, game blue) from component initialization, not post-hoc hacks. We'll establish the palette in `src/components/ui/` and `tailwind.config.ts` now so all future components inherit the right look.

### Decision 2: Landing Page as Team Selector, Not Marketing

**Options considered:**
- Option A: Redirect `/` → sign-in immediately (minimal code, but no public discovery)
- Option B: Show a marketing landing page with call-to-action (more pages to build, marketing-heavy)
- Option C: Show a public team selector (unauthenticated: read-only; authenticated: clickable)

**Decision:** Option C — team selector with role-based interactivity

**Rationale:** Parents browse teams before joining, and the coach sees their team(s) immediately on login. This is the single landing page serving both flows without duplicating content or deferring auth to a separate page.

### Decision 3: App Chrome in Root Layout (not scoped layout)

**Options considered:**
- Option A: Root layout only — all routes share one chrome
- Option B: Scoped layout at `t/[teamId]` — only team routes have navigation
- Option C: Optional component — pages opt into chrome

**Decision:** Option A — root layout

**Rationale:** The header (branding, auth status) should appear on every route, including `/`. Scoped layouts will layer on top for team-specific navigation. This keeps concerns separate: root chrome is global, team chrome is team-scoped.

### Decision 4: LazyMotion with Baseball Animations (not top-level motion)

**Options considered:**
- Option A: Import `motion` directly from 'motion'
- Option B: Use `LazyMotion` + `m` for code-splitting (Decision 14)

**Decision:** Option B — LazyMotion + `m`

**Rationale:** Decision 14 in the stack choices specifies LazyMotion to ship ~6 kB instead of ~34 kB. Motion is expensive; code-splitting it is the standard pattern. Configure the provider at the root so all descendants can use `m`.

## Security & Permissions

**No authentication-gated content on this issue.** The team selector shows:
- **Unauthenticated:** All non-archived teams, read-only (no click)
- **Authenticated:** All their teams (via Membership), clickable

The proxy (Next 16's renamed Middleware) will redirect `/t/[teamId]/*` routes to sign-in when no session exists, protecting scoped routes. This landing page remains accessible before login.

## Error Handling

**Data fetching errors:**
- If the teams query fails, show a graceful error message ("Unable to load teams") rather than a 500.
- This is likely during the static generation phase; log the error and fall back to an empty list (or a cached result if using ISR).

**For now, no server actions or mutations** — this issue is read-only.

## Testing Strategy

| Layer | Test Type | File(s) | Notes |
|---|---|---|---|
| Component | Unit | `src/components/TeamCard.test.tsx` | Render team data, test clickability by role |
| Component | Unit | `src/components/TeamSelector.test.tsx` | Render list, test filtering logic |
| Page | Unit | `src/app/page.test.tsx` | Mock queries, verify page renders |
| Data Query | Unit | `src/lib/teams.test.ts` | Test `getPublicTeams()` and `getUserTeams()` |

Tests are lightweight — no E2E browser tests needed until auth is in place. Use Testing Library for components.

## Config Changes

- [x] Schema / index changes — **none required** (existing Team and Membership models suffice)
- [ ] `components.json` — create via shadcn CLI
- [ ] `tailwind.config.ts` — extend with baseball theme colors
- [ ] Environment variables — **none required**
- [ ] Dependency changes — shadcn/ui components (installed via CLI)

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| Archived teams appear in the selector | Med | Query explicitly filters `archivedAt: null` |
| User clicks team link before auth is implemented | Med | Link goes nowhere (404) until issue #3 lands; graceful fallback |
| Motion animations cause layout shift on slow devices | Low | Tailwind transitions as default; Motion only for intentional reveals and page transitions |
| shadcn/ui components clash with existing Tailwind 4 setup | Low | Use shadcn/ui's Tailwind 4 support; test the build early |
