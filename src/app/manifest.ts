import type { MetadataRoute } from "next";

/// The web app manifest, via Next 16's `app/manifest.ts` metadata convention —
/// served at `/manifest.webmanifest`, and the reason a phone offers "Add to
/// Home Screen" at all. It is deliberately the whole of the PWA story here
/// besides `public/sw.js`: installability, no offline caching (Decision 9) and
/// no push (Decision 8).
///
/// Reachable without a session on purpose. `src/proxy.ts` matches only
/// `/t/:path*` and `/profile`, so this route, the icons, and `sw.js` are all
/// outside it — a browser fetches the manifest before anyone has signed in,
/// and gating it would mean the install prompt never appears.
///
/// The colours are static hex because a manifest cannot express a media query:
/// there is no dark variant of `theme_color`, so both values are taken from the
/// **light** theme in `globals.css`. `manifest.test.ts` redoes that HSL-to-hex
/// conversion and compares, so changing either token there fails the suite here
/// until this file follows.
///
/// The icons were rasterised once from `public/favicon.svg` (the team crest) at
/// authoring time rather than generated at build time, so there is no image
/// toolchain in the build. To redo them after a crest change, render that file
/// with any SVG rasteriser at 192 and 512 square with transparent corners, plus
/// a 512 square with the crest inset to 80% on a `#FAF4E5` ground for the
/// maskable entry, and a 180 square inset to 86% on the same ground for
/// `src/app/apple-icon.png`.
export default function manifest(): MetadataRoute.Manifest {
  return {
    // `id` pins the app's identity independently of `start_url`, so a future
    // change of landing page updates the installed app instead of installing a
    // second copy beside it.
    id: "/",
    name: "Youth Baseball Team Manager",
    // Home-screen labels truncate around a dozen characters on iOS; the full
    // name would read as "Youth Baseb…".
    short_name: "Team Manager",
    description:
      "Schedules, RSVPs, and the batting order for your youth baseball team.",
    // The auth-gated landing page. Opened signed-out, an installed app lands on
    // /signin exactly as the browser does — installing grants no access.
    start_url: "/",
    scope: "/",
    display: "standalone",
    // `--background`, light theme: hsl(42 70% 94%) — the cream paper stock.
    background_color: "#FAF4E5",
    // `--primary`, light theme: hsl(131 39% 30%) — field green, and near enough
    // to the crest's own circle to read as one mark in the task switcher.
    theme_color: "#2F6A3A",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // Android crops this one to its own shape — a circle, a squircle, a
      // teardrop, whichever the launcher uses. Only the centre 80% is
      // guaranteed to survive, which is why the crest is inset on a full-bleed
      // ground rather than filling the square.
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
