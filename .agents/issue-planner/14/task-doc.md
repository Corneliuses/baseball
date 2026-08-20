# Task Doc — Phase 14: PWA installability (#14)

## Prerequisites

- [x] #9 (Validation gate) — closed; milestone dependency satisfied
- [x] `pnpm install && pnpm db:generate` (client is gitignored)

## Phase 1: Manifest & Icons

- [ ] Generate the icon set from `public/favicon.svg` with a one-off script (e.g.
      `pnpm dlx` + sharp/resvg — no dependency added to `package.json`):
      `public/icon-192.png`, `public/icon-512.png` (transparent, purpose `any`),
      `public/icon-maskable-512.png` (crest at ~80% safe zone on solid `#2F6A3A`),
      `src/app/apple-icon.png` (180×180, solid background — iOS composites
      transparency onto black)
- [ ] Add `src/app/manifest.ts` returning `MetadataRoute.Manifest`: name
      "Youth Baseball Team Manager", short_name (fits under a home-screen icon —
      "Team Manager"), `start_url: "/"`, `display: "standalone"`,
      `background_color` / `theme_color` as exact hex of the light-theme
      `--background` / `--primary` tokens with derivation comments, icons array
      referencing the four files above (maskable entry with `purpose: "maskable"`)
- [ ] Write unit tests in `src/app/manifest.test.ts` — field assertions plus an
      existence check on every icon `src`

## Phase 2: Service Worker & Registration

- [ ] Write `public/sw.js` by hand: `install` → `skipWaiting()`, `activate` →
      `clients.claim()`; **no fetch handler, no caches**; comment block naming this
      the mount point for the post-MVP push handler (Decision 8) and pointing at
      Decision 9 for why nothing is cached
- [ ] Add `src/app/PwaRegistrar.tsx` (`"use client"`, renders null): feature-detect,
      register `/sw.js` with `{ updateViaCache: "none" }`, catch + `console.error`
      on failure
- [ ] Render `<PwaRegistrar />` inside `body` in `src/app/layout.tsx`
- [ ] Add `headers()` to `next.config.ts`: `/sw.js` → `Cache-Control: no-cache,
      no-store, must-revalidate`
- [ ] Write `src/app/PwaRegistrar.test.tsx` (mock `navigator.serviceWorker`)

## Phase 3: Install Affordance

- [ ] Add `src/components/InstallPrompt.tsx` (`"use client"`): null when
      `display-mode: standalone` matches, when previously dismissed
      (`localStorage` key), or when neither platform path applies; iOS (UA
      detection) → quiet `Card` with Share → "Add to Home Screen" instructions;
      Chromium → capture `beforeinstallprompt`, show Install button calling
      `prompt()`; dismiss button persists to `localStorage`. Quiet styling —
      not the screen's banana accent
- [ ] Render it on the team home page `src/app/t/[teamId]/page.tsx`
- [ ] Write `src/components/InstallPrompt.test.tsx` — standalone → null,
      dismissed → null, iOS → instructions, captured event → button,
      dismiss → persists

## Phase 4: Verification

- [ ] Confirm `src/app/layout.tsx` still exports `robots: { index: false,
      follow: false }` and add the regression assertion to an existing test file
- [ ] Manual (operator, real phones): install on iOS Safari and Android Chrome;
      check icon, name, standalone display; confirm `/manifest.webmanifest`,
      `/sw.js`, and icons load without a session

## Pre-Commit Gate

Commands from `AGENTS.md` §Commands:

- [ ] `pnpm check` (lint → typecheck → test) ✅
- [ ] `pnpm exec next build` ✅ (documented substitute for `pnpm build`, which
      needs `DATABASE_URL` for the migrate step)

## Files Modified / Created

| File | Change |
|---|---|
| `src/app/manifest.ts` | **New** — web app manifest (Next 16 metadata convention) |
| `src/app/manifest.test.ts` | **New** — manifest field + icon-existence tests |
| `public/icon-192.png` | **New** — manifest icon |
| `public/icon-512.png` | **New** — manifest icon |
| `public/icon-maskable-512.png` | **New** — maskable manifest icon |
| `src/app/apple-icon.png` | **New** — iOS home-screen icon (Next file convention) |
| `public/sw.js` | **New** — minimal hand-written service worker |
| `src/app/PwaRegistrar.tsx` | **New** — client-side SW registration, renders null |
| `src/app/PwaRegistrar.test.tsx` | **New** — registration tests |
| `src/app/layout.tsx` | Render `<PwaRegistrar />` |
| `next.config.ts` | `headers()` — no-cache for `/sw.js` |
| `src/components/InstallPrompt.tsx` | **New** — add-to-home-screen affordance |
| `src/components/InstallPrompt.test.tsx` | **New** — affordance tests |
| `src/app/t/[teamId]/page.tsx` | Render `<InstallPrompt />` |
