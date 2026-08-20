import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The service worker must never be served from a stale cache. Browsers
        // will otherwise reuse a cached copy of this script for up to 24 hours
        // when checking for an update, which is fine while `public/sw.js` is
        // empty and actively harmful the day it grows a push handler: a parent
        // would keep running last week's worker and silently receive nothing.
        //
        // `PwaRegistrar` passes `updateViaCache: "none"` for the same reason.
        // Belt and braces on purpose — the option covers a CDN that ignores the
        // header, the header covers a browser that ignores the option.
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
