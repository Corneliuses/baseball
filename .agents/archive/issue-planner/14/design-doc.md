# Design Doc — Phase 14: PWA installability (#14)

## Overview

Make the app installable to a phone home screen: a web app manifest via Next 16's
`app/manifest.ts` metadata convention, a proper icon set derived from the existing brand
crest, a minimal hand-written service worker, and an add-to-home-screen affordance for
parents. No offline caching and no push notifications in this milestone (Decisions 8 & 9).

## Acceptance Criteria

Copied from the issue; none needed clarification, but three carry recorded interpretations
(see Key Decisions).

- [ ] `src/app/manifest.ts` exists using Next 16's metadata file convention — name,
      short_name, start_url, display, theme and background colors
- [ ] Icon set at the sizes required for iOS and Android home screens, replacing the
      create-next-app leftovers (already gone — `public/` holds only `favicon.svg`; the
      task reduces to *producing* the set)
- [ ] Minimal hand-written service worker, registered client-side
- [ ] Add-to-home-screen affordance for parents
- [ ] Install verified on iOS Safari and Android Chrome on a real phone (operator task —
      cannot be done from this environment; see Testing Strategy)
- [ ] `robots: noindex` metadata from #1 still intact after the manifest lands
- [ ] `pnpm check` green
- [ ] `pnpm build` green (requires `DATABASE_URL`; in this environment `pnpm exec next build`
      is the documented substitute)

## Architecture & Data Model

### Data Layer

None. No schema, migration, or query changes. `PushSubscription`
(`prisma/schema.prisma:252-263`) stays unused, and the VAPID variables in `.env.example`
stay commented out.

### API / Service Layer

| Endpoint / Function | Type | Auth | Purpose |
|---|---|---|---|
| `/manifest.webmanifest` | Generated route (from `src/app/manifest.ts`) | Public | Web app manifest |
| `/sw.js` | Static file in `public/` | Public | Minimal service worker |
| `/icon-192.png`, `/icon-512.png`, `/icon-maskable-512.png` | Static files in `public/` | Public | Manifest icons |
| `src/app/apple-icon.png` | Next metadata file convention | Public | iOS home-screen icon (Next emits the `apple-touch-icon` link) |

All of these are outside `proxy.ts`'s matcher (`/t/:path*`, `/profile`) — reachable
unauthenticated, which installability requires. **No proxy change.**

### UI Component Tree

```
src/app/layout.tsx  (server — unchanged apart from rendering the registrar)
└── PwaRegistrar          src/app/PwaRegistrar.tsx        ("use client", renders null)
                          registers /sw.js with { updateViaCache: "none" }

src/app/t/[teamId]/page.tsx  (server — team home)
└── InstallPrompt         src/components/InstallPrompt.tsx ("use client")
                          hidden when standalone or previously dismissed;
                          iOS: Share → "Add to Home Screen" instructions
                          Android/Chrome: button wired to captured beforeinstallprompt
```

Both are leaf client components following the existing pattern (`TeamNav.tsx`,
`Reveal.tsx`): small, `"use client"` at the leaf, server components stay server.

## Key Decisions

### Decision 1: Icon artwork source

**Options considered:**
- Option A: Rasterize the existing `public/favicon.svg` crest to PNG at the required sizes
  with a one-off script; commit the PNGs.
- Option B: Next's dynamic `app/icon.tsx` `ImageResponse` — but it renders JSX, not an
  existing SVG file with `<defs>/<clipPath>`, so the crest would need re-drawing.
- Option C: Commission/draw new artwork.

**Decision:** Option A.
**Rationale:** The crest is already the brand mark, palette-matched to the design plan.
A one-off `pnpm dlx` script (sharp or resvg-js) at authoring time adds **no dependency and
no build step** — consistent with Decision 9's "no build-time toolchain" stance. Committed
PNGs are boring and inspectable.

Sizes: `192×192` and `512×512` (`any` purpose, transparent corners fine — the crest is a
circle), `512×512` maskable (crest scaled to the ~80% safe zone on a solid field-green
ground), and `180×180` `apple-icon.png` on a solid background (iOS composites transparency
onto black).

### Decision 2: What "minimal" means for the service worker

**Options considered:**
- Option A: Truly minimal — `install` handler calling `skipWaiting()`, `activate` handler
  calling `clients.claim()`. No `fetch` handler, no caches.
- Option B: Add a pass-through `fetch` handler "for installability".

**Decision:** Option A.
**Rationale:** Chrome no longer requires a fetch handler for installability, and iOS never
did. An empty pass-through fetch handler adds a network hop on every request for nothing.
No caching also means no stale-cache debugging while the app changes hourly — the exact
risk Decision 9 exists to avoid. The file is the mount point where the post-MVP `push`
handler will land (Decision 8), and says so in a comment.

### Decision 3: Where the install affordance lives and how it behaves

**Options considered:**
- Option A: Dismissible card on the team home page (`/t/[teamId]/page.tsx`).
- Option B: Global banner in the root or team layout, on every page.
- Option C: Item on `/profile`.

**Decision:** Option A.
**Rationale:** Team home is where every parent lands from the invite flow and returns to;
a layout banner nags on every navigation, and `/profile` is somewhere parents rarely go.
Behavior: render nothing when `display-mode: standalone` (already installed) or after
dismissal (`localStorage`, per issue context — installability is an enhancement, never a
prerequisite, so the affordance must be ignorable). On iOS (UA test) show Share →
"Add to Home Screen" instructions — there is no programmatic prompt on iOS, per the Next
docs (§6) which explicitly warn `beforeinstallprompt` is not cross-platform. On
Chromium, capture `beforeinstallprompt` and wire it to an "Install" button; if the event
never fires (already installed, unsupported), render nothing rather than a dead button.
Styling: quiet `Card`, not the screen's one banana accent.

### Decision 4: Manifest colors come from the light-theme tokens

The manifest takes static hex values — it cannot express the dark theme (`prefers-color-scheme`
does not apply to manifests). Use the light values from `globals.css`, converted to hex:
`background_color` from `--background` (`hsl(42 70% 94%)` ≈ `#FAF4E5`), `theme_color` from
`--primary` (`hsl(131 39% 30%)` ≈ `#2F6A3A`, matching the crest's field green). Exact hex
computed at implementation and noted in a comment beside the token each derives from.
`docs/design/design-plan.md` makes no machine-checked claims about manifest colors, so the
drift test is unaffected — but the derivation comment keeps a future token change findable
by grep.

### Decision 5 (found during implementation): declare `icons.apple` explicitly

Not anticipated in planning. `src/app/apple-icon.png` follows Next's file convention and
its route *is* generated, but the `<link rel="apple-touch-icon">` tag was **not** emitted,
because `src/app/layout.tsx` already declares a `metadata.icons` block. Verified against
three production builds: with the `icons` block removed the link appears; with the block
present and no `apple` key it silently does not. The `icon` entries merge with the file
convention, the apple one does not.

**Decision:** keep the file at `src/app/apple-icon.png` *and* declare
`icons.apple` explicitly in the layout.
**Rationale:** either mechanism alone covers the icon if the other is later removed, so
the redundancy is a safety net rather than duplication. The failure mode this avoids is
the worst kind for this project — invisible in CI, invisible on desktop, and visible only
as a screenshot of the page where the crest should be on a parent's iPhone.
`layout.test.tsx` pins the declaration; `manifest.test.ts` pins the file.

### Decision 6: `Cache-Control: no-cache` header for `/sw.js`

Add a `headers()` entry to `next.config.ts` for `/sw.js` per the Next PWA guide (§8), so a
future service worker update (the push handler) is picked up promptly rather than pinned
for 24h by browser SW-script caching heuristics. Registration also passes
`updateViaCache: "none"`. Skip the guide's global security headers — out of this issue's
scope.

## Security & Permissions

- No role checks change. Manifest, icons, and `sw.js` are public by nature and content-free
  (branding only — no team data, no names).
- `start_url: "/"` is the auth-gated landing page: an installed app opened signed-out
  redirects to `/signin` exactly as the browser does today. No bypass introduced.
- The service worker caches nothing, so no roster data ever sits in Cache Storage on a
  shared phone.
- `robots: { index: false, follow: false }` in `src/app/layout.tsx` is untouched; a
  regression test pins it (children's names + guardian contacts must stay out of indexes).

## Error Handling

- `PwaRegistrar`: feature-detect `"serviceWorker" in navigator`; registration failure is
  caught and logged (`console.error`) — the app works identically without a SW, so no UI.
- `InstallPrompt`: every capability it reads (`matchMedia`, `beforeinstallprompt`,
  `localStorage`) is feature-detected; any absence renders nothing. `prompt()` rejection
  (user dismissed the native sheet) is caught and treated as dismissal.

## Testing Strategy

| Layer | Test Type | File(s) | Notes |
|---|---|---|---|
| Manifest | Unit | `src/app/manifest.test.ts` | Import the function; assert name/short_name/start_url/display/colors and that every icon `src` exists in `public/` / `src/app` (pins the icon files) |
| Root metadata | Unit | extend `src/app/page.test.tsx` or layout test | Assert `metadata.robots` still `index: false, follow: false` (AC regression) |
| InstallPrompt | Unit (jsdom) | `src/components/InstallPrompt.test.tsx` | Mock `matchMedia`/UA/`localStorage`: standalone → null, dismissed → null, iOS → instructions, beforeinstallprompt captured → button |
| PwaRegistrar | Unit (jsdom) | `src/app/PwaRegistrar.test.tsx` | Mock `navigator.serviceWorker.register`; asserts path + `updateViaCache: "none"` |
| Real device | Manual — **operator** | — | Install on iOS Safari & Android Chrome on real phones; icon, name, standalone display; this cannot be automated from CI and stays a checkbox for the coach |

## Config Changes

- [ ] Schema / index changes — none
- [ ] Access rule changes — none
- [ ] Environment variables — none (VAPID stays commented out)
- [ ] Dependency changes — none (icon rasterization via one-off `pnpm dlx`, output committed)
- [ ] `next.config.ts` — add `headers()` for `/sw.js` (Cache-Control no-cache)

## Edge Cases & Risks

| Scenario | Impact | Mitigation |
|---|---|---|
| iOS user never installs → would never get push (post-MVP) | Med | Out of scope here, but the reason the affordance exists now and the app never requires install |
| `beforeinstallprompt` never fires (iOS, Firefox, already installed) | Low | Component renders nothing instead of a dead button |
| SW pinned by browser cache when the push handler ships later | Med | `updateViaCache: "none"` + `Cache-Control: no-cache` header now |
| Manifest colors drift from `globals.css` tokens later | Low | Derivation comments beside each hex; drift test itself is unaffected |
| A future SW accidentally starts caching authed pages | Med | Comment block in `sw.js` stating the no-cache decision and pointing at Decision 9 |
| `apple-icon.png` transparency composited onto black by iOS | Low | Bake a solid background into that file |
