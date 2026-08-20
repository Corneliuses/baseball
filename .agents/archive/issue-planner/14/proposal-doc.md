# Proposal — Phase 14: PWA installability (#14)

## Executive Summary

Make the app installable to a phone home screen, the way a parent at a field actually uses
it. Four small pieces: a web app manifest via Next 16's `src/app/manifest.ts` metadata
convention; an icon set rasterized from the existing brand crest (`public/favicon.svg`) so
no new artwork is needed; a deliberately minimal hand-written service worker
(`skipWaiting` + `clients.claim`, **no fetch handler, no caches**) registered by a tiny
client component; and a dismissible add-to-home-screen card on the team home page that
shows Share-sheet instructions on iOS and a real Install button on Chromium.

This follows Decision 9 (hand-written SW, no Serwist/Workbox build step while the app is
changing hourly) and Decision 8 (push deferred — VAPID stays commented out, the
`PushSubscription` model stays unused). The service worker file is the mount point where
the post-MVP push handler lands later. Installability stays an enhancement, never a
prerequisite: every surface renders nothing rather than nagging when it can't help.

## Scope

### In Scope
- `src/app/manifest.ts` — name, short_name, start_url `/`, `display: "standalone"`,
  theme/background colors derived from the light-theme design tokens
- Icon set: `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`,
  `src/app/apple-icon.png` — all rasterized from the existing crest via a one-off script
  (no new dependency)
- `public/sw.js` + `src/app/PwaRegistrar.tsx` (registration with
  `updateViaCache: "none"`) + a no-cache header for `/sw.js` in `next.config.ts`
- `src/components/InstallPrompt.tsx` on the team home page — standalone-aware,
  dismissible, platform-appropriate
- Unit tests for all of the above; a regression assertion that `robots: noindex` is intact

### Out of Scope
- Push notifications, VAPID keys, the `PushSubscription` model (Decision 8, post-MVP)
- Offline caching of any kind (Decision 9 — the only thing Serwist would add)
- Global security headers from the Next PWA guide §8 (unrelated to installability)
- Real-device install verification — an operator task; it stays on the issue checklist

## Acceptance Criteria

1. `src/app/manifest.ts` exists using the Next 16 metadata file convention with name,
   short_name, start_url, display, theme and background colors
2. Icon set at the sizes iOS and Android home screens need (192/512/maskable-512 +
   180 apple-icon); no create-next-app leftovers remain (`public/` already holds only the
   brand `favicon.svg`)
3. A minimal hand-written service worker is registered client-side
4. Parents see an add-to-home-screen affordance (dismissible, hidden once installed)
5. Install verified on real iOS Safari and Android Chrome phones (operator)
6. `robots: noindex` metadata from #1 intact, now pinned by a test
7. `pnpm check` green
8. `pnpm build` green

## Implementation Phases

| Phase | Description | Areas Affected |
|---|---|---|
| 1 | Manifest & icons | `src/app/manifest.ts`, `public/`, `src/app/apple-icon.png` |
| 2 | Service worker & registration | `public/sw.js`, `src/app/PwaRegistrar.tsx`, `src/app/layout.tsx`, `next.config.ts` |
| 3 | Install affordance | `src/components/InstallPrompt.tsx`, `src/app/t/[teamId]/page.tsx` |
| 4 | Verification | tests, `pnpm check`, `pnpm exec next build`, operator device check |

Phases 1–3 are independent of each other and land in one PR; the split is for review
legibility, not risk staging.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| SW script pinned by browser caching when the push handler ships post-MVP | Med | `updateViaCache: "none"` at registration + `Cache-Control: no-cache` header now |
| A future edit makes the SW start caching authed pages (roster data in Cache Storage) | Med | No fetch handler at all + comment in `sw.js` recording the decision |
| `beforeinstallprompt` unsupported (iOS, Firefox) leaves a dead Install button | Low | Affordance renders nothing unless a platform path genuinely applies |
| iOS composites icon transparency onto black | Low | `apple-icon.png` gets a baked solid background; maskable icon gets a solid ground |
| App accidentally becomes indexable alongside children's data | High | No metadata change touches `robots`; regression test pins `index: false, follow: false` |

## Effort Estimate

**Overall:** Small (1–2 days)

| Phase | Estimate |
|---|---|
| 1 — Manifest & icons | 0.5 day |
| 2 — Service worker & registration | 0.25 day |
| 3 — Install affordance | 0.5 day |
| 4 — Verification & tests | 0.25 day (plus operator device check) |

## Next Steps

1. Review and approve this proposal.
2. Follow `task-doc.md` to implement phase by phase.
3. After implementation, finalize with the `finalize-issue` skill (verify AC against the
   PR, archive `.agents/issue-planner/14/`, merge, and close the issue).
