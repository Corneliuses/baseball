# Task Doc — Phase 1: App shell, design system, and mobile-first layout (#1)

## Prerequisites

- [ ] Node 22 and pnpm 10 installed
- [ ] `pnpm install` completed
- [ ] `pnpm db:generate` completed
- [ ] `.env` configured with `DATABASE_URL` and `AUTH_SECRET`

## Phase 1: Design System & Tooling

- [ ] Install shadcn/ui CLI and initialize: `npx shadcn-ui@latest init`
  - Choose Tailwind 4 CSS as the CSS framework
  - Customize the alias path to `@/components`
  - Create `components.json` at the project root
  - Generate `src/components/ui/` directory with base utilities (`cn.ts`)

- [ ] Add baseball-themed design tokens to `tailwind.config.ts`
  - Define color palette: diamond green (#2d5016), field brown (#8b6914), sky blue (#1e3a8a), warning red (#dc2626)
  - Add custom CSS variables to the Tailwind theme
  - Keep the Geist font family for now; customize later if needed

- [ ] Add core shadcn/ui components needed for the team selector:
  - `npx shadcn-ui@latest add card`
  - `npx shadcn-ui@latest add button`
  - `npx shadcn-ui@latest add container` (or use a custom PageContainer component)

- [ ] Create `src/components/layout/PageContainer.tsx`
  - Responsive mobile-first wrapper for page content
  - Includes header with app branding and auth status indicator
  - Use Tailwind 4 for responsive breakpoints (sm, md, lg)
  - Export as named export

- [ ] Configure LazyMotion provider in `src/app/layout.tsx`
  - Import `LazyMotion`, `m`, and `domAnimation` from 'motion'
  - Wrap children with `<LazyMotion features={domAnimation}>` 
  - Document the import pattern (use `m.*` not `motion.*`)

## Phase 2: Landing Page & Team Selector

- [ ] Create data loading functions in `src/lib/teams.ts`
  - `export async function getPublicTeams()` — fetch all non-archived teams
  - `export async function getUserTeams(userId: string)` — fetch teams where user is a member (via Membership join)
  - Keep functions pure and simple; no server action logic yet

- [ ] Create `src/components/TeamCard.tsx`
  - Display team name, season, and `allPlay` setting
  - Accept an `isClickable` prop (true for authenticated user's teams, false for read-only)
  - Use shadcn Card and Button components
  - Use link to `/t/[teamId]` if clickable, plain card if read-only

- [ ] Create `src/components/TeamSelector.tsx`
  - Accept `teams: Team[]` and `userTeamIds?: string[]` props
  - Map teams to TeamCards, passing `isClickable={userTeamIds?.includes(team.id)}`
  - Show intro text explaining the app's purpose
  - Handle empty state ("No teams available yet")

- [ ] Replace `src/app/page.tsx` with the real landing page
  - Fetch public teams and user's teams (if authenticated)
  - Call `<TeamSelector>` component with the data
  - Add Next.js metadata: title, description, other SEO tags
  - Wrap in `<PageContainer>`

- [ ] Update `src/app/layout.tsx` metadata
  - Set `title: "Youth Baseball Team Manager"`
  - Set `description: "Manage your youth baseball team's roster, schedule, and lineup"`
  - Add `robots: { index: false, follow: false }` (app stores children's names; keep out of search)
  - Keep the Geist font configuration
  - Add LazyMotion provider as described above

## Phase 3: Cleanup & Verification

- [ ] Delete unused create-next-app SVGs from `public/`:
  - `public/file.svg`
  - `public/globe.svg`
  - `public/next.svg`
  - `public/vercel.svg`
  - `public/window.svg`

- [ ] Write tests:
  - `src/lib/teams.test.ts` — unit tests for `getPublicTeams()` and `getUserTeams()` (mock Prisma)
  - `src/components/TeamCard.test.tsx` — test rendering and clickability
  - `src/components/TeamSelector.test.tsx` — test team list and empty state
  - `src/app/page.test.tsx` — test page renders teams (mock data loading)

- [ ] Verify TypeScript strict mode
  - Run `pnpm typecheck` — must have zero errors
  - Ensure all components are properly typed

- [ ] Verify lint
  - Run `pnpm lint` — must have zero errors

- [ ] Verify tests
  - Run `pnpm test` — all tests must pass
  - Include at least one test per component

## Pre-Commit Gate

Run all checks before committing:

- [ ] Lint: `pnpm lint` ✅
- [ ] Typecheck: `pnpm typecheck` ✅
- [ ] Tests: `pnpm test` ✅
- [ ] Build: `pnpm build` ✅

All four must pass.

## Files Modified / Created

| File | Change |
|---|---|
| `components.json` | Created by shadcn CLI |
| `tailwind.config.ts` | Extended with baseball theme colors |
| `src/app/layout.tsx` | Updated metadata, added LazyMotion provider |
| `src/app/page.tsx` | Replaced placeholder with team selector page |
| `src/components/layout/PageContainer.tsx` | Created — mobile-first page chrome |
| `src/components/TeamCard.tsx` | Created — individual team card |
| `src/components/TeamSelector.tsx` | Created — team grid and layout |
| `src/lib/teams.ts` | Created — data loading functions |
| `src/lib/teams.test.ts` | Created — unit tests for queries |
| `src/components/TeamCard.test.tsx` | Created — component unit tests |
| `src/components/TeamSelector.test.tsx` | Created — component unit tests |
| `src/app/page.test.tsx` | Created — page unit tests |
| `public/file.svg` | Deleted |
| `public/globe.svg` | Deleted |
| `public/next.svg` | Deleted |
| `public/vercel.svg` | Deleted |
| `public/window.svg` | Deleted |
