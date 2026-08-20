# Task Doc — Phase 14: PWA installability (#14)

## Prerequisites

- [x] #9 (Validation gate) — closed; milestone dependency satisfied
- [x] `pnpm install && pnpm db:generate` (client is gitignored)

## Phase 1: Manifest & Icons

- [x] Generate the icon set from `public/favicon.svg` with a one-off script
      (sharp, already present transitively — nothing added to `package.json`):
      `public/icon-192.png`, `public/icon-512.png` (transparent, purpose `any`),
      `public/icon-maskable-512.png` (crest at 80% safe zone on a cream
      `#FAF4E5` ground), `src/app/apple-icon.png` (180×180, crest at 86% on the
      same ground — iOS composites transparency onto black)
- [x] Add `src/app/manifest.ts` returning `MetadataRoute.Manifest`: name
      "Youth Baseball Team Manager", short_name "Team Manager",
      `start_url: "/"`, `scope: "/"`, `id: "/"`, `display: "standalone"`,
      `background_color` / `theme_color` as exact hex of the light-theme
      `--background` / `--primary` tokens with derivation comments, icons array
      (maskable entry with `purpose: "maskable"`)
- [x] Write unit tests in `src/app/manifest.test.ts` — field assertions, an
      existence check on every icon `src`, and an HSL-to-hex reconversion from
      `globals.css` so the frozen colours cannot drift from their tokens
- [x] **Unplanned:** declare `icons.apple` in `src/app/layout.tsx`. The existing
      `metadata.icons` block was suppressing the file-convention
      apple-touch-icon link outright — see Decision 5 in `design-doc.md`

## Phase 2: Service Worker & Registration

- [x] Write `public/sw.js` by hand: `install` → `skipWaiting()`, `activate` →
      `clients.claim()`; **no fetch handler, no caches**; comment block naming this
      the mount point for the post-MVP push handler (Decision 8) and pointing at
      Decision 9 for why nothing is cached
- [x] Add `src/app/PwaRegistrar.tsx` (`"use client"`, renders null): feature-detect,
      register `/sw.js` with `{ updateViaCache: "none" }`, catch + `console.error`
      on failure
- [x] Render `<PwaRegistrar />` inside `body` in `src/app/layout.tsx`
- [x] Add `headers()` to `next.config.ts`: `/sw.js` → `Cache-Control: no-cache,
      no-store, must-revalidate`
- [x] Write `src/app/PwaRegistrar.test.tsx` (mock `navigator.serviceWorker`)

## Phase 3: Install Affordance

- [x] Add `src/components/InstallPrompt.tsx` (`"use client"`): null when
      `display-mode: standalone` matches, when previously dismissed
      (`localStorage` key), or when neither platform path applies; iOS (UA
      detection, including iPadOS's Macintosh UA) → quiet `Card` with Share →
      "Add to Home Screen" instructions; Chromium → capture
      `beforeinstallprompt`, show Install button calling `prompt()`; dismiss
      persists to `localStorage`; `appinstalled` hides it. Quiet styling — not
      the screen's banana accent
- [x] Render it on the team home page `src/app/t/[teamId]/page.tsx`, below the
      coach contact card rather than above it
- [x] Write `src/components/InstallPrompt.test.tsx` — standalone → null,
      dismissed → null, iOS → instructions, captured event → button,
      dismiss → persists, `appinstalled` → hides

  **Deviation:** the effect cannot set state synchronously — the React Compiler
  lint rule `react-hooks/set-state-in-effect` rejects it. The component uses
  `useSyncExternalStore` for the hydration boundary and reads the platform facts
  at render, so every state write happens in a callback.

- [x] **Post-review:** move the `beforeinstallprompt` capture out of the component
      into `src/components/install-availability.ts`, loaded by `PwaRegistrar` from
      the root layout. The event fires once per document load, so a listener that
      only existed on team home missed it entirely on the normal path (land on `/`,
      sign in, tap through — a client-side navigation). The Install button never
      appeared in the flow everyone actually uses.
- [x] **Post-review:** cap the iOS tip at three showings
      (`ybtm:install-tip-showings`). iOS fires no `appinstalled` and partitions the
      Home Screen app's storage, so a parent who follows the steps leaves no trace
      Safari can read and the card would otherwise reappear forever for exactly the
      people who complied. The count is frozen at mount so the card cannot vanish
      mid-visit.

## Phase 4: Verification

- [x] Confirm `src/app/layout.tsx` still exports `robots: { index: false,
      follow: false }`; pinned in the new `src/app/layout.test.tsx`
- [x] Verified against a production server (`next start`): `/manifest.webmanifest`
      (200, `application/manifest+json`), `/sw.js` (200, `Cache-Control: no-cache,
      no-store, must-revalidate`), all three icons and `/apple-icon.png` (200),
      every one of them **without a session**; `/t/team-1` still 307s to
      `/signin`; the rendered `<head>` carries the manifest link, the
      apple-touch-icon link, and `noindex, nofollow`
- [ ] Manual (operator, real phones): install on iOS Safari and Android Chrome;
      check icon, name, standalone display
- [ ] **Blocking, iOS:** after installing, open the Home Screen app and confirm it is
      still signed in. If it is signed out, request a magic link from inside it — the
      link opens in Safari, and if the app stays signed out afterwards then installing
      strands a parent in an app they cannot sign into. Raised in review, unverified,
      and the reason the iOS branch of `InstallPrompt` is provisional. Remedy if
      confirmed: an emailed sign-in code rather than a link (an auth change, not a PWA
      one), designed in #60 — or drop the iOS tip until that exists. Close #60 without
      action if the app comes up signed in.

## Pre-Commit Gate

Commands from `AGENTS.md` §Commands:

- [x] `pnpm check` (lint → typecheck → test) ✅ — 1013 tests, 78 files
- [x] `pnpm exec next build` ✅ (documented substitute for `pnpm build`, which
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
| `src/app/layout.tsx` | Render `<PwaRegistrar />`; declare `icons.apple`; note why noindex stays |
| `src/app/layout.test.tsx` | **New** — pins noindex and the apple-icon declaration |
| `AGENTS.md` | Gotchas: file-convention icons off when `icons` is declared, why `sw.js` caches nothing, the unverified iOS storage-partition risk, and static test imports |
| `next.config.ts` | `headers()` — no-cache for `/sw.js` |
| `src/components/InstallPrompt.tsx` | **New** — add-to-home-screen affordance |
| `src/components/install-availability.ts` | **New** — module-scope store for the install event |
| `src/components/InstallPrompt.test.tsx` | **New** — affordance tests |
| `src/app/t/[teamId]/page.tsx` | Render `<InstallPrompt />` |
